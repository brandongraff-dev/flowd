"""Synthetic settled-post export for tests, demos and the trainer's dry run.

NOT real data and never to be presented as such: every artifact trained on it carries ``synthetic: true`` in its model
card. The generator plants a market whose true drivers differ from the checklist's weights (a step checklist versus
smooth effects, an interaction, items that matter less than their weight), which is exactly the situation a learned
scorer exists for, so a working trainer must beat the checklist on held-out apps here.
"""

from __future__ import annotations

import math
import random
from datetime import UTC, datetime, timedelta

from ..constants import ENUM_CATEGORIES, ENUM_FORMAT_IDS, ENUM_HOOK_TYPES, FACELESS_FORMATS
from ..scoring.core import FlowObs, HookObs, score_flow_raw, score_hook_raw
from ..scoring.hook_types import above_median_types
from .schema import SettledPostRow

_ABOVE = above_median_types()
_BASE_DAY = datetime(2026, 7, 5, tzinfo=UTC)


def _true_effect(r: dict[str, float | bool | None]) -> float:
    """ln(views lift) the market 'really' pays for, before noise."""
    g = lambda k, default=10_000.0: float(r[k]) if r[k] is not None else default  # noqa: E731
    e = 0.0
    e -= 0.18 * (min(g("lands_ms"), 6000) - 1500) / 1000
    e -= 0.10 * (min(g("app_ms"), 12_000) - 3000) / 1000 if g("app_ms") > 3000 else 0.0
    e += 0.10 if g("face_ms") <= 1000 else 0.0
    e += 0.12 if g("interrupt_ms") <= 1500 else 0.0
    e += 0.18 if r["hook_type_above_median"] else (0.05 if r["hook_type_known"] else 0.0)
    e += 0.12 if (r["hook_type_above_median"] and g("app_ms") <= 3000) else 0.0
    e += 0.10 if r["spoken_matches_onscreen"] else 0.0
    e += 0.04 if r["captions_in_safe_zone"] else 0.0
    e -= 0.02 if r["disclosure_onscreen"] else 0.0
    e += 0.25 * float(r["coverage"] or 0.0)
    e += 0.08 if r["single_cta"] else 0.0
    e += 0.10 if r["ends_on_win_state"] else 0.0
    e -= 0.07 * float(r["audio_gaps"] or 0.0)
    e -= 0.01 * abs(float(r["duration_s"] or 22.0) - 22)
    e -= {"in_order": 0.0, "one_off": 0.07, "out_of_order": 0.15}[str(r["format_order"])]
    return e


