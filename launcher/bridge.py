"""In-process ASGI-мост: DataLoop, runtime_index_url, push_db_updated."""
import multiprocessing
import threading
import webview
import subprocess  # Для macOS 'open'
import os          # Для Windows 'os.startfile'
from pathlib import Path

import asyncio

print("[System] Loading FastAPI core...")
from main import app, startup as _app_startup, shutdown as _app_shutdown, frontend_path
from src.core.config import get_ui_settings

# ============================================================================
# 🔒 БЕЗ СЕТЕВОГО СЕРВЕРА
# Раньше здесь поднимался uvicorn на http://127.0.0.1:8000, а окно грузило
# `/app` по HTTP. Теперь окно грузится из локального файла (file://), а фронт
# общается с бэкендом через мост `window.pywebview.api.api_request`, который
# гоняет то же самое ASGI-приложение `app` in-process через httpx.ASGITransport
# — без сокета, порта и CORS. Это устраняет поверхность атаки (открытый порт).
# ============================================================================


def _runtime_dir() -> Path:
    """Перезаписываемый каталог для рантайм-index.html.
    ВАЖНО: в упакованном приложении каталог frontend/ лежит внутри .app/.exe
    и доступен только для чтения (а на macOS ещё и подписан — любая запись
    рвёт подпись). Поэтому рантайм-файл пишем в домашний каталог пользователя,
    а ассеты резолвим через <base href> на read-only frontend/."""
    import tempfile
    d = Path.home() / '.doe_runtime'
    try:
        d.mkdir(exist_ok=True)
        return d
    except Exception:
        return Path(tempfile.gettempdir())


