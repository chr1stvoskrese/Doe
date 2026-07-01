#!/usr/bin/env python3
"""
run_ios.py — однокомандный запуск iOS-версии Doe на симуляторе ИЛИ на реальном iPhone.

Запуск из корня проекта:

    python run_ios.py            # авто: подключён iPhone → ставим на него, иначе симулятор
    python run_ios.py --real     # принудительно реальный iPhone
    python run_ios.py --sim      # принудительно симулятор
    python run_ios.py --clean    # чистая сборка

── Реальный iPhone «просто подключить» ─────────────────────────────────────
  1. Подключи iPhone кабелем, разблокируй, ответь «Доверять этому компьютеру».
  2. Один раз залогинься в Xcode → Settings → Accounts своим Apple ID
     (нужно для подписи; бесплатного аккаунта достаточно).
  3. Включи на телефоне Developer Mode: Settings → Privacy & Security →
     Developer Mode → On → перезагрузка (только один раз, iOS 16+).
  4. python run_ios.py

  Team ID, подпись и провижининг подхватятся автоматически. Если не определился
  сам — передай его флагом:  --team ABCDE12345

Флаги:
  --real             только реальное устройство
  --sim              только симулятор
  --device "NAME"    имя симулятора (по умолчанию: iPhone 17 Pro)
  --team  TEAMID     Apple Development Team ID (10 символов)
  --bundle-id ID     переопределить bundle identifier (если дефолтный занят)
  --clean            чистая сборка
  --xcode            дополнительно открыть проект в Xcode

Требования: macOS с полным Xcode (не только Command Line Tools). Для реального
устройства нужен Xcode 15+ (используется xcrun devicectl).
"""

import argparse
import json
import os
import re
import subprocess
import sys
import glob
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.join(ROOT, "iOS", "Doe.xcodeproj")
PBXPROJ = os.path.join(PROJECT, "project.pbxproj")
SCHEME = "Doe"
BUNDLE_ID = "com.aesthetic.doe.ios"
DERIVED = os.path.join(ROOT, "iOS", "build")
DEFAULT_DEVICE = "iPhone 17 Pro"


# --- утилиты вывода ---------------------------------------------------------

def info(msg):  print(f"\033[36m▸ {msg}\033[0m")
def ok(msg):    print(f"\033[32m✓ {msg}\033[0m")
def warn(msg):  print(f"\033[33m! {msg}\033[0m")
def err(msg):   print(f"\033[31m✗ {msg}\033[0m")


