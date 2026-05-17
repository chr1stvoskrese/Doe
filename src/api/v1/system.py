from fastapi import APIRouter, HTTPException, status, UploadFile, File, Depends  # Добавили Depends
from sqlalchemy.ext.asyncio import AsyncSession # Добавили
from src.db.database import get_session # Добавили
from src.services.task_service import cleanup_orphaned_attachments # Добавили
from pydantic import BaseModel
from typing import Optional
import os
import sys
import subprocess
import re
from pathlib import Path
import shutil
import webbrowser # <--- Добавили для открытия веб-ссылок
import urllib.parse # <--- Для работы с file://
from src.core.config import get_vault_history, remove_vault_from_history, reorder_vault_history, relink_vault_history

from urllib.parse import unquote

from src.db.database import switch_vault
from src.core.config import get_active_vault, get_ui_settings, set_ui_settings, get_attachments_dir

router = APIRouter(prefix="/system", tags=["system"])

# Очередь для передачи событий от ОС к фронтенду
pending_highlights = []

class HighlightReq(BaseModel):
    task_id: int

@router.post("/highlight-task")
async def trigger_highlight(req: HighlightReq):
    pending_highlights.append(req.task_id)
    return {"success": True}

@router.get("/pending-highlights")
async def get_pending_highlights():
    if pending_highlights:
        return {"task_id": pending_highlights.pop(0)}
    return {"task_id": None}

class VaultResponse(BaseModel):
    name: Optional[str] = None
    path: Optional[str] = None
    canceled: bool = False

@router.get("/vault", response_model=VaultResponse)
async def get_vault():
    path = get_active_vault()
    name = Path(path).resolve().name
    return VaultResponse(name=name, path=path)

class ReorderHistoryReq(BaseModel):
    ordered_paths: list[str]

@router.post("/vault/history/reorder")
async def reorder_vault_history_endpoint(req: ReorderHistoryReq):
    reorder_vault_history(req.ordered_paths)
    return {"success": True}

class SwitchVaultRequest(BaseModel):
    new_path: str

@router.post("/vault/switch", response_model=VaultResponse)
async def switch_vault_endpoint(req: SwitchVaultRequest):
    new_path = req.new_path
    if not new_path:
        return VaultResponse(canceled=True)

    # --- ПРОВЕРКА ВАЛИДНОСТИ ХРАНИЛИЩА ---
    # Хранилище = папка, в которой есть хотя бы один '*.db' файл
    # (исключаем '*.backup.db' — это аварийный бэкап, не основная БД).
    # Так корректно распознаётся и старый формат (board.db),
    # и новый ({имя_папки}.db), и случай переименования папки.
    vault_dir = Path(new_path)
    if not vault_dir.exists() or not vault_dir.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="INVALID_VAULT"
        )

    has_db = any(
        f for f in vault_dir.glob("*.db")
        if not f.name.endswith(".backup.db")
    )
    if not has_db:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="INVALID_VAULT"
        )
    # -------------------------------------

    await switch_vault(new_path)
    name = Path(new_path).resolve().name
    return VaultResponse(name=name, path=new_path, canceled=False)

class CreateVaultRequest(BaseModel):
    parent_path: str
    name: str

@router.post("/vault/create", response_model=VaultResponse)
async def create_vault_endpoint(req: CreateVaultRequest):
    if not req.parent_path or not req.name:
        return VaultResponse(canceled=True)
        
    # Склеиваем родительскую папку (например, ~/Documents) и имя хранилища (DoeProject)
    new_path = os.path.join(req.parent_path, req.name)
    
    # switch_vault автоматически создаст нужную папку с помощью exist_ok=True
    await switch_vault(new_path)
    
    name = Path(new_path).resolve().name
    return VaultResponse(name=name, path=new_path, canceled=False)

class SettingsUpdate(BaseModel):
    theme: Optional[str] = None
    language: Optional[str] = None
    active_workspace_id: Optional[int] = None
    global_attachments_path: Optional[str] = None
    reset_attachments: Optional[bool] = False

class SettingsResponse(BaseModel):
    theme: str
    language: str
    active_workspace_id: Optional[int] = None
    global_attachments_path: Optional[str] = None

