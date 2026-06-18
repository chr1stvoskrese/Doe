"""
Детекция характеристик железа для подбора моделей ИИ.

Важно: мы намеренно НЕ измеряем свободную RAM — она не объективна
(зависит от запущенных приложений, браузера, кэша и т.д.).
Опираемся на статичные характеристики: общий объём памяти и тип GPU.
"""
import os
import sys
import platform
import subprocess
from functools import lru_cache

# Порядок tier'ов важен для сравнения (light < standard < pro)
TIERS = ["light", "standard", "pro"]
TIER_RANK = {t: i for i, t in enumerate(TIERS)}


@lru_cache(maxsize=1)
def detect_total_ram_gb() -> int:
    """Общий объём RAM в ГБ (округлённо вверх). Статичная характеристика."""
    try:
        if sys.platform == "darwin":
            # sysctl возвращает байты
            out = subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True).strip()
            return max(1, int(int(out) / (1024 ** 3)))
        elif sys.platform == "win32":
            import ctypes
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]
            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(stat)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
            return max(1, int(stat.ullTotalPhys / (1024 ** 3)))
        else:  # Linux и прочее
            with open("/proc/meminfo", "r") as f:
                for line in f:
                    if line.startswith("MemTotal:"):
                        kb = int(line.split()[1])
                        return max(1, int(kb / (1024 ** 2)))
    except Exception:
        pass
    return 0


@lru_cache(maxsize=1)
def detect_gpu_backend() -> str:
    """
    Возвращает тип доступного GPU-бэкенда для llama-cpp-python:
    - "metal"  — Apple Silicon (встроенный GPU, unified memory)
    - "cuda"   — NVIDIA (пока не реализовано в этой итерации)
    - "vulkan" — AMD/прочие (пока не реализовано в этой итерации)
    - "cpu"    — никакого ускорения
    """
    if sys.platform == "darwin":
        # Apple Silicon: arm64 + macOS = Metal доступен
        if platform.machine() == "arm64":
            return "metal"
        # Intel Mac — только CPU
        return "cpu"

    # Windows / Linux — пока в этой итерации не поддерживаем GPU.
    # (Vulkan/CUDA-сборка для RX6600 и NVIDIA — следующая итерация.)
    return "cpu"


@lru_cache(maxsize=1)
def get_hardware_tier() -> str:
    """
    Маппинг RAM в tier. Определяет, какие модели можно предложить.
    - light    — < 16 ГБ  (малыши: E2B, E4B)
    - standard — 16–31 ГБ (E2B, E4B, 12B)
    - pro      — 32+ ГБ   (всё, включая 26B-A4B MoE)
    """
    ram = detect_total_ram_gb()
    if ram == 0:
        # Не удалось определить — даём минимум, безопасный для любого железа
        return "light"
    if ram < 16:
        return "light"
    if ram < 32:
        return "standard"
    return "pro"


def tier_allows(hardware_tier: str, model_tier: str) -> bool:
    """Проверяет, что hardware_tier допускает запуск model_tier."""
    return TIER_RANK.get(hardware_tier, 0) >= TIER_RANK.get(model_tier, 0)


@lru_cache(maxsize=1)
def get_hardware_profile() -> dict:
    """Единый снимок железа для API/UI."""
    return {
        "ram_gb": detect_total_ram_gb(),
        "gpu_backend": detect_gpu_backend(),
        "tier": get_hardware_tier(),
        "platform": sys.platform,
        "machine": platform.machine(),
    }
