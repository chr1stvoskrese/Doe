#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Единый кросс-платформенный сборщик Doe.

Запусти на macOS или Windows:  python build.py
Скрипт сам определит систему, спросит (стрелками ↑/↓ + Enter), что собрать,
и сделает всё необходимое — включая авто-создание x86_64-окружения для Intel.

Неинтерактивно (для CI):  python build.py --target {arm64|intel|both|windows}
"""
import os
import sys
import base64
import shutil
import platform
import argparse
import subprocess

WIN = (os.name == "nt")
MAC = (sys.platform == "darwin")
ROOT = os.path.dirname(os.path.abspath(__file__))

# ---- общие данные сборки ----
ADD_DATA = [
    ("favicon.ico", "."), ("doe.png", "."), ("ai-logo.png", "."),
    ("doe_source.zip", "."), ("frontend", "frontend"), ("src", "src"),
    ("alembic.ini", "."), ("alembic", "alembic"),
    ("THIRD_PARTY_LICENSES.md", "."),
]
HIDDEN_BASE = [
    "src.api.v1.columns", "src.api.v1.tasks", "src.api.v1.system", "src.api.v1.workspaces",
    "uvicorn.logging", "uvicorn.loops", "uvicorn.loops.auto",
    "uvicorn.protocols", "uvicorn.protocols.http", "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets", "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan", "uvicorn.lifespan.on", "uvicorn.lifespan.off",
    "aiosqlite", "watchdog", "websockets",
]
HIDDEN_MAC = HIDDEN_BASE + ["webview.platforms.cocoa", "requests", "jinja2", "numpy"]
HIDDEN_WIN = list(HIDDEN_BASE)  # как в исходном build_win.bat: без requests/jinja2/numpy

# version.txt для Windows-уведомлений (тот же, что в build_win.bat)
WIN_VERSION_B64 = (
    b"VlNWZXJzaW9uSW5mbygKICBmZmk9Rml4ZWRGaWxlSW5mbygKICAgIGZpbGV2ZXJzPSgxLCAwLCAwLCAwKSwK"
    b"ICAgIHByb2R2ZXJzPSgxLCAwLCAwLCAwKSwKICAgIG1hc2s9MHgzZiwKICAgIGZsYWdzPTB4MCwKICAgIE9T"
    b"PTB4NDAwMDQsCiAgICBmaWxlVHlwZT0weDEsCiAgICBzdWJ0eXBlPTB4MCwKICAgIGRhdGU9KDAsIDApCiAg"
    b"ICApLAogIGtpZHM9WwogICAgU3RyaW5nRmlsZUluZm8oWwogICAgICBTdHJpbmdUYWJsZSgKICAgICAgICAn"
    b"MDQwOTA0QjAnLAogICAgICAgIFtTdHJpbmdTdHJ1Y3QoJ0ZpbGVEZXNjcmlwdGlvbicsICdEb2UnKSwKICAg"
    b"ICAgICBTdHJpbmdTdHJ1Y3QoJ09yaWdpbmFsRmlsZW5hbWUnLCAnRG9lLmV4ZScpXQogICAgICApCiAgICBd"
    b"KSwgCiAgICBWYXJGaWxlSW5mbyhbVmFyU3RydWN0KCdUcmFuc2xhdGlvbicsIFsxMDMzLCAxMjAwXSldKQog"
    b"IF0KKQ=="
)

# ============================================================
#  Стрелочное меню (кросс-платформенно: termios на *nix, msvcrt на Windows)
# ============================================================
def _enable_vt():
    if WIN:
        try:
            import ctypes
            k = ctypes.windll.kernel32
            k.SetConsoleMode(k.GetStdHandle(-11), 7)
        except Exception:
            os.system("")

def _read_key():
    if WIN:
        import msvcrt
        ch = msvcrt.getwch()
        if ch in ("\x00", "\xe0"):
            ch2 = msvcrt.getwch()
            return {"H": "up", "P": "down"}.get(ch2)
        if ch in ("\r", "\n"):
            return "enter"
        if ch == "\x1b":
            return "esc"
        if ch == "\x03":
            raise KeyboardInterrupt
        return ch
    import termios, tty
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        ch = sys.stdin.read(1)
        if ch == "\x1b":
            seq = sys.stdin.read(1)
            if seq == "[":
                code = sys.stdin.read(1)
                return {"A": "up", "B": "down"}.get(code)
            return "esc"
        if ch in ("\r", "\n"):
            return "enter"
        if ch == "\x03":
            raise KeyboardInterrupt
        return ch
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)

def select_menu(title, options):
    """Возвращает индекс выбранного пункта или None (отмена)."""
    if not sys.stdin.isatty():
        print(title)
        for i, o in enumerate(options):
            print(f"  {i+1}) {o}")
        while True:
            try:
                raw = input("Выбор: ").strip()
            except EOFError:
                return None
            if raw.isdigit() and 1 <= int(raw) <= len(options):
                return int(raw) - 1

    _enable_vt()
    cur = 0
    print(title)

    def draw(first=False):
        if not first:
            sys.stdout.write(f"\x1b[{len(options)}A")
        for i, o in enumerate(options):
            marker = "❯ " if i == cur else "  "
            line = marker + o
            if i == cur:
                line = f"\x1b[7m{line}\x1b[0m"
            sys.stdout.write("\x1b[2K" + line + "\n")
        sys.stdout.flush()

    draw(first=True)
    while True:
        try:
            k = _read_key()
        except KeyboardInterrupt:
            return None
        if k == "up":
            cur = (cur - 1) % len(options); draw()
        elif k == "down":
            cur = (cur + 1) % len(options); draw()
        elif k and k.isdigit() and 1 <= int(k) <= len(options):
            cur = int(k) - 1; draw()
        elif k == "enter":
            return cur
        elif k in ("esc", "q", "Q"):
            return None

# ============================================================
#  Утилиты
# ============================================================
def log(msg):
    print(msg, flush=True)

def run(cmd, **kw):
    """Запуск команды списком аргументов (без шелла)."""
    return subprocess.run(cmd, cwd=ROOT, **kw)

def venv_python(name):
    p = os.path.join(ROOT, name, "Scripts", "python.exe") if WIN \
        else os.path.join(ROOT, name, "bin", "python3")
    return p if os.path.exists(p) else None

def clean(paths):
    for p in paths:
        full = os.path.join(ROOT, p)
        if os.path.isdir(full):
            shutil.rmtree(full, ignore_errors=True)
        elif os.path.exists(full):
            try:
                os.remove(full)
            except OSError:
                pass

def make_source_zip():
    import zipfile
    log("📦 Упаковка исходного кода...")
    ignore_dirs = {".git", "venv", "venv-intel", "__pycache__", "build", "build-intel",
                   "dist", "dist-intel", ".idea", ".vscode", "Doe.app"}
    ignore_exts = {".pyc", ".db", ".sqlite3", ".doe", ".DS_Store", ".log"}
    out = os.path.join(ROOT, "doe_source.zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(ROOT):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            for f in files:
                if any(f.endswith(e) for e in ignore_exts) or f == "doe_source.zip":
                    continue
                path = os.path.join(root, f)
                zf.write(path, os.path.relpath(path, ROOT))

def add_data_args(sep):
    out = []
    for s, d in ADD_DATA:
        out += ["--add-data", f"{s}{sep}{d}"]
    return out

def hidden_args(names):
    out = []
    for n in names:
        out += ["--hidden-import", n]
    return out

# ============================================================
#  macOS
# ============================================================
def ensure_icns():
    icns = os.path.join(ROOT, "doe.icns")
    if os.path.exists(icns) or not os.path.exists(os.path.join(ROOT, "doe.png")):
        return
    log("🎨 Генерация doe.icns...")
    iconset = os.path.join(ROOT, "Doe.iconset")
    os.makedirs(iconset, exist_ok=True)
    sizes = [(16, "icon_16x16"), (32, "icon_16x16@2x"), (32, "icon_32x32"),
             (64, "icon_32x32@2x"), (128, "icon_128x128"), (256, "icon_128x128@2x"),
             (256, "icon_256x256"), (512, "icon_256x256@2x"), (512, "icon_512x512"),
             (1024, "icon_512x512@2x")]
    tmp = os.path.join(iconset, "tmp.png")
    for size, name in sizes:
        content = int(size * 0.82)
        run(["sips", "-z", str(content), str(content), "doe.png", "--out", tmp],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        run(["sips", "-p", str(size), str(size), tmp, "--out", os.path.join(iconset, name + ".png")],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    run(["iconutil", "-c", "icns", "Doe.iconset", "-o", "doe.icns"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    shutil.rmtree(iconset, ignore_errors=True)

def patch_plist(app, min_os):
    import plistlib
    p = os.path.join(app, "Contents", "Info.plist")
    with open(p, "rb") as f:
        pl = plistlib.load(f)
    pl["LSMinimumSystemVersion"] = min_os
    pl["UTExportedTypeDeclarations"] = [{
        "UTTypeIdentifier": "com.aesthetic.doe.vault",
        "UTTypeDescription": "Doe Vault Database",
        "UTTypeIconFile": "doe.icns",
        "UTTypeConformsTo": ["public.data", "public.content"],
        "UTTypeTagSpecification": {"public.filename-extension": ["db.doe", "doe"]},
    }]
    pl["CFBundleDocumentTypes"] = [{
        "CFBundleTypeName": "Doe Vault",
        "CFBundleTypeRole": "Viewer",
        "CFBundleTypeIconFile": "doe.icns",
        "LSHandlerRank": "Owner",
        "LSItemContentTypes": ["com.aesthetic.doe.vault"],
        "CFBundleTypeExtensions": ["db.doe", "doe"],
        "LSTypeIsPackage": False,
    }]
    pl["CFBundleName"] = "Doe (demo)"
    pl["CFBundleDisplayName"] = "Doe (demo)"
    pl["CFBundleIdentifier"] = "com.aesthetic.doe"
    pl["CFBundleShortVersionString"] = "1.0.0"
    pl["CFBundleVersion"] = "1.0.0"
    pl["NSHumanReadableCopyright"] = "© 2026 Doe Kanban Sanctuary. All rights reserved."
    pl["NSSupportsAutomaticTermination"] = False
    pl["NSSupportsSuddenTermination"] = False
    with open(p, "wb") as f:
        plistlib.dump(pl, f)

def find_universal_python():
    """Python, способный работать под x86_64 (universal2 или Intel)."""
    import glob
    cands = ["/usr/local/bin/python3"]
    cands += sorted(glob.glob("/Library/Frameworks/Python.framework/Versions/*/bin/python3"))
    cands.append(shutil.which("python3") or "")
    for p in cands:
        if not p or not os.path.exists(p):
            continue
        try:
            r = subprocess.run(["arch", "-x86_64", p, "-c",
                                "import platform,sys;sys.exit(0 if platform.machine()=='x86_64' else 1)"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if r.returncode == 0:
                return p
        except Exception:
            continue
    return None

def ensure_venv_intel():
    """Возвращает путь к python из venv-intel, создавая окружение при необходимости."""
    py = venv_python("venv-intel")
    if py:
        r = subprocess.run([py, "-c", "import platform,sys;sys.exit(0 if platform.machine()=='x86_64' else 1)"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if r.returncode == 0:
            return py
        log("🧹 venv-intel не x86_64 — пересоздаю...")
        shutil.rmtree(os.path.join(ROOT, "venv-intel"), ignore_errors=True)

    log("📦 Создаю x86_64-окружение venv-intel (разово)...")
    if subprocess.run(["arch", "-x86_64", "true"],
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
        log("❌ Не получается запускать процессы под x86_64.")
        log("   На Apple Silicon поставь Rosetta 2:")
        log("     softwareupdate --install-rosetta --agree-to-license")
        return None

    base_py = find_universal_python()
    if not base_py:
        log("❌ Не нашёл Python с поддержкой x86_64 (universal2).")
        log("   Поставь universal2-сборку с python.org и повтори.")
        return None

    venv_dir = os.path.join(ROOT, "venv-intel")
    if run(["arch", "-x86_64", base_py, "-m", "venv", venv_dir]).returncode != 0:
        log("❌ Не удалось создать venv-intel.")
        return None
    py = venv_python("venv-intel")
    log("⬇️  Ставлю зависимости под x86_64 (это займёт время)...")
    run(["arch", "-x86_64", py, "-m", "pip", "install", "--upgrade", "pip"])
    # llama-cpp в requirements помечен 'darwin arm64' и под x86_64 пропускается сам.
    if run(["arch", "-x86_64", py, "-m", "pip", "install", "-r", "requirements.txt"]).returncode != 0:
        log("❌ Ошибка установки зависимостей в venv-intel.")
        return None
    log("✅ venv-intel готова.")
    return py

def build_macos(arch):
    """arch: 'arm64' (с ИИ) или 'x86_64' (без ИИ)."""
    is_intel = (arch == "x86_64")
    if is_intel:
        py = ensure_venv_intel()
        if not py:
            return False
        prefix = ["arch", "-x86_64", py, "-m", "PyInstaller"]
        distpath, workpath = "dist-intel", "build-intel"
        min_os = "10.13"
    else:
        py = venv_python("venv") or sys.executable
        prefix = [py, "-m", "PyInstaller"]
        distpath, workpath = "dist", "build"
        min_os = "11.0"

    log(f"\n🚀 macOS-сборка ({arch})...")
    clean([workpath, distpath, "doe_source.zip"])
    make_source_zip()
    ensure_icns()

    # тихий воркер уведомлений
    log("🔧 Сборка notify_worker...")
    worker = prefix + ["--noconfirm", "--console", "--onefile", "--name", "notify_worker",
                       "--distpath", distpath, "--workpath", workpath, "--specpath", workpath]
    if is_intel:
        worker += ["--target-arch", "x86_64"]
    worker += ["notify_worker.py"]
    run(worker)

    # основное приложение
    log("🏗  Сборка Doe.app (это может занять время)...")
    app_cmd = prefix + [
        "--noconfirm", "--clean", "--windowed", "--argv-emulation",
        "--name", "Doe", "--icon", "doe.icns",
        "--osx-bundle-identifier", "com.aesthetic.doe",
        "--distpath", distpath, "--workpath", workpath,
    ]
    app_cmd += add_data_args(":")
    app_cmd += hidden_args(HIDDEN_MAC)
    app_cmd += ["--collect-all", "numpy"]
    if is_intel:
        app_cmd += ["--target-arch", "x86_64"]   # ИИ не бандлим — llama_cpp только arm64
    else:
        app_cmd += ["--collect-all", "llama_cpp"]
    app_cmd += ["wrapper.py"]
    if run(app_cmd).returncode != 0:
        log("❌ Сборка приложения не удалась.")
        return False

    app = os.path.join(ROOT, distpath, "Doe.app")
    if not os.path.isdir(app):
        log("❌ Doe.app не найден после сборки.")
        return False

    # иконка + воркер внутрь .app
    shutil.copy(os.path.join(ROOT, "doe.icns"), os.path.join(app, "Contents", "Resources", "doe.icns"))
    worker_bin = os.path.join(ROOT, distpath, "notify_worker")
    if os.path.exists(worker_bin):
        dst = os.path.join(app, "Contents", "MacOS", "notify_worker")
        shutil.copy(worker_bin, dst)
        os.chmod(dst, 0o755)
        os.remove(worker_bin)

    log("✍️  Патчим Info.plist, подпись, снятие карантина...")
    patch_plist(app, min_os)
    run(["codesign", "--force", "--deep", "--sign", "-", app],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    run(["xattr", "-cr", app], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    log(f"✅ Готово: {distpath}/Doe.app")

    # установку в /Applications предлагаем только для нативной arm64-сборки
    if not is_intel and sys.stdin.isatty():
        ans = input("Установить в /Applications и открыть Finder? [y/N]: ").strip().lower()
        if ans in ("y", "yes", "д", "да"):
            target = "/Applications/Doe.app"
            # rm -rf, а не shutil.rmtree: бандл подписан и содержит read-only файлы,
            # которые rmtree(ignore_errors=True) молча не удаляет.
            if os.path.exists(target):
                if run(["rm", "-rf", target]).returncode != 0:
                    log("⚠️  Не удалось удалить старую /Applications/Doe.app — пропускаю установку.")
                    return True
            # ditto корректно переносит .app (симлинки фреймворков, ресурсы), в отличие от copytree.
            if run(["ditto", app, target]).returncode != 0:
                log("⚠️  Установка в /Applications не удалась (нет прав?). Приложение собрано в " + distpath + "/Doe.app.")
                return True
            run(["xattr", "-cr", target], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            run(["open", "-R", target])
            log("✅ Установлено в /Applications/Doe.app")
    return True

# ============================================================
#  Windows
# ============================================================
def build_windows():
    log("\n🚀 Windows-сборка (.exe)...")
    subprocess.run(["taskkill", "/F", "/IM", "Doe.exe", "/T"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    clean(["build", "dist", "Doe.spec", "doe_source.zip"])
    make_source_zip()

    version_txt = os.path.join(ROOT, "version.txt")
    with open(version_txt, "wb") as f:
        f.write(base64.b64decode(WIN_VERSION_B64))

    py = venv_python("venv") or sys.executable
    cmd = [py, "-m", "PyInstaller", "--noconfirm", "--windowed",
           "--name", "Doe", "--icon", "favicon.ico", "--version-file", "version.txt"]
    cmd += add_data_args(";")
    cmd += hidden_args(HIDDEN_WIN)
    cmd += ["wrapper.py"]
    rc = run(cmd).returncode
    if os.path.exists(version_txt):
        os.remove(version_txt)
    if rc != 0:
        log("❌ Сборка .exe не удалась.")
        return False
    log("✅ Готово: dist/Doe/Doe.exe")
    return True

# ============================================================
#  main
# ============================================================
def run_target(target):
    if target == "arm64":
        return build_macos("arm64")
    if target == "intel":
        return build_macos("x86_64")
    if target == "both":
        ok = build_macos("arm64")
        return build_macos("x86_64") and ok
    if target == "windows":
        return build_windows()
    return False

def interactive():
    if MAC:
        title = "\n  Сборка Doe для macOS — выбери цель (↑/↓, Enter; Esc — выход):\n"
        options = [
            "Apple Silicon (arm64) — полная версия с ИИ",
            "Intel (x86_64) — всё кроме ИИ, для старых маков",
            "Обе версии сразу (arm64 + Intel)",
            "Отмена",
        ]
        targets = ["arm64", "intel", "both", None]
    elif WIN:
        title = "\n  Сборка Doe для Windows (↑/↓, Enter; Esc — выход):\n"
        options = ["Windows (.exe)", "Отмена"]
        targets = ["windows", None]
    else:
        log(f"❌ Сборка поддерживается на macOS и Windows. Текущая ОС: {platform.system()}")
        return 1

    idx = select_menu(title, options)
    if idx is None or targets[idx] is None:
        log("Отменено.")
        return 0
    ok = run_target(targets[idx])
    return 0 if ok else 1

def main():
    os.chdir(ROOT)
    ap = argparse.ArgumentParser(description="Единый сборщик Doe.")
    ap.add_argument("--target", choices=["arm64", "intel", "both", "windows"],
                    help="Собрать без интерактивного меню.")
    args = ap.parse_args()

    if args.target:
        if args.target in ("arm64", "intel", "both") and not MAC:
            log("❌ macOS-цели можно собирать только на macOS.")
            return 1
        if args.target == "windows" and not WIN:
            log("❌ Windows-сборку можно делать только на Windows.")
            return 1
        return 0 if run_target(args.target) else 1

    try:
        return interactive()
    except KeyboardInterrupt:
        log("\nОтменено.")
        return 0

if __name__ == "__main__":
    sys.exit(main())