@router.get("/settings", response_model=SettingsResponse)
async def get_settings_endpoint():
    return SettingsResponse(**get_ui_settings())

from src.db.models import TaskModel
from sqlalchemy import select
from urllib.parse import unquote
import re

@router.put("/settings", response_model=SettingsResponse)
async def update_settings_endpoint(settings: SettingsUpdate, db: AsyncSession = Depends(get_session)):
    # 1. Запоминаем СТАРУЮ папку вложений и её тип
    old_att_dir = get_attachments_dir()
    old_settings = get_ui_settings()
    was_global = bool(old_settings.get("global_attachments_path"))

    # 2. Применяем новые настройки
    set_ui_settings(
        theme=settings.theme, 
        language=settings.language,
        active_workspace_id=settings.active_workspace_id,
        global_attachments_path=settings.global_attachments_path,
        reset_attachments=settings.reset_attachments
    )

    # 3. Узнаем НОВУЮ папку вложений
    new_att_dir = get_attachments_dir()

    # 4. 🔥 УМНАЯ МИГРАЦИЯ ФАЙЛОВ
    if old_att_dir != new_att_dir and old_att_dir.exists() and old_att_dir.is_dir():
        new_att_dir.mkdir(parents=True, exist_ok=True)
        
        # Если мы уходим из глобальной папки в локальную, нужно забрать ТОЛЬКО СВОИ файлы
        allowed_files = None
        if was_global and settings.reset_attachments:
            allowed_files = set()
            result = await db.execute(select(TaskModel.description).where(TaskModel.description.isnot(None)))
            descriptions = result.scalars().all()
            pattern = re.compile(r'\]\((doe/[^\)]+)\)')
            for desc in descriptions:
                matches = pattern.findall(desc)
                for match in matches:
                    # Извлекаем чистое имя файла: "doe/img.png" -> "img.png"
                    clean_name = unquote(match).replace("doe/", "", 1)
                    allowed_files.add(clean_name)

        # Перенос файлов
        for item in old_att_dir.iterdir():
            if item.is_file():
                # Если фильтр включен, пропускаем чужие файлы
                if allowed_files is not None and item.name not in allowed_files:
                    continue

                target_file = new_att_dir / item.name
                if not target_file.exists():
                    try:
                        shutil.move(str(item), str(target_file))
                    except Exception as e:
                        print(f"[System] Failed to move attachment {item.name}: {e}")

        # Очищаем старую папку, только если мы уходим из ЛОКАЛЬНОЙ,
        # глобальную папку удалять опасно, вдруг там файлы других хранилищ.
        if not was_global:
            try:
                if not any(old_att_dir.iterdir()):
                    old_att_dir.rmdir()
            except Exception:
                pass

    return SettingsResponse(**get_ui_settings())

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    attachments_dir = get_attachments_dir()
    attachments_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = attachments_dir / file.filename
    counter = 1
    while file_path.exists():
        file_path = attachments_dir / f"{Path(file.filename).stem}_{counter}{Path(file.filename).suffix}"
        counter += 1
        
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"path": f"doe/{file_path.name}", "name": file_path.name}

class ImportFileReq(BaseModel):
    absolute_path: str

@router.post("/import-file")
async def import_file(req: ImportFileReq):
    attachments_dir = get_attachments_dir()
    attachments_dir.mkdir(parents=True, exist_ok=True)
    
    src_path = Path(req.absolute_path)
    if not src_path.exists() or not src_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
        
    file_path = attachments_dir / src_path.name
    counter = 1
    while file_path.exists():
        file_path = attachments_dir / f"{src_path.stem}_{counter}{src_path.suffix}"
        counter += 1
        
    shutil.copy2(src_path, file_path)
    return {"path": f"doe/{file_path.name}", "name": file_path.name}

class OpenFileReq(BaseModel):
    path: str

@router.post("/open-file")
async def open_file_endpoint(req: OpenFileReq):
    filename = req.path.replace("doe/", "", 1)
    abs_path = get_attachments_dir() / filename
    
    if not abs_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        if sys.platform == 'darwin':
            subprocess.call(['open', str(abs_path)])
        elif sys.platform == 'win32':
            os.startfile(str(abs_path))
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ValidateAttachmentsReq(BaseModel):
    paths: list[str]

