"""Tests for the spaced-repetition scheduler (src/services/srs.py).

The module is pure logic (no DB, only datetime), so a fixed `now` makes every
schedule deterministic. Grades: 1=Again, 2=Hard, 3=Good, 4=Easy.
"""
from datetime import datetime, timedelta

import pytest

from src.services import srs

NOW = datetime(2026, 1, 1, 12, 0, 0)


# --------------------------------------------------------------------------- #
# default_state / initial_due
# --------------------------------------------------------------------------- #

def test_default_state_shape():
    st = srs.default_state()
    assert st["state"] == "learning"
    assert st["step_index"] == 0
    assert st["ease_factor"] == srs.DEFAULTS["starting_ease"]
    assert st["interval_days"] == 0.0
    assert st["repetitions"] == 0
    assert st["lapses"] == 0


def test_initial_due_uses_first_learning_step():
    due = srs.initial_due(now=NOW)
    assert due == NOW + timedelta(minutes=srs.DEFAULTS["learning_steps_min"][0])


# --------------------------------------------------------------------------- #
# learning phase
# --------------------------------------------------------------------------- #

def test_good_advances_one_learning_step():
    st = srs.default_state()
    res = srs.schedule(st, srs.GOOD, now=NOW)
    assert res["state"] == "learning"
    assert res["step_index"] == 1
    # due after the second learning step (60 min)
    assert res["due_at"] == NOW + timedelta(minutes=srs.DEFAULTS["learning_steps_min"][1])


def test_again_resets_learning_to_first_step():
    st = srs.default_state()
    st["step_index"] = 2
    res = srs.schedule(st, srs.AGAIN, now=NOW)
    assert res["state"] == "learning"
    assert res["step_index"] == 0
    assert res["due_at"] == NOW + timedelta(minutes=srs.DEFAULTS["learning_steps_min"][0])


def test_good_on_last_step_graduates_to_review():
    st = srs.default_state()
    st["step_index"] = len(srs.DEFAULTS["learning_steps_min"]) - 1  # last step
    res = srs.schedule(st, srs.GOOD, now=NOW)
    assert res["state"] == "review"
    assert res["repetitions"] == 1
    assert res["interval_days"] == srs.DEFAULTS["graduating_interval_days"]
    assert res["due_at"] == NOW + timedelta(days=srs.DEFAULTS["graduating_interval_days"])


def test_easy_graduates_immediately():
    st = srs.default_state()
    res = srs.schedule(st, srs.EASY, now=NOW)
    assert res["state"] == "review"
    assert res["interval_days"] == srs.DEFAULTS["easy_interval_days"]


# --------------------------------------------------------------------------- #
# review phase (SM-2)
# --------------------------------------------------------------------------- #

def _review_state(interval_days=10.0, ease=2.5, reps=3):
    st = srs.default_state()
    st.update(state="review", interval_days=interval_days,
              ease_factor=ease, repetitions=reps)
    return st


def test_review_good_multiplies_interval_by_ease():
    st = _review_state(interval_days=10.0, ease=2.5)
    res = srs.schedule(st, srs.GOOD, now=NOW)
    assert res["state"] == "review"
    assert res["interval_days"] == pytest.approx(10.0 * 2.5)
    assert res["repetitions"] == 4


def test_review_easy_grows_faster_than_good():
    good = srs.schedule(_review_state(), srs.GOOD, now=NOW)
    easy = srs.schedule(_review_state(), srs.EASY, now=NOW)
    assert easy["interval_days"] > good["interval_days"]
    # Easy also raises the ease factor
    assert easy["ease_factor"] > 2.5


def test_review_hard_lowers_ease_and_grows_slowly():
    res = srs.schedule(_review_state(ease=2.5), srs.HARD, now=NOW)
    assert res["ease_factor"] == pytest.approx(2.35)  # 2.5 - 0.15
    assert res["interval_days"] == pytest.approx(10.0 * srs.DEFAULTS["hard_interval_factor"])


def test_review_again_causes_lapse_and_returns_to_learning():
    st = _review_state(interval_days=30.0, ease=2.5)
    res = srs.schedule(st, srs.AGAIN, now=NOW)
    assert res["state"] == "learning"
    assert res["step_index"] == 0
    assert res["lapses"] == 1
    assert res["repetitions"] == 0
    assert res["ease_factor"] == pytest.approx(2.30)  # 2.5 - 0.20
    # default lapse_interval_factor is 0 -> interval collapses
    assert res["interval_days"] == 0.0


def test_ease_factor_never_drops_below_minimum():
    st = _review_state(ease=srs.DEFAULTS["min_ease"])
    res = srs.schedule(st, srs.HARD, now=NOW)
    assert res["ease_factor"] >= srs.DEFAULTS["min_ease"]


def test_interval_is_capped_at_maximum():
    st = _review_state(interval_days=srs.DEFAULTS["max_interval_days"], ease=2.5)
    res = srs.schedule(st, srs.EASY, now=NOW)
    assert res["interval_days"] <= srs.DEFAULTS["max_interval_days"]


# --------------------------------------------------------------------------- #
# validation & preview
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("bad_grade", [0, 5, -1, 99])
def test_invalid_grade_raises(bad_grade):
    with pytest.raises(ValueError):
        srs.schedule(srs.default_state(), bad_grade, now=NOW)


def test_preview_returns_all_four_grades_ascending():
    st = _review_state()
    preview = srs.preview_intervals(st, now=NOW)
    assert set(preview) == {"again", "hard", "good", "easy"}
    # A correct scheduler orders the next-due dates: again < hard < good < easy
    assert preview["again"] < preview["hard"] < preview["good"] < preview["easy"]


def test_schedule_does_not_mutate_input_state():
    st = srs.default_state()
    snapshot = dict(st)
    srs.schedule(st, srs.GOOD, now=NOW)
    assert st == snapshot  # scheduler must return a new dict, not edit in place
