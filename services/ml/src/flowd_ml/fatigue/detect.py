"""Fatigue rule: the rate is down 30% from its peak, on a trailing three-day median so one lucky or one bad day cannot move it."""

from __future__ import annotations

from datetime import date

from ..constants import FATIGUE_DROP_RATIO, FATIGUE_MIN_DAYS, FATIGUE_SMOOTHING_DAYS, FATIGUE_WATCH_RATIO
from ..numeric import median, round2
from ..schemas.common import Fix, ModelInfo, Reason
from ..schemas.fatigue import DailyValue, FatigueRequest, FatigueResponse
from ..version import MODEL_VERSIONS

MODEL = ModelInfo(name="fatigue", kind="fatigue", version=MODEL_VERSIONS["fatigue"], stage="heuristic")

_METRIC_LABEL = {
    "trial_rate": "Trial-start rate",
    "ctr": "Click-through rate",
    "install_rate": "Installs per 1,000 views",
}


def _pct(x: float, metric: str) -> str:
    return f"{x * 100:.1f}%" if metric != "install_rate" else f"{x:.2f}"


def _smooth(days: list[DailyValue], window: int) -> list[float]:
    vals = [d.value for d in days]
    return [median(vals[max(0, i - window + 1) : i + 1]) for i in range(len(vals))]


def detect_fatigue(req: FatigueRequest) -> FatigueResponse:
    metric = req.metric
    label = _METRIC_LABEL[metric]
    days = sorted(req.series, key=lambda d: d.date)
    usable = [d for d in days if d.volume is None or d.volume >= req.min_volume]
    if len(usable) < FATIGUE_MIN_DAYS:
        msg = f"Not enough data: {len(usable)} usable days, need {FATIGUE_MIN_DAYS}."
        return FatigueResponse(
            model=MODEL,
            state="insufficient_data",
            metric=metric,
            message=msg,
            reasons=[
                Reason(
                    code="insufficient_data",
                    severity="info",
                    title="Not enough data",
                    message=msg + f" Days under {req.min_volume} of volume are ignored as noise.",
                )
            ],
            fixes=[Fix(id="wait", text="Check again after a week of data.", effort="quick")],
        )
    smooth = _smooth(usable, FATIGUE_SMOOTHING_DAYS)
    # The peak must be a full smoothing window in; the median then ignores a single lucky day.
    start = min(FATIGUE_SMOOTHING_DAYS - 1, len(smooth) - 1)
    peak_i = max(range(start, len(smooth)), key=lambda i: smooth[i])
    peak = smooth[peak_i]
    current = smooth[-1]
    drop = (
        round(1 - current / peak, 6) if peak > 0 else 0.0
    )  # rounded so 0.07 / 0.10 style float noise cannot straddle the 30% line
    peak_on = usable[peak_i].date
    since = (date.fromisoformat(usable[-1].date) - date.fromisoformat(peak_on)).days
    state = "fatigued" if drop >= FATIGUE_DROP_RATIO else "watch" if drop >= FATIGUE_WATCH_RATIO else "healthy"

    base = f"{label} peaked at {_pct(peak, metric)} on {peak_on} and is {_pct(current, metric)} now"
    reasons: list[Reason] = []
    fixes: list[Fix] = []
    if state == "fatigued":
        message = f"{base}: down {drop:.0%} from its peak ({since} days ago). Time to refresh the creative."
        reasons.append(
            Reason(
                code="drop_from_peak",
                severity="critical",
                title="Down from peak",
                message=f"{base}, a {drop:.0%} drop (alert line {FATIGUE_DROP_RATIO:.0%}).",
                impact=round2(-drop * 100),
            )
        )
        fixes = [
            Fix(
                id="refresh_hook",
                text="Commission two new hooks on the same body: the first 3 seconds fatigue first.",
                gain=None,
                effort="moderate",
            ),
            Fix(
                id="rebuy",
                text="Re-buy the winner's structure with a fresh creator (hook x body x CTA test planner).",
                gain=None,
                effort="moderate",
            ),
            Fix(
                id="rotate_ad",
                text="If this is a promoted ad, rotate in the next-best winner and pause this one.",
                gain=None,
                effort="quick",
            ),
        ]
    elif state == "watch":
        message = f"{base}: down {drop:.0%}. Not an alert yet (alert line {FATIGUE_DROP_RATIO:.0%}); keep an eye on it."
        reasons.append(
            Reason(
                code="drop_from_peak",
                severity="warning",
                title="Softening",
                message=f"{base}, a {drop:.0%} drop; the alert fires at {FATIGUE_DROP_RATIO:.0%}.",
                impact=round2(-drop * 100),
            )
        )
        fixes = [
            Fix(
                id="line_up_refresh",
                text="Line up a refresh brief now so it is ready if the drop reaches 30%.",
                effort="quick",
            )
        ]
    else:
        message = f"{base}: no fatigue (down {max(drop, 0):.0%} from peak)."
        reasons.append(
            Reason(
                code="stable",
                severity="positive",
                title="Stable",
                message=f"{base}; the drop is {max(drop, 0):.0%}, under the {FATIGUE_WATCH_RATIO:.0%} watch line.",
            )
        )
    if len(usable) < len(days):
        reasons.append(
            Reason(
                code="noisy_days",
                severity="info",
                title="Noisy days ignored",
                message=f"{len(days) - len(usable)} day(s) under {req.min_volume} of volume were ignored.",
            )
        )
    return FatigueResponse(
        model=MODEL,
        state=state,
        metric=metric,
        peak_value=round(peak, 4),
        peak_on=peak_on,
        current_value=round(current, 4),  # type: ignore[arg-type]
        drop_ratio=round2(max(drop, 0.0)),
        days_since_peak=since,
        message=message,
        reasons=reasons,
        fixes=fixes,
    )