@router.post("/validate-attachments")
async def validate_attachments(req: ValidateAttachmentsReq):
    att_dir = get_attachments_dir()
    result = {}
    
    for p in req.paths:
        try:
            decoded_path = unquote(p)
            filename = decoded_path.replace("doe/", "", 1)
            abs_path = att_dir / filename
            
            if abs_path.exists() and abs_path.is_file():
                result[p] = {"exists": True, "real_name": abs_path.name}
            else:
                result[p] = {"exists": False, "real_name": filename}
        except Exception:
            result[p] = {"exists": False, "real_name": "Unknown"}
            
    return result


# ==============================================================
# НОВЫЙ ЭНДПОИНТ: БЕЗОПАСНОЕ ОТКРЫТИЕ ВНЕШНИХ ССЫЛОК И ПУТЕЙ
# ==============================================================
class OpenLinkReq(BaseModel):
    url: str

@router.post("/open-link")
async def open_link_endpoint(req: OpenLinkReq):
    target = req.url
    try:
        # 1. Если это веб-ссылка или IP -> открываем в браузере
        if target.startswith(("http://", "https://")):
            webbrowser.open(target)
            return {"success": True}

        # 2. Обработка локальных путей
        clean_path = target
        
        # Убираем file:// если есть
        if clean_path.startswith("file://"):
            clean_path = clean_path.replace("file://", "", 1)
            # Фикс для Windows (убираем лишний слэш перед диском, например /C:/)
            if sys.platform == 'win32' and clean_path.startswith('/'):
                clean_path = clean_path[1:]
        
        # Декодируем URL-символы (%20 и прочее) в нормальные строки
        clean_path = urllib.parse.unquote(clean_path)

        # --- МАГИЯ ТИЛЬДЫ (Senior Developer Trick) ---
        # os.path.expanduser автоматически заменит ~ на домашнюю папку текущего пользователя
        # Она работает кроссплатформенно.
        if clean_path.startswith("~"):
            clean_path = os.path.expanduser(clean_path)
        # ----------------------------------------------

        # Превращаем в абсолютный путь (на случай, если пользователь ввел относительный не от ~)
        final_path = Path(clean_path).absolute()

        print(f"[System] Attempting to open path: {final_path}")

        if sys.platform == 'darwin':
            # macOS: команда open идеально справляется и с файлами, и с папками
            subprocess.call(['open', str(final_path)])
        elif sys.platform == 'win32':
            # Windows: os.startfile — это аналог двойного клика в проводнике
            if final_path.exists():
                os.startfile(str(final_path))
            else:
                # Если файла нет, не вызываем исключение, а просто логируем
                print(f"[System] Path does not exist: {final_path}")
                return {"success": False, "error": "File not found"}
        
        return {"success": True}
        
    except Exception as e:
        print(f"[System] Failed to open external link {target}: {e}")
        return {"success": False, "error": str(e)}

class RevealFolderReq(BaseModel):
    path: str

@router.post("/reveal-folder")
async def reveal_folder_endpoint(req: RevealFolderReq):
    target = req.path
    try:
        clean_path = target.replace("file://", "", 1)
        if sys.platform == 'win32' and clean_path.startswith('/'):
            clean_path = clean_path[1:]
            
        clean_path = urllib.parse.unquote(clean_path)
        if clean_path.startswith("~"):
            clean_path = os.path.expanduser(clean_path)
            
        final_path = Path(clean_path).absolute()

        if sys.platform == 'darwin':
            subprocess.call(['open', '-R', str(final_path)])
        elif sys.platform == 'win32':
            subprocess.call(['explorer', f'/select,{str(final_path)}'])
            
        return {"success": True}
    except Exception as e:
        print(f"[System] Failed to reveal folder {target}: {e}")
        return {"success": False, "error": str(e)}

@router.post("/cleanup-attachments")
async def cleanup_attachments_endpoint(db: AsyncSession = Depends(get_session)):
    """
    Фоновый эндпоинт для сборки мусора (Garbage Collector).
    Вызывается фронтендом при закрытии карточки и при запуске приложения.
    """
    await cleanup_orphaned_attachments(db)
    return {"success": True}


