"""Мост данных окна: api_request, asset roots, PDF.js."""
import os
import subprocess
import sys
import threading
import time
import traceback

import webview

from launcher.bridge import DATA_LOOP


class _DataBridgeMixin:
    def api_request(self, method, path, headers=None, body_b64=None):
        """Единая точка входа фронта к бэкенду вместо HTTP.
        method — 'GET'/'POST'/... ; path — '/api/v1/...'(+query);
        headers — dict; body_b64 — base64 тела запроса или None.
        Возвращает {status, headers, body_b64} (тело всегда base64,
        чтобы одинаково обслуживать текст и бинарь)."""
        import base64 as _b64
        import json as _json
        # PERF: фронтенд поллит API ежесекундно, а stdout пишется в лог-файл
        # в папке vault с flush на каждую строку. Поэтому пер-запросный лог
        # моста включается только явно: DOE_DEBUG=1 (ошибки логируются всегда).
        _dbg = os.environ.get("DOE_DEBUG")
        if _dbg:
            print(f"[Bridge] → {method} {path}", flush=True)
        try:
            body = _b64.b64decode(body_b64) if body_b64 else b""
            hdrs = {str(k): str(v) for k, v in (headers or {}).items()}
            resp = DATA_LOOP.request(method, path, hdrs, body)
            content = resp.content or b""
            if _dbg:
                print(f"[Bridge] ← {method} {path} -> {resp.status_code} ({len(content)}b)", flush=True)
            return {
                "status": resp.status_code,
                "headers": {k: v for k, v in resp.headers.items()},
                "body_b64": _b64.b64encode(content).decode("ascii"),
            }
        except Exception as e:
            import traceback
            print(f"[Bridge] ✗ {method} {path} FAILED: {e}", flush=True)
            traceback.print_exc()
            payload = _json.dumps({"detail": str(e)}).encode("utf-8")
            return {
                "status": 500,
                "headers": {"content-type": "application/json"},
                "body_b64": _b64.b64encode(payload).decode("ascii"),
            }

    def get_asset_roots(self):
        """Абсолютные корни для резолвинга вложений в file://-URL:
        attachments_dir — папка вложений (было /doe/...),
        vault_dir — активное хранилище. Фронт кэширует и обновляет при смене
        vault. Используется в resolveMarkdownAssetSrc (app.js)."""
        try:
            from src.core.config import get_attachments_dir, get_active_vault
            attach = get_attachments_dir()
            vault = get_active_vault()
            return {
                "attachments_dir": str(attach) if attach else "",
                "vault_dir": str(vault) if vault else "",
            }
        except Exception as e:
            print(f"[Bridge] get_asset_roots failed: {e}")
            return {"attachments_dir": "", "vault_dir": ""}

    def get_pdfjs_dir(self):
        """Абсолютный путь к локально закэшированному PDF.js (file://-загрузка
        воркера/скрипта). Файлы кладёт эндпоинт /system/ensure-pdfjs."""
        try:
            from src.api.v1.system import get_pdfjs_dir as _gp
            return str(_gp())
        except Exception as e:
            print(f"[Bridge] get_pdfjs_dir failed: {e}")
            return ""

