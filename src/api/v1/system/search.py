from fastapi import APIRouter, Depends
import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import get_session

router = APIRouter(tags=["search"])


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


_ATTACH_REF_RE = re.compile(r'(!?)\[([^\]]*)\]\(([^)]+)\)')


def _extract_attachment_refs(desc: str):
    """Вытаскивает из описания все вложения: внутренние (doe/...) и файлы,
    на которые ссылаются напрямую из файловой системы (абсолютные пути, file://,
    ~/, диск Windows). Обычные http-ссылки и якоря игнорируются."""
    if not desc:
        return []
    clean = re.sub(r'```[\s\S]*?```', '', desc)
    clean = re.sub(r'`[^`]*`', '', clean)
    refs = []
    for m in _ATTACH_REF_RE.finditer(clean):
        is_img = m.group(1) == '!'
        label = m.group(2)
        url = m.group(3).strip()
        if url.startswith('<') and url.endswith('>'):
            url = url[1:-1].strip()
        low = url.lower()
        if not url or low.startswith(('http://', 'https://', 'mailto:', 'tel:', '#')):
            continue
        is_internal = url.startswith('doe/')
        is_fs = url.startswith(('/', '~', 'file:')) or bool(re.match(r'^[A-Za-z]:[\\/]', url))
        if not (is_internal or is_fs):
            continue
        name = url.split('?')[0].split('#')[0]
        name = re.split(r'[\\/]', name)[-1] or url
        refs.append({
            "label": label,
            "path": url,
            "name": name,
            "markdown": m.group(0),
            "is_image": is_img,
            "kind": "internal" if is_internal else "fs",
        })
    return refs


async def _collect_all_attachments(db: AsyncSession, limit: int = 300):
    """Все вложения из всех карточек активного хранилища — для показа в поиске."""
    sql = text("""
        SELECT t.id, t.title, t.column_id, c.title, c.workspace_id, w.name, t.description
        FROM tasks t
        JOIN columns c ON t.column_id = c.id
        JOIN workspaces w ON c.workspace_id = w.id
        WHERE t.description IS NOT NULL AND t.description LIKE '%](%'
        ORDER BY t.updated_at DESC
    """)
    out = []
    try:
        res = await db.execute(sql)
        for r in res.fetchall():
            for ref in _extract_attachment_refs(r[6] or ""):
                out.append({
                    **ref,
                    "task_id": r[0],
                    "task_title": r[1],
                    "column_id": r[2],
                    "column_title": r[3],
                    "workspace_id": r[4],
                    "workspace_name": r[5],
                    "type": "attachment",
                })
                if len(out) >= limit:
                    return out
    except Exception as e:
        print(f"[Search] attachments scan failed: {e}")
    return out


@router.get("/attachments-index")
async def attachments_index(db: AsyncSession = Depends(get_session)):
    """Полный список вложений хранилища (карточка-источник, имя файла, markdown-вид)."""
    return {"attachments": await _collect_all_attachments(db)}


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

    # Все вложения показываем всегда (не фильтруя по запросу).
    attachments = await _collect_all_attachments(db)

    return {"workspaces": workspaces, "columns": columns, "tasks": tasks, "attachments": attachments}
