#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Сборка Doe для macOS (Apple Silicon, arm64).

Единственная поддерживаемая цель — нативный .app под arm64.
Сборка запускается через `make build` (см. Makefile).

Состав бандла:
  dist/Doe.app — основное приложение (wrapper.py, windowed)
  dist/Doe.app/Contents/MacOS/notify_worker — тихий воркер уведомлений
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

APP_NAME = "Doe"
BUNDLE_ID = "com.aesthetic.doe"
DISTPATH = "dist"
WORKPATH = "build"

ADD_DATA = [
    ("favicon.ico", "."),
    ("doe.png", "."),
    ("doe_source.zip", "."),
    ("frontend", "frontend"),
    ("src", "src"),
    ("alembic.ini", "."),
    ("alembic", "alembic"),
    ("THIRD_PARTY_LICENSES.md", "."),
]
HIDDEN = [
    "src.api.v1.columns",
    "src.api.v1.tasks",
    "src.api.v1.system",
    "src.api.v1.workspaces",
    "aiosqlite",
    "watchdog",
    "logging.config",
    "logging.handlers",
    "webview.platforms.cocoa",
    "jinja2",
]


def log(msg):
    print(msg, flush=True)


def run(cmd, **kw):
    return subprocess.run(cmd, cwd=ROOT, **kw)


def venv_python():
    p = os.path.join(ROOT, "venv", "bin", "python3")
    return p if os.path.exists(p) else sys.executable


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
    ignore_dirs = {
        ".git", "venv", "__pycache__", "build",
        "dist", ".idea", ".vscode", "Doe.app",
    }
    ignore_exts = (".pyc", ".db", ".sqlite3", ".doe", ".DS_Store", ".log")
    out = os.path.join(ROOT, "doe_source.zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(ROOT):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            for f in files:
                if f.endswith(ignore_exts) or f == "doe_source.zip":
                    continue
                path = os.path.join(root, f)
                zf.write(path, os.path.relpath(path, ROOT))


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


def patch_plist(app):
    import plistlib
    p = os.path.join(app, "Contents", "Info.plist")
    with open(p, "rb") as f:
        pl = plistlib.load(f)
    pl["LSMinimumSystemVersion"] = "11.0"
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
    pl["CFBundleIdentifier"] = BUNDLE_ID
    pl["CFBundleShortVersionString"] = "1.0.0"
    pl["CFBundleVersion"] = "1.0.0"
    pl["NSHumanReadableCopyright"] = "© 2026 Doe Kanban Sanctuary. All rights reserved."
    pl["NSSupportsAutomaticTermination"] = False
    pl["NSSupportsSuddenTermination"] = False
    with open(p, "wb") as f:
        plistlib.dump(pl, f)


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


def build():
    if sys.platform != "darwin":
        log("❌ Сборка поддерживается только на macOS (arm64).")
        return False

    py = venv_python()
    log(f"\n🚀 Сборка {APP_NAME}.app (macOS arm64)...")
    clean([WORKPATH, DISTPATH, "doe_source.zip"])
    make_source_zip()
    ensure_icns()

    log("🔧 Сборка notify_worker...")
    worker = [py, "-m", "PyInstaller", "--noconfirm", "--console", "--onefile",
              "--name", "notify_worker",
              "--distpath", DISTPATH, "--workpath", WORKPATH, "--specpath", WORKPATH,
              "notify_worker.py"]
    if run(worker).returncode != 0:
        log("❌ Сборка notify_worker не удалась.")
        return False

    log("🏗  Сборка Doe.app (это может занять время)...")
    app_cmd = [py, "-m", "PyInstaller",
               "--noconfirm", "--clean", "--windowed", "--argv-emulation",
               "--name", APP_NAME, "--icon", "doe.icns",
               "--osx-bundle-identifier", BUNDLE_ID,
               "--distpath", DISTPATH, "--workpath", WORKPATH]
    app_cmd += add_data_args(":")
    app_cmd += hidden_args(HIDDEN)
    app_cmd += ["wrapper.py"]
    if run(app_cmd).returncode != 0:
        log("❌ Сборка приложения не удалась.")
        return False

    app = os.path.join(ROOT, DISTPATH, f"{APP_NAME}.app")
    if not os.path.isdir(app):
        log("❌ Doe.app не найден после сборки.")
        return False

    shutil.copy(os.path.join(ROOT, "doe.icns"),
                os.path.join(app, "Contents", "Resources", "doe.icns"))
    worker_bin = os.path.join(ROOT, DISTPATH, "notify_worker")
    if os.path.exists(worker_bin):
        dst = os.path.join(app, "Contents", "MacOS", "notify_worker")
        shutil.copy(worker_bin, dst)
        os.chmod(dst, 0o755)
        os.remove(worker_bin)

    log("✍️  Патчим Info.plist, подпись, снятие карантина...")
    patch_plist(app)
    run(["codesign", "--force", "--deep", "--sign", "-", app],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    run(["xattr", "-cr", app], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    log(f"✅ Готово: {DISTPATH}/{APP_NAME}.app")
    return True


def main():
    os.chdir(ROOT)
    return 0 if build() else 1


if __name__ == "__main__":
    sys.exit(main())
