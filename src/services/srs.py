"""
Чистый планировщик интервальных повторений (spaced repetition).

Гибрид: короткие «learning»-шаги (как кривая Эббингауза на старте: минуты/часы),
затем переход в «review» с алгоритмом SM-2 (научно проверенная основа Anki/SuperMemo).

Оценки (grade), 4 градации как в Anki:
    1 = Again  (забыл)
    2 = Hard   (трудно)
    3 = Good   (хорошо)
    4 = Easy   (легко)

Модуль НЕ зависит от БД/SQLAlchemy — только datetime, поэтому легко тестируется.
Функции принимают и возвращают простые dict'ы со SRS-состоянием.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone


def _utcnow() -> datetime:
    # naive UTC — то же значение, что и datetime.utcnow(), но без DeprecationWarning
    return datetime.now(timezone.utc).replace(tzinfo=None)


# Грейды
AGAIN, HARD, GOOD, EASY = 1, 2, 3, 4

DEFAULTS = {
    # Шаги обучения в минутах до «выпуска» в режим review.
    # 10 мин → 1 час → 9 часов (близко к ранней части кривой Эббингауза).
    "learning_steps_min": [10, 60, 540],
    "graduating_interval_days": 1.0,   # интервал после прохождения всех шагов (Good)
    "easy_interval_days": 4.0,         # интервал при «Easy» прямо в обучении
    "starting_ease": 2.5,              # стартовый коэффициент лёгкости (SM-2)
    "min_ease": 1.3,
    "easy_bonus": 1.3,                 # множитель за «Easy» в review
    "hard_interval_factor": 1.2,       # множитель интервала за «Hard»
    "lapse_interval_factor": 0.0,      # доля интервала, сохраняемая после забывания (0 = сброс)
    "max_interval_days": 365 * 10,
}


def default_state(settings: dict | None = None) -> dict:
    s = {**DEFAULTS, **(settings or {})}
    return {
        "state": "learning",
        "step_index": 0,
        "ease_factor": s["starting_ease"],
        "interval_days": 0.0,
        "repetitions": 0,
        "lapses": 0,
    }


def initial_due(settings: dict | None = None, now: datetime | None = None) -> datetime:
    """Когда показать новый элемент впервые — через первый learning-шаг."""
    s = {**DEFAULTS, **(settings or {})}
    now = now or _utcnow()
    first = s["learning_steps_min"][0] if s["learning_steps_min"] else 10
    return now + timedelta(minutes=first)


def _clamp_interval(days: float, s: dict) -> float:
    return max(0.0, min(float(days), float(s["max_interval_days"])))


def schedule(state: dict, grade: int, settings: dict | None = None,
             now: datetime | None = None) -> dict:
    """Принимает текущее SRS-состояние и оценку, возвращает новое состояние.

    Возвращаемый dict содержит: state, step_index, ease_factor, interval_days,
    repetitions, lapses, due_at (datetime), last_grade.
    """
    if grade not in (AGAIN, HARD, GOOD, EASY):
        raise ValueError(f"grade должен быть 1..4, получено {grade!r}")

    s = {**DEFAULTS, **(settings or {})}
    now = now or _utcnow()
    steps = list(s["learning_steps_min"]) or [10]

    st = {
        "state": state.get("state", "learning"),
        "step_index": int(state.get("step_index", 0)),
        "ease_factor": float(state.get("ease_factor", s["starting_ease"])),
        "interval_days": float(state.get("interval_days", 0.0)),
        "repetitions": int(state.get("repetitions", 0)),
        "lapses": int(state.get("lapses", 0)),
    }

    def in_minutes(mins):
        return now + timedelta(minutes=mins)

    def in_days(days):
        return now + timedelta(days=days)

    # ---------------- LEARNING ----------------
    if st["state"] == "learning":
        if grade == AGAIN:
            st["step_index"] = 0
            due = in_minutes(steps[0])
        elif grade == HARD:
            # остаёмся на текущем шаге (повтор)
            idx = min(st["step_index"], len(steps) - 1)
            due = in_minutes(steps[idx])
        elif grade == GOOD:
            st["step_index"] += 1
            if st["step_index"] >= len(steps):
                # выпуск в review
                st["state"] = "review"
                st["interval_days"] = _clamp_interval(s["graduating_interval_days"], s)
                st["repetitions"] = 1
                due = in_days(st["interval_days"])
            else:
                due = in_minutes(steps[st["step_index"]])
        else:  # EASY — мгновенный выпуск
            st["state"] = "review"
            st["interval_days"] = _clamp_interval(s["easy_interval_days"], s)
            st["repetitions"] = 1
            due = in_days(st["interval_days"])

    # ---------------- REVIEW (SM-2) ----------------
    else:
        ef = st["ease_factor"]
        if grade == AGAIN:
            # забыл → откатываемся в обучение
            st["lapses"] += 1
            st["repetitions"] = 0
            st["ease_factor"] = max(s["min_ease"], ef - 0.20)
            st["interval_days"] = _clamp_interval(
                st["interval_days"] * s["lapse_interval_factor"], s)
            st["state"] = "learning"
            st["step_index"] = 0
            due = in_minutes(steps[0])
        else:
            prev = max(st["interval_days"], s["graduating_interval_days"])
            if grade == HARD:
                st["ease_factor"] = max(s["min_ease"], ef - 0.15)
                new_int = prev * s["hard_interval_factor"]
            elif grade == GOOD:
                st["ease_factor"] = max(s["min_ease"], ef)
                new_int = prev * st["ease_factor"]
            else:  # EASY
                st["ease_factor"] = ef + 0.15
                new_int = prev * st["ease_factor"] * s["easy_bonus"]
            st["interval_days"] = _clamp_interval(new_int, s)
            st["repetitions"] += 1
            due = in_days(st["interval_days"])

    st["last_grade"] = grade
    st["due_at"] = due
    return st


def preview_intervals(state: dict, settings: dict | None = None,
                      now: datetime | None = None) -> dict:
    """Для UI: что будет с каждым из 4 грейдов (человекочитаемо)."""
    now = now or _utcnow()
    out = {}
    for grade, name in ((AGAIN, "again"), (HARD, "hard"), (GOOD, "good"), (EASY, "easy")):
        res = schedule(dict(state), grade, settings, now)
        out[name] = res["due_at"]
    return out