def generate_settled_posts(n: int = 1500, n_apps: int = 14, seed: int = 7) -> list[SettledPostRow]:
    rng = random.Random(seed)
    apps = [
        (f"app_synth_{i:02d}", rng.choice(ENUM_CATEGORIES), rng.gauss(0, 0.45), rng.uniform(0.8, 1.3))
        for i in range(n_apps)
    ]
    n_creators = max(20, n // 5)
    creators = [
        (f"cr_synth_{i:03d}", math.exp(rng.gauss(math.log(9000), 0.9)), rng.gauss(0, 0.40)) for i in range(n_creators)
    ]
    rows: list[SettledPostRow] = []
    for i in range(n):
        app_id, category, app_shift, app_conv = apps[rng.randrange(n_apps)]
        creator_id, creator_median, creator_shift = creators[rng.randrange(n_creators)]
        fmt = rng.choice(ENUM_FORMAT_IDS)
        faceless = fmt in FACELESS_FORMATS
        q = min(1.0, max(0.0, rng.betavariate(2, 2)))
        lands = None if rng.random() < 0.03 else max(100, round(rng.gauss(2300 - 1500 * q, 800)))
        onscreen = None if rng.random() < 0.18 else max(100, round(rng.gauss(1600 - 900 * q, 700)))
        matches = onscreen is not None and rng.random() < 0.45 + 0.45 * q
        face = None if faceless or rng.random() < 0.08 else max(100, round(rng.gauss(1400 - 800 * q, 700)))
        app_ms = None if rng.random() < 0.04 else max(200, round(rng.lognormvariate(math.log(3800 - 2200 * q), 0.55)))
        interrupt = None if rng.random() < 0.2 else max(200, round(rng.gauss(1800 - 900 * q, 700)))
        hook_type = rng.choice(ENUM_HOOK_TYPES) if rng.random() < 0.62 + 0.25 * q else None
        known = hook_type is not None
        above = bool(hook_type and hook_type in _ABOVE)
        speech = None if rng.random() < 0.02 else max(0, round(rng.gauss(900 - 500 * q, 450)))
        captions = rng.random() < 0.55 + 0.35 * q
        required = rng.choice([3, 4, 5, 5, 6])
        found = min(required, max(0, round(required * min(1.0, rng.gauss(0.55 + 0.4 * q, 0.2)))))
        disc_audio, disc_screen = rng.random() < 0.8, rng.random() < 0.85
        duration = max(6.0, rng.gauss(24, 9))
        single_cta = rng.random() < 0.5 + 0.35 * q
        win = rng.random() < 0.45 + 0.4 * q
        gaps = max(0, round(rng.gauss(1.4 - 1.2 * q, 1.0)))
        order = rng.choices(["in_order", "one_off", "out_of_order"], weights=[0.5 + 0.35 * q, 0.3, 0.2 - 0.15 * q])[0]

        hook_obs = HookObs(
            lands_ms=lands,
            onscreen_ms=onscreen,
            spoken_matches_onscreen=matches,
            face_ms=face,
            faceless=faceless,
            app_ms=app_ms,
            interrupt_ms=interrupt,
            hook_type_known=known,
            hook_type_above_median=above,
            speech_ms=speech,
            captions_in_safe_zone=captions,
        )
        hook = score_hook_raw(hook_obs)
        flow = score_flow_raw(
            FlowObs(
                hook_points=hook.points,
                beats_found=found,
                beats_required=required,
                app_ms=app_ms,
                disclosure_audio=disc_audio,
                disclosure_onscreen=disc_screen,
                duration_s=duration,
                captions_in_safe_zone=captions,
                single_cta=single_cta,
                ends_on_win_state=win,
                audio_gaps=gaps,
                format_order=order,
            )
        )
        effect = _true_effect(
            {
                "lands_ms": lands,
                "app_ms": app_ms,
                "face_ms": face,
                "interrupt_ms": interrupt,
                "hook_type_above_median": above,
                "hook_type_known": known,
                "spoken_matches_onscreen": matches,
                "captions_in_safe_zone": captions,
                "disclosure_onscreen": disc_screen,
                "coverage": found / required,
                "single_cta": single_cta,
                "ends_on_win_state": win,
                "audio_gaps": gaps,
                "duration_s": duration,
                "format_order": order,
            }
        )
        noise = rng.gauss(0, 0.35)
        views = max(0, round(creator_median * math.exp(effect + app_shift + creator_shift * 0.3 + noise)))
        rate_per_1k = 1.7 * app_conv * math.exp(0.35 * effect + rng.gauss(0, 0.25))
        installs = max(
            0, round(views * rate_per_1k / 1000 + rng.gauss(0, math.sqrt(max(views * rate_per_1k / 1000, 0.25))))
        )
        trial_p = min(0.5, 0.062 * math.exp(0.25 * effect + rng.gauss(0, 0.2)))
        trials = max(
            0, min(installs, round(installs * trial_p + rng.gauss(0, math.sqrt(max(installs * trial_p, 0.25)))))
        )
        paid = max(0, min(trials, round(trials * 0.348 + rng.gauss(0, math.sqrt(max(trials * 0.25, 0.25))))))
        posted = _BASE_DAY + timedelta(days=rng.randint(0, 80), hours=rng.randint(0, 23))
        rows.append(
            SettledPostRow(
                post_id=f"post_synth_{i:05d}",
                app_id=app_id,
                category=category,
                creator_id=creator_id,
                format_id=fmt,
                hook_type=hook_type,
                lands_ms=lands,
                onscreen_ms=onscreen,
                spoken_matches_onscreen=matches,
                face_ms=face,
                faceless=faceless,
                app_ms=app_ms,
                interrupt_ms=interrupt,
                hook_type_known=known,
                hook_type_above_median=above,
                speech_ms=speech,
                captions_in_safe_zone=captions,
                beats_found=found,
                beats_required=required,
                disclosure_audio=disc_audio,
                disclosure_onscreen=disc_screen,
                duration_s=round(duration, 1),
                single_cta=single_cta,
                ends_on_win_state=win,
                audio_gaps=gaps,
                format_order=order,
                hook_points=hook.points,
                flow_points=flow.points,
                flow_band=flow.band,  # type: ignore[arg-type]
                creator_median_views_28d=round(creator_median),
                followers=round(creator_median * rng.uniform(1.5, 12)),
                posted_at=posted.strftime("%Y-%m-%dT%H:%M:%SZ"),
                window_views=views,
                installs=installs,
                trials=trials,
                paid=paid,
                likes=round(views * rng.uniform(0.02, 0.09)),
                comments=round(views * rng.uniform(0.001, 0.008)),
                fraud_score=rng.choice([0, 0, 0, 5, 10, 15, 25]),
                clawed_back=False,
            )
        )
    return rows
