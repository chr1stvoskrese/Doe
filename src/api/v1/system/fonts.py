from fastapi import APIRouter
import ctypes
import sys
from ctypes import wintypes

router = APIRouter(tags=["fonts"])


# ==========================================
# СИНХРОНИЗАЦИЯ ICLOUD / OBSIDIAN
# ==========================================
# 🔒 Раньше здесь был WebSocket /ws. Без сетевого сервера уведомление о внешних
# изменениях БД доставляется напрямую в окно через evaluate_js — см.
# src/core/watcher.py (notify_db_updated / set_push_hook) и wrapper.py.


def get_system_font_families() -> list[str]:
    """
    Возвращает список всех зарегистрированных в системе семейств шрифтов.
    Работает нативно без сторонних тяжелых библиотек.
    """
    families = set()
    
    if sys.platform == 'darwin':
        try:
            import AppKit
            manager = AppKit.NSFontManager.sharedFontManager()
            for f in manager.availableFontFamilies():
                families.add(str(f))
        except Exception as e:
            print(f"[Fonts] macOS AppKit font query failed: {e}")
            
    elif sys.platform == 'win32':
        try:
            # Описываем структуры GDI Windows для EnumFontFamiliesExW
            LF_FACESIZE = 32
            LF_FULLFACESIZE = 64

            class LOGFONTW(ctypes.Structure):
                _fields_ = [
                    ("lfHeight", wintypes.LONG),
                    ("lfWidth", wintypes.LONG),
                    ("lfEscapement", wintypes.LONG),
                    ("lfOrientation", wintypes.LONG),
                    ("lfWeight", wintypes.LONG),
                    ("lfItalic", ctypes.c_byte),
                    ("lfUnderline", ctypes.c_byte),
                    ("lfStrikeOut", ctypes.c_byte),
                    ("lfCharSet", ctypes.c_byte),
                    ("lfOutPrecision", ctypes.c_byte),
                    ("lfClipPrecision", ctypes.c_byte),
                    ("lfQuality", ctypes.c_byte),
                    ("lfPitchAndFamily", ctypes.c_byte),
                    ("lfFaceName", wintypes.WCHAR * LF_FACESIZE),
                ]

            class ENUMLOGFONTEXW(ctypes.Structure):
                _fields_ = [
                    ("elfLogFont", LOGFONTW),
                    ("elfFullName", wintypes.WCHAR * LF_FULLFACESIZE),
                    ("elfStyle", wintypes.WCHAR * LF_FACESIZE),
                    ("elfScript", wintypes.WCHAR * LF_FACESIZE),
                ]

            FONT_ENUM_PROC = ctypes.WINFUNCTYPE(
                ctypes.c_int,
                ctypes.POINTER(ENUMLOGFONTEXW),
                ctypes.c_void_p,
                wintypes.DWORD,
                wintypes.LPARAM
            )

            def callback_proc(lpelfe, lpntme, font_type, lparam):
                face_name = lpelfe.contents.elfLogFont.lfFaceName
                # Игнорируем вертикальные шрифты для азиатских языков (начинаются с @)
                if face_name and not face_name.startswith('@'):
                    families.add(face_name)
                return 1

            hdc = ctypes.windll.user32.GetDC(None)
            logfont = LOGFONTW()
            logfont.lfCharSet = 1  # DEFAULT_CHARSET
            logfont.lfFaceName = ""

            c_callback = FONT_ENUM_PROC(callback_proc)
            ctypes.windll.gdi32.EnumFontFamiliesExW(
                hdc,
                ctypes.byref(logfont),
                c_callback,
                0,
                0
            )
            ctypes.windll.user32.ReleaseDC(None, hdc)
        except Exception as e:
            print(f"[Fonts] Windows GDI font query failed: {e}")

    if not families:
        # Фолбэк на случай непредвиденных сбоев API
        return [
            "Inter", "Roboto", "Open Sans", "Segoe UI",
            "Helvetica Neue", "Arial", "Georgia", "Times New Roman",
            "Courier New", "Consolas", "Comic Sans MS", "JetBrains Mono"
        ]

    return sorted(list(families))


@router.get("/fonts/available", response_model=list[str])
async def get_available_fonts():
    """Эндпоинт для получения списка установленных в ОС шрифтов."""
    return get_system_font_families()