def run(cmd, check=True, capture=False):
    """Запускает команду, возвращает CompletedProcess."""
    if capture:
        return subprocess.run(cmd, check=check, text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return subprocess.run(cmd, check=check)


def have(tool):
    return subprocess.run(["which", tool], capture_output=True).returncode == 0


# --- проверки окружения -----------------------------------------------------

def preflight():
    if sys.platform != "darwin":
        err("Этот скрипт работает только на macOS (нужен Xcode).")
        sys.exit(1)
    if not os.path.isdir(PROJECT):
        err(f"Не найден проект: {PROJECT}")
        sys.exit(1)
    if not have("xcrun"):
        err("Не найден xcrun. Установите Xcode и Command Line Tools.")
        sys.exit(1)
    p = run(["xcode-select", "-p"], capture=True, check=False)
    path = (p.stdout or "").strip()
    if "CommandLineTools" in path:
        err("xcode-select указывает на Command Line Tools, а нужен полный Xcode.")
        warn("Исправьте так:  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer")
        sys.exit(1)


# --- реальные устройства ----------------------------------------------------

def devicectl_available():
    r = subprocess.run(["xcrun", "devicectl", "--version"],
                       capture_output=True, text=True)
    return r.returncode == 0


def list_physical_devices():
    """Возвращает список подключённых iOS-устройств: [{name, id, udid}].

    `id` — идентификатор для `devicectl --device` (CoreDevice UUID);
    `udid` — аппаратный UDID (может отсутствовать в фолбэке).
    """
    if not devicectl_available():
        return []
    devices = _devices_from_json()
    if not devices:
        devices = _devices_from_table()
    return devices


def _devices_from_json():
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        out = tf.name
    try:
        r = subprocess.run(
            ["xcrun", "devicectl", "list", "devices", "--json-output", out],
            capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(out):
            return []
        with open(out) as f:
            data = json.load(f)
    except Exception:
        return []
    finally:
        try: os.remove(out)
        except OSError: pass

    devices = []
    for d in data.get("result", {}).get("devices", []):
        hw = d.get("hardwareProperties", {})
        dp = d.get("deviceProperties", {})
        platform = (hw.get("platform") or "").lower()
        model = (hw.get("marketingName") or hw.get("productType") or "")
        dtype = (hw.get("deviceType") or "")
        is_ios = ("ios" in platform
                  or "iphone" in (model + dtype).lower()
                  or "ipad" in (model + dtype).lower())
        if not is_ios:
            continue
        ident = d.get("identifier")            # для devicectl --device
        udid = hw.get("udid")
        name = dp.get("name") or "iPhone"
        conn = d.get("connectionProperties", {})
        if ident or udid:
            devices.append({"name": name, "id": ident or udid, "udid": udid,
                            "transport": conn.get("transportType", "")})
    return devices


def _devices_from_table():
    """Фолбэк: разбираем табличный вывод `xcrun devicectl list devices`."""
    r = run(["xcrun", "devicectl", "list", "devices"], capture=True, check=False)
    devices = []
    uuid_re = re.compile(
        r"[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}")
    for line in (r.stdout or "").splitlines():
        if ("iPhone" not in line) and ("iPad" not in line):
            continue
        m = uuid_re.search(line)
        if not m:
            continue
        ident = m.group(0)
        name = line[:m.start()].strip() or "iPhone"
        devices.append({"name": name, "id": ident, "udid": None, "transport": "wired"})
    return devices


def detect_team(cli_team):
    """Определяет Development Team ID из нескольких источников по порядку:
    аргумент → проект → кэш аккаунтов Xcode → сертификаты → провижининг-профили.
    """
    for src in (lambda: cli_team,
                _team_from_pbxproj,
                _team_from_xcode_prefs,
                _team_from_identities,
                _team_from_profiles):
        t = src()
        if t:
            return t
    return None


def _team_from_pbxproj():
    try:
        with open(PBXPROJ) as f:
            m = re.search(r"DEVELOPMENT_TEAM\s*=\s*([A-Z0-9]{10})\s*;", f.read())
            return m.group(1) if m else None
    except OSError:
        return None


def bundle_id_from_pbxproj():
    try:
        with open(PBXPROJ) as f:
            m = re.search(r'PRODUCT_BUNDLE_IDENTIFIER\s*=\s*"?([A-Za-z0-9.\-]+)"?\s*;', f.read())
            return m.group(1) if m else None
    except OSError:
        return None


def _team_from_xcode_prefs():
    """Team ID из кэша аккаунтов Xcode (появляется сразу после входа в Apple ID,
    ещё до создания сертификата)."""
    r = subprocess.run(["defaults", "read", "com.apple.dt.Xcode", "IDEProvisioningTeams"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return None
    # Предпочитаем платную команду; если нет — берём любую (личную).
    paid = re.search(r'isFreeProvisioningTeam\s*=\s*0;.*?teamID\s*=\s*"?([A-Z0-9]{10})"?',
                     r.stdout, re.DOTALL)
    if paid:
        return paid.group(1)
    m = re.search(r'teamID\s*=\s*"?([A-Z0-9]{10})"?', r.stdout)
    return m.group(1) if m else None


def _team_from_identities():
    p = run(["security", "find-identity", "-v", "-p", "codesigning"],
            capture=True, check=False)
    teams = re.findall(
        r'"(?:Apple Development|iPhone Developer|Apple Distribution)[^"]*\(([A-Z0-9]{10})\)"',
        p.stdout or "")
    return teams[0] if teams else None


def _team_from_profiles():
    prof_dirs = [
        os.path.expanduser("~/Library/MobileDevice/Provisioning Profiles"),
        os.path.expanduser("~/Library/Developer/Xcode/UserData/Provisioning Profiles"),
    ]
    for d in prof_dirs:
        for p in glob.glob(os.path.join(d, "*.mobileprovision")) + \
                 glob.glob(os.path.join(d, "*.provisionprofile")):
            try:
                r = subprocess.run(["security", "cms", "-D", "-i", p],
                                   capture_output=True, text=True)
                m = re.search(
                    r"<key>TeamIdentifier</key>\s*<array>\s*<string>([A-Z0-9]{10})</string>",
                    r.stdout or "")
                if m:
                    return m.group(1)
            except Exception:
                continue
    return None


# --- симуляторы -------------------------------------------------------------

def list_simulators():
    p = run(["xcrun", "simctl", "list", "devices", "available", "--json"], capture=True)
    data = json.loads(p.stdout)
    devices = []
    for runtime, devs in data.get("devices", {}).items():
        if "iOS" not in runtime:
            continue
        for d in devs:
            if d.get("isAvailable", False):
                d["_runtime"] = runtime
                devices.append(d)
    return devices


def pick_simulator(preferred):
    devices = list_simulators()
    if not devices:
        err("Нет доступных iOS-симуляторов. Xcode → Settings → Platforms → установите iOS Simulator.")
        sys.exit(1)
    for d in devices:
        if d["name"] == preferred:
            return d

    def rank(d):
        name = d["name"]
        m = re.search(r"iPhone\s+(\d+)", name)
        number = int(m.group(1)) if m else 0
        tier = 3 if "Pro Max" in name else 2 if "Pro" in name else 1 if "Plus" in name else 0
        return (number, tier)

    iphones = sorted([d for d in devices if d["name"].startswith("iPhone")],
                     key=rank, reverse=True)
    if iphones:
        warn(f"Симулятор «{preferred}» не найден, беру «{iphones[0]['name']}».")
        return iphones[0]
    warn(f"iPhone не найден, беру «{devices[0]['name']}».")
    return devices[0]


def boot_simulator(dev):
    udid = dev["udid"]
    if dev.get("state") != "Booted":
        info(f"Загружаю симулятор: {dev['name']}")
        run(["xcrun", "simctl", "boot", udid], check=False)
    else:
        ok(f"Симулятор уже запущен: {dev['name']}")
    run(["open", "-a", "Simulator"], check=False)
    return udid


# --- сборка -----------------------------------------------------------------

def xcodebuild(dest, extra_args, clean):
    info("Сборка через xcodebuild (первый раз может быть долго)…")
    cmd = ["xcodebuild",
           "-project", PROJECT,
           "-scheme", SCHEME,
           "-configuration", "Debug",
           "-destination", dest,
           "-derivedDataPath", DERIVED] + extra_args
    if clean:
        cmd.append("clean")
    cmd.append("build")

    if have("xcbeautify"):
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        beauty = subprocess.Popen(["xcbeautify"], stdin=proc.stdout)
        proc.stdout.close()
        beauty.communicate()
        rc = proc.wait()
    else:
        rc = subprocess.run(cmd).returncode
    return rc


def find_app(sdk):
    """sdk: 'iphonesimulator' или 'iphoneos'."""
    pattern = os.path.join(DERIVED, "Build", "Products", f"Debug-{sdk}", "*.app")
    apps = glob.glob(pattern)
    if not apps:
        err("Собранное приложение не найдено.")
        sys.exit(1)
    return apps[0]


def bundle_id_of(app):
    """Читает реальный CFBundleIdentifier из собранного .app."""
    plist = os.path.join(app, "Info.plist")
    r = subprocess.run(["plutil", "-extract", "CFBundleIdentifier", "raw", "-o", "-", plist],
                       capture_output=True, text=True)
    bid = (r.stdout or "").strip()
    return bid or BUNDLE_ID


# --- запуск: симулятор ------------------------------------------------------

def run_on_simulator(args):
    dev = pick_simulator(args.device)
    udid = boot_simulator(dev)

    rc = xcodebuild(f"platform=iOS Simulator,id={udid}",
                    ["CODE_SIGNING_ALLOWED=NO"], args.clean)
    if rc != 0:
        err("Сборка не удалась. Скопируйте ошибки выше — по ним легко поправить код.")
        sys.exit(rc)
    ok("Сборка завершена.")

    app = find_app("iphonesimulator")
    bid = bundle_id_of(app)
    info(f"Устанавливаю {os.path.basename(app)} на симулятор…")
    run(["xcrun", "simctl", "install", udid, app])
    info("Запускаю приложение…")
    run(["xcrun", "simctl", "launch", udid, bid], check=False)
    ok("Готово — приложение запущено в симуляторе.")


# --- запуск: реальный iPhone ------------------------------------------------

def run_on_device(dev, args):
    ok(f"Целевое устройство: {dev['name']} ({dev.get('transport') or 'wired'})")

    team = detect_team(args.team)
    if not team:
        err("Не удалось определить Apple Development Team ID.")
        warn("Сделайте один раз (Apple так требует для первой подписи):")
        warn("  Xcode → открой iOS/Doe.xcodeproj → таргет Doe → вкладка")
        warn("  «Signing & Capabilities» → в поле Team выбери «… (Personal Team)».")
        warn("  Это запишет Team ID в проект — дальше скрипт всё делает сам.")
        warn("Либо, если знаешь ID:  python run_ios.py --real --team ABCDE12345")
        warn("Проверить, что видит система:  defaults read com.apple.dt.Xcode IDEProvisioningTeams")
        sys.exit(1)
    ok(f"Team ID для подписи: {team}")

    bid_build = args.bundle_id or bundle_id_from_pbxproj() or BUNDLE_ID
    extra = ["-allowProvisioningUpdates",
             "CODE_SIGN_STYLE=Automatic",
             f"DEVELOPMENT_TEAM={team}",
             f"PRODUCT_BUNDLE_IDENTIFIER={bid_build}"]  # всегда явно — pbxproj бывает пустой
    ok(f"Bundle identifier: {bid_build}")

    # Собираем прицельно под подключённый телефон — тогда -allowProvisioningUpdates
    # сам зарегистрирует устройство в профиле (иначе «team has no devices»).
    dest_id = dev.get("udid") or dev.get("id")
    rc = xcodebuild(f"platform=iOS,id={dest_id}", extra, args.clean)
    if rc != 0:
        # Фолбэк: обобщённая сборка (если id не принялся destination'ом).
        warn("Пробую обобщённую сборку под iOS…")
        rc = xcodebuild("generic/platform=iOS", extra, args.clean)
    if rc != 0:
        err("Сборка/подпись не удалась.")
        warn("Частые причины:")
        warn("  • не выполнен вход в Apple ID: Xcode → Settings → Accounts;")
        warn("  • bundle id занят другим аккаунтом — задайте свой:")
        warn("      python run_ios.py --real --bundle-id com.твоёимя.doe")
        warn("  • на телефоне не включён Developer Mode (Settings → Privacy & Security).")
        sys.exit(rc)
    ok("Сборка и подпись завершены.")

    app = find_app("iphoneos")
    bid = bundle_id_of(app)

    target = dev.get("id") or dev.get("udid")
    info(f"Ставлю {os.path.basename(app)} на {dev['name']}…")
    r = subprocess.run(
        ["xcrun", "devicectl", "device", "install", "app", "--device", target, app])
    if r.returncode != 0:
        err("Не удалось установить приложение на устройство.")
        warn("Проверьте: iPhone разблокирован, ответили «Доверять», Developer Mode включён.")
        sys.exit(r.returncode)

    info("Запускаю приложение на устройстве…")
    r = subprocess.run(
        ["xcrun", "devicectl", "device", "process", "launch", "--device", target, bid])
    if r.returncode != 0:
        warn("Приложение установлено, но не запустилось автоматически.")
        warn("Первый запуск: на iPhone откройте Settings → General → VPN & Device")
        warn("Management → ваш Apple ID → Trust, затем откройте приложение вручную.")
        return
    ok(f"Готово — Doe запущен на «{dev['name']}».")
    warn("Напоминание: на бесплатном Apple ID подпись живёт ~7 дней, потом пересоберите.")


# --- main -------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Запуск iOS-версии Doe (симулятор или реальный iPhone)")
    ap.add_argument("--real", action="store_true", help="только реальное устройство")
    ap.add_argument("--sim", action="store_true", help="только симулятор")
    ap.add_argument("--device", default=DEFAULT_DEVICE, help="имя симулятора")
    ap.add_argument("--team", help="Apple Development Team ID (10 символов)")
    ap.add_argument("--bundle-id", dest="bundle_id", help="переопределить bundle identifier")
    ap.add_argument("--clean", action="store_true", help="чистая сборка")
    ap.add_argument("--xcode", action="store_true", help="дополнительно открыть проект в Xcode")
    args = ap.parse_args()

    if args.real and args.sim:
        err("Флаги --real и --sim взаимоисключающие.")
        sys.exit(1)

    preflight()

    if args.xcode:
        info("Открываю проект в Xcode…")
        run(["open", PROJECT], check=False)

    # Определяем цель.
    devices = [] if args.sim else list_physical_devices()

    if args.real:
        if not devices:
            err("Реальное устройство не найдено.")
            warn("Подключите iPhone кабелем, разблокируйте и ответьте «Доверять».")
            warn("Нужен Xcode 15+ (xcrun devicectl). Проверить: xcrun devicectl list devices")
            sys.exit(1)
        run_on_device(devices[0], args)
        return

    if args.sim:
        run_on_simulator(args)
        return

    # Авто-режим: есть подключённый iPhone → ставим на него, иначе симулятор.
    if devices:
        if len(devices) > 1:
            warn("Подключено несколько устройств, беру первое: "
                 + ", ".join(d["name"] for d in devices))
        run_on_device(devices[0], args)
    else:
        info("Реальный iPhone не подключён — запускаю на симуляторе. "
             "(Подключите телефон и запустите снова для установки на него.)")
        run_on_simulator(args)


if __name__ == "__main__":
    main()