def runtime_index_url(mode: str = 'board') -> str:
    """Собирает index.html с инъекцией темы/языка/режима и <base href> на
    каталог frontend/ (чтобы относительные ассеты грузились из read-only
    бандла), пишет результат в перезаписываемый каталог и возвращает
    file://-URL. mode: 'board' | 'vault'."""
    settings = get_ui_settings()
    # 🔐 theme/lang подставляются в инлайновый <script>/<style> ниже. Значения
    # берутся из ~/.doe_config.json; произвольная строка (напр. с "</script>…")
    # означала бы внедрение кода в привилегированный WebView (окно на file://).
    # Жёстко приводим к известному набору токенов (whitelist).
    theme = settings.get('theme', 'light')
    if theme not in ('light', 'dark'):
        theme = 'light'
    lang = settings.get('language', 'ru')
    if lang not in ('ru', 'en'):
        lang = 'ru'
    bg = '#161815' if theme == 'dark' else '#F4F3EF'
    with open(frontend_path / 'index.html', 'r', encoding='utf-8') as f:
        html = f.read()
    launch_mode = 'vault' if mode == 'vault' else 'board'

    # База для ВСЕХ относительных ассетов — реальный (read-only) каталог frontend/.
    fdir = frontend_path.resolve().as_uri()
    if not fdir.endswith('/'):
        fdir += '/'

    # <base> ДОЛЖЕН стоять в начале <head>, до первого <link>/<script>,
    # иначе ранние ассеты успевают срезолвиться от URL самого файла.
    html = html.replace('<head>', f'<head>\n    <base href="{fdir}">', 1)

    # Инъекция БАЗОВОГО фона в конец <head> — гарантирует нужный цвет вьюпорта
    # ещё до загрузки CSS (тот же приём, что был в main.py:serve_index).
    inject = (
        f'<style id="doe-bg-lock">html, body {{ background-color: {bg} !important; }}</style>'
        '<script>'
        f'window.__doeLaunchMode = "{launch_mode}";'
        f'window.__DOE_FRONTEND_BASE = "{fdir}";'
        'window.addEventListener("DOMContentLoaded", function(){ setTimeout(function(){ var e=document.getElementById("doe-bg-lock"); if(e) e.remove(); }, 50); });'
        f'if ("{theme}" === "dark") document.documentElement.setAttribute("data-theme", "dark");'
        f'try {{ localStorage.setItem("doe-theme", "{theme}"); localStorage.setItem("doe-lang", "{lang}"); }} catch(e) {{}}'
        '</script>'
        '</head>'
    )
    html = html.replace('</head>', inject, 1)

    out = _runtime_dir() / ('doe_runtime_vault.html' if launch_mode == 'vault' else 'doe_runtime_board.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    url = out.resolve().as_uri()
    if launch_mode == 'vault':
        url += '?mode=vault'
    return url


class _AsgiResponse:
    """Лёгкий контейнер ответа ASGI (аналог httpx.Response, но без зависимости)."""
    __slots__ = ('status_code', 'headers', 'content')

    def __init__(self, status_code, headers, content):
        self.status_code = status_code
        self.headers = headers  # dict[str, str]
        self.content = content  # bytes


async def _call_asgi(asgi_app, method, path, headers, body):
    """Вызывает ASGI-приложение НАПРЯМУЮ, без сети/сокета/HTTP-стека.
    Полностью офлайн: строим http-scope, гоняем receive/send, собираем ответ."""
    import urllib.parse as _uparse
    raw_path, _, query = path.partition('?')
    scope = {
        'type': 'http',
        'asgi': {'version': '3.0', 'spec_version': '2.3'},
        'http_version': '1.1',
        'method': str(method).upper(),
        'scheme': 'http',
        'path': _uparse.unquote(raw_path),
        'raw_path': raw_path.encode('utf-8'),
        'query_string': query.encode('utf-8'),
        'root_path': '',
        'headers': [
            (str(k).lower().encode('latin-1'), str(v).encode('latin-1'))
            for k, v in (headers or {}).items()
        ],
        'client': ('127.0.0.1', 0),
        'server': ('doe.local', 80),
    }

    _sent = {'done': False}

    async def receive():
        if not _sent['done']:
            _sent['done'] = True
            return {'type': 'http.request', 'body': body or b'', 'more_body': False}
        return {'type': 'http.disconnect'}

    result = {'status': 500, 'headers': [], 'body': bytearray()}

    async def send(message):
        t = message['type']
        if t == 'http.response.start':
            result['status'] = message['status']
            result['headers'] = message.get('headers', []) or []
        elif t == 'http.response.body':
            result['body'].extend(message.get('body', b'') or b'')

    await asgi_app(scope, receive, send)
    hdrs = {k.decode('latin-1'): v.decode('latin-1') for k, v in result['headers']}
    return _AsgiResponse(result['status'], hdrs, bytes(result['body']))


class DataLoop:
    """Единый asyncio-цикл в фоновом потоке — заменяет uvicorn-сервер.
    Запросы фронта (/api/v1/...) маршрутизируются в in-process `app` через
    прямой вызов ASGI, БЕЗ сети/сокета/порта."""

    def __init__(self):
        self.loop = asyncio.new_event_loop()
        self._ready = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True, name='doe-data-loop')

    def _run(self):
        asyncio.set_event_loop(self.loop)
        # Инициализация хранилища в фоне — окно появляется мгновенно, а фронт
        # ждёт готовности через /system/startup-status.
        self.loop.create_task(_app_startup())
        self._ready.set()
        self.loop.run_forever()

    def start(self):
        self.thread.start()
        self._ready.wait(timeout=10)

    def request(self, method, path, headers, body):
        """Синхронный вызов ASGI-приложения из потока pywebview."""
        fut = asyncio.run_coroutine_threadsafe(
            _call_asgi(app, method, path, headers, body), self.loop)
        return fut.result(timeout=300)

    def shutdown(self):
        try:
            fut = asyncio.run_coroutine_threadsafe(_app_shutdown(), self.loop)
            fut.result(timeout=5)
        except Exception:
            pass


DATA_LOOP = DataLoop()


def push_db_updated():
    """Замена WebSocket-события `db_updated`: пушим уведомление о внешнем
    изменении БД во все окна через evaluate_js (см. src/core/watcher.py)."""
    try:
        for w in list(webview.windows):
            try:
                w.evaluate_js('window.__doeOnDbUpdated && window.__doeOnDbUpdated()')
            except Exception:
                pass
    except Exception:
        pass

print("[Settings] Reading configuration...")
settings = get_ui_settings()
theme = settings.get("theme", "light")
bg_color = '#161815' if theme == 'dark' else '#F4F3EF'

# Глобальный кэш для доступа к аппаратному приводу Taptic Engine трекпада