class DeleteFileReq(BaseModel):
    path: str

@router.post("/delete-file")
async def delete_file_endpoint(req: DeleteFileReq):
    """
    Мгновенное физическое удаление файла с диска.
    Используется только при явном нажатии на 'Удалить' во вложениях.
    """
    att_dir = get_attachments_dir()
    clean_rel_path = unquote(req.path)
    filename = clean_rel_path.replace("doe/", "", 1)
    
    # Защита от выхода за пределы папки (path traversal)
    abs_path = (att_dir / filename).resolve()
    
    if not str(abs_path).startswith(str(att_dir.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        if abs_path.exists() and abs_path.is_file():
            os.remove(abs_path)
            print(f"[System] File physically deleted: {abs_path.name}")
            return {"success": True}
        else:
            # Если файла уже нет, считаем задачу выполненной
            return {"success": True, "info": "File already gone"}
    except Exception as e:
        print(f"[System] Failed to delete file {abs_path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/vault/history")
async def get_vault_history_endpoint():
    items = get_vault_history()
    result = []
    for item in items:
        try:
            if isinstance(item, str):
                p = item
                last_opened = None
            else:
                p = item.get("path")
                last_opened = item.get("last_opened")
                
            vault_dir = Path(p)
            exists = False
            # Проверяем, что папка жива и в ней есть рабочая база
            if vault_dir.exists() and vault_dir.is_dir():
                if any(f for f in vault_dir.glob("*.db") if not f.name.endswith(".backup.db")):
                    exists = True

            name = vault_dir.name
            result.append({
                "name": name, 
                "path": p, 
                "last_opened": last_opened, 
                "exists": exists
            })
        except Exception:
            pass
    return result


class RelinkHistoryReq(BaseModel):
    old_path: str
    new_path: str

@router.post("/vault/history/relink")
async def relink_vault_history_endpoint(req: RelinkHistoryReq):
    vault_dir = Path(req.new_path)
    
    # 1. Проверяем валидность новой папки
    if not vault_dir.exists() or not vault_dir.is_dir():
        raise HTTPException(status_code=400, detail="INVALID_VAULT")
    if not any(f for f in vault_dir.glob("*.db") if not f.name.endswith(".backup.db")):
        raise HTTPException(status_code=400, detail="INVALID_VAULT")
        
    from src.core.config import _load_config, _save_config
    data = _load_config()
    history = data.get("vault_history", [])
    
    # 2. Проверяем на дубликат (если это хранилище уже есть в истории)
    for item in history:
        p = item if isinstance(item, str) else item.get("path")
        if p == req.new_path:
            raise HTTPException(status_code=409, detail="DUPLICATE_VAULT")
    
    # 3. Перепривязываем
    new_history = []
    for item in history:
        if isinstance(item, str):
            if item == req.old_path:
                new_history.append({"path": req.new_path, "last_opened": None})
            else:
                new_history.append(item)
        elif isinstance(item, dict):
            if item.get("path") == req.old_path:
                item["path"] = req.new_path
                new_history.append(item)
            else:
                new_history.append(item)
    
    data["vault_history"] = new_history
    _save_config(data)
    return {"success": True}


class RemoveHistoryReq(BaseModel):
    path: str

@router.post("/vault/history/remove")
async def remove_vault_history_endpoint(req: RemoveHistoryReq):
    remove_vault_from_history(req.path)
    return {"success": True}

from sqlalchemy import text

# ==========================================
# ПАРСЕР БУЛЕВЫХ ВЫРАЖЕНИЙ ДЛЯ ПОИСКА
# ==========================================
# Грамматика (от слабого к сильному):
#   expr   := or_expr
#   or_expr  := and_expr ( '||' and_expr )*
#   and_expr := term ( ('&&' | <whitespace>) term )*
#   term     := '(' expr ')' | WORD
#
# Дерево: ('word', 'купить') | ('and', [t1, t2, ...]) | ('or', [t1, t2, ...])

def _tokenize_search(s: str):
    """Разбивает строку на токены: WORD, AND, OR, LPAREN, RPAREN."""
    tokens = []
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        if ch.isspace():
            i += 1
            continue
        if ch == '(':
            tokens.append(('LPAREN', '('))
            i += 1
        elif ch == ')':
            tokens.append(('RPAREN', ')'))
            i += 1
        elif ch == '&' and i + 1 < n and s[i+1] == '&':
            tokens.append(('AND', '&&'))
            i += 2
        elif ch == '|' and i + 1 < n and s[i+1] == '|':
            tokens.append(('OR', '||'))
            i += 2
        else:
            # Слово — всё до пробела, скобки или оператора
            start = i
            while i < n and not s[i].isspace() and s[i] not in '()':
                # Останавливаемся перед && и ||
                if s[i] == '&' and i + 1 < n and s[i+1] == '&':
                    break
                if s[i] == '|' and i + 1 < n and s[i+1] == '|':
                    break
                i += 1
            word = s[start:i]
            if word:
                tokens.append(('WORD', word))
    return tokens


class _SearchParser:
    """Рекурсивный спуск для парсинга булевого выражения поиска."""
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def peek(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else (None, None)

    def consume(self):
        tok = self.peek()
        self.pos += 1
        return tok

    def parse(self):
        if not self.tokens:
            return None
        node = self.parse_or()
        return node

    def parse_or(self):
        left = self.parse_and()
        items = [left] if left else []
        while self.peek()[0] == 'OR':
            self.consume()
            right = self.parse_and()
            if right:
                items.append(right)
        if len(items) == 0:
            return None
        if len(items) == 1:
            return items[0]
        return ('or', items)

    def parse_and(self):
        left = self.parse_term()
        items = [left] if left else []
        # Неявный AND через пробел И явный через &&
        while True:
            tok = self.peek()
            if tok[0] == 'AND':
                self.consume()
                right = self.parse_term()
                if right:
                    items.append(right)
            elif tok[0] in ('WORD', 'LPAREN'):
                # Неявный AND (пробел между словами)
                right = self.parse_term()
                if right:
                    items.append(right)
            else:
                break
        if len(items) == 0:
            return None
        if len(items) == 1:
            return items[0]
        return ('and', items)

    def parse_term(self):
        tok = self.peek()
        if tok[0] == 'LPAREN':
            self.consume()
            node = self.parse_or()
            # Съедаем закрывающую скобку, если есть; если потерялась — терпим, не падаем
            if self.peek()[0] == 'RPAREN':
                self.consume()
            return node
        elif tok[0] == 'WORD':
            self.consume()
            return ('word', tok[1])
        return None


def _build_search_sql(node, field_exprs, params, counter=[0]):
    """
    Превращает дерево в SQL-условие.
    field_exprs — список SQL-выражений, по которым проверяется слово (например 
    ['LOWER_RU(t.title)', 'LOWER_RU(t.description)']). Слово ищется через OR
    между ними (т.е. слово найдено, если оно есть хотя бы в одном поле).
    """
    if node is None:
        return "1=1"
    
    kind = node[0]
    if kind == 'word':
        word = node[1].lower()
        key = f"w{counter[0]}"
        counter[0] += 1
        params[key] = f"%{word}%"
        field_or = " OR ".join(f"{fe} LIKE :{key}" for fe in field_exprs)
        return f"({field_or})"
    elif kind == 'and':
        parts = [_build_search_sql(child, field_exprs, params, counter) for child in node[1]]
        return "(" + " AND ".join(parts) + ")"
    elif kind == 'or':
        parts = [_build_search_sql(child, field_exprs, params, counter) for child in node[1]]
        return "(" + " OR ".join(parts) + ")"
    return "1=1"


def _collect_words(node):
    """Достаёт все слова из дерева — нужно для подсветки сниппетов."""
    if node is None:
        return []
    if node[0] == 'word':
        return [node[1]]
    result = []
    for child in node[1]:
        result.extend(_collect_words(child))
    return result

async def _search_by_tags(db: AsyncSession, inner: str):
    """
    Поиск карточек по тегам внутри описания.
    Тэг — это #имя на границе слов (т.е. #тест не сматчит #тестировщик).
    Возвращает только список карточек, без сниппетов.
    
    Поддерживает операторы:
      tags(#a, #b)      → A AND B (обратная совместимость с запятой)
      tags(#a && #b)    → A AND B
      tags(#a || #b)    → A OR B
      tags((#a || #b) && #c) → (A OR B) AND C
    """
    # Заменяем запятые на пробелы — старый синтаксис tags(#a, #b) превращается в неявный AND
    normalized = inner.replace(',', ' ')

    # Парсим выражение, где "словом" является сам тэг (без решётки)
    # Сначала вытаскиваем все имена тегов в правильном порядке
    tokens = _tokenize_search(normalized)
    
    # Превращаем токены WORD из вида "#имя" в "имя", остальные не-тэги отбрасываем
    cleaned = []
    for kind, val in tokens:
        if kind == 'WORD':
            if val.startswith('#') and len(val) > 1:
                cleaned.append(('WORD', val[1:].lower()))
            # Слова без # внутри tags(...) игнорируем — это мусор
        else:
            cleaned.append((kind, val))

    parser = _SearchParser(cleaned)
    tree = parser.parse()

    if tree is None:
        return {
            "workspaces": [], "columns": [], "tasks": [],
            "search_mode": "tags", "tags": []
        }

    all_tags = _collect_words(tree)

    # SQL pre-filter: грубо отсеиваем кандидатов через LIKE по дереву
    # Для тегов важна решётка → собираем условие сами с префиксом #
    params = {}
    counter = [0]
    
    def build_tag_sql(node):
        if node is None:
            return "1=1"
        kind = node[0]
        if kind == 'word':
            tag = node[1]
            key = f"tag{counter[0]}"
            counter[0] += 1
            params[key] = f"%#{tag}%"
            return f"LOWER_RU(t.description) LIKE :{key}"
        parts = [build_tag_sql(child) for child in node[1]]
        op = " AND " if kind == 'and' else " OR "
        return "(" + op.join(parts) + ")"
    
    where_sql = build_tag_sql(tree)

    sql = text(f"""
        SELECT t.id, t.title, t.column_id, c.title, c.workspace_id, w.name, t.description
        FROM tasks t
        JOIN columns c ON t.column_id = c.id
        JOIN workspaces w ON c.workspace_id = w.id
        WHERE t.description IS NOT NULL AND {where_sql}
        ORDER BY t.updated_at DESC
        LIMIT 50
    """)

    # Python post-filter: проверяем дерево на точные границы тегов
    def eval_tree_for_tags(node, desc):
        if node is None:
            return True
        kind = node[0]
        if kind == 'word':
            tag = node[1]
            return bool(re.search(r'(?<!\w)#' + re.escape(tag) + r'(?!\w)', desc, re.IGNORECASE))
        if kind == 'and':
            return all(eval_tree_for_tags(c, desc) for c in node[1])
        if kind == 'or':
            return any(eval_tree_for_tags(c, desc) for c in node[1])
        return False

    tasks = []
    try:
        res = await db.execute(sql, params)
        rows = res.fetchall()

        for r in rows:
            desc = r[6] or ""
            if eval_tree_for_tags(tree, desc):
                tasks.append({
                    "id": r[0],
                    "title": r[1],
                    "column_id": r[2],
                    "column_title": r[3],
                    "workspace_id": r[4],
                    "workspace_name": r[5],
                    "snippet": "",
                    "type": "task"
                })
    except Exception as e:
        import traceback
        print(f"[Search] Tag query failed: {e}")
        traceback.print_exc()

    return {
        "workspaces": [], "columns": [], "tasks": tasks,
        "search_mode": "tags", "tags": all_tags
    }

@router.get("/search")
async def global_search(q: str, db: AsyncSession = Depends(get_session)):
    """
    Глобальный поиск:
    - Регистронезависимый для любых языков (через LOWER_RU + Python str.lower)
    - Многословный AND: все слова должны быть найдены
    - Внутри карточки: каждое слово ищется в title ИЛИ description
    - Сниппет с подсветкой первого вхождения для удобства
    - Спец-режим тегов: tags(#tag1, #tag2) — возвращает только список карточек
    """
    if not q or len(q.strip()) < 2:
        return {"workspaces": [], "columns": [], "tasks": []}

    raw_q = q.strip()

    # === Спец-режим: поиск по тегам ===
    tag_match = re.match(r'^tags\s*\(\s*(.+?)\s*\)\s*$', raw_q, re.IGNORECASE)
    if tag_match:
        return await _search_by_tags(db, tag_match.group(1))

    # === Обычный режим с поддержкой && и || ===
    tokens = _tokenize_search(raw_q)
    parser = _SearchParser(tokens)
    tree = parser.parse()

    if tree is None:
        return {"workspaces": [], "columns": [], "tasks": []}

    # Все слова — для подсветки сниппетов и фильтрации вкладок/колонок
    all_words = _collect_words(tree)
    if not all_words:
        return {"workspaces": [], "columns": [], "tasks": []}

    # 1. Воркспейсы — ищем по дереву, поля только name
    ws_params = {}
    ws_where = _build_search_sql(tree, ["LOWER_RU(name)"], ws_params, [0])
    ws_sql = text(f"SELECT id, name FROM workspaces WHERE {ws_where} LIMIT 5")
    ws_res = await db.execute(ws_sql, ws_params)
    workspaces = [
        {"id": r[0], "name": r[1], "type": "workspace"}
        for r in ws_res.fetchall()
    ]

    # 2. Колонки — по дереву, поле c.title
    col_params = {}
    col_where = _build_search_sql(tree, ["LOWER_RU(c.title)"], col_params, [0])
    col_sql = text(f"""
        SELECT c.id, c.title, c.workspace_id, w.name 
        FROM columns c 
        JOIN workspaces w ON c.workspace_id = w.id 
        WHERE {col_where}
        LIMIT 5
    """)
    col_res = await db.execute(col_sql, col_params)
    columns = [
        {"id": r[0], "title": r[1], "workspace_id": r[2], "workspace_name": r[3], "type": "column"}
        for r in col_res.fetchall()
    ]

    # 3. Карточки — по дереву, ищем в title ИЛИ description
    task_params = {}
    where_sql = _build_search_sql(
        tree,
        ["LOWER_RU(t.title)", "LOWER_RU(t.description)"],
        task_params, [0]
    )

    task_sql = text(f"""
        SELECT 
            t.id, 
            t.title, 
            t.column_id, 
            c.title AS col_title, 
            c.workspace_id, 
            w.name AS ws_name,
            t.description AS full_desc
        FROM tasks t
        JOIN columns c ON t.column_id = c.id
        JOIN workspaces w ON c.workspace_id = w.id
        WHERE {where_sql}
        ORDER BY t.updated_at DESC
        LIMIT 30
    """)

    words_lower = [w.lower() for w in all_words]

    tasks = []
    try:
        task_res = await db.execute(task_sql, task_params)
        rows = task_res.fetchall()

        for r in rows:
            full_desc = r[6] or ""
            snippet_text = ""

            if full_desc:
                lower_desc = full_desc.lower()
                # Ищем самое раннее вхождение любого из слов
                first_hit_pos = -1
                first_hit_word = None
                for w in words_lower:
                    pos = lower_desc.find(w)
                    if pos != -1 and (first_hit_pos == -1 or pos < first_hit_pos):
                        first_hit_pos = pos
                        first_hit_word = w

                if first_hit_pos != -1:
                    start = max(0, first_hit_pos - 30)
                    end = min(len(full_desc), first_hit_pos + len(first_hit_word) + 50)
                    snippet_text = full_desc[start:end].strip()

                    # Подсветка всех слов запроса в сниппете
                    for w in all_words:
                        pattern = re.compile(re.escape(w), re.IGNORECASE)
                        snippet_text = pattern.sub(
                            lambda m: f"<mark>{m.group(0)}</mark>",
                            snippet_text
                        )

            tasks.append({
                "id": r[0],
                "title": r[1],
                "column_id": r[2],
                "column_title": r[3],
                "workspace_id": r[4],
                "workspace_name": r[5],
                "snippet": snippet_text,
                "type": "task"
            })
    except Exception as e:
        import traceback
        print(f"[Search] LIKE query failed: {e}")
        traceback.print_exc()
        tasks = []

    return {"workspaces": workspaces, "columns": columns, "tasks": tasks}

