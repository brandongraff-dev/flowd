"""Auto-QA orchestration: run the checks, build flags, reasons and fixes, decide the verdict."""

from __future__ import annotations

from ..constants import ENUM_QA_CHECKS
from ..schemas.common import BeatHit, Fix, ModelInfo, Reason
from ..schemas.qa import QaCheckOut, QaFlag, QaRequest, QaResponse
from ..version import MODEL_VERSIONS
from .beats import BeatContext, detect_beats
from .checks import SIMPLE_CHECKS, CheckResult, check_brief_beats
from .reasons import meta

MODEL = ModelInfo(name="qa", kind="auto_qa", version=MODEL_VERSIONS["qa"], stage="heuristic")

# Which flag becomes the suggested reason code first when several fail: disclosure blocks settlement, so it leads.
_PRIORITY = ENUM_QA_CHECKS

_RESULT_RANK = {"fail": 2, "warn": 1, "pass": 0}


def beat_context(req: QaRequest) -> BeatContext:
    return BeatContext(
        duration_ms=req.media.duration_ms,
        transcript=req.transcript,
        on_screen_text=req.on_screen_text,
        scenes=req.scenes,
        app_name=req.brief.app_name,
        talking_points=req.brief.talking_points,
        offer_line=req.brief.offer_line,
        cta=req.brief.cta,
    )


def run_checks(req: QaRequest) -> tuple[dict[str, CheckResult], list[str], list[BeatHit]]:
    """Run every requested check. Returns ``(results by check, skipped checks, beat hits)``."""
    wanted = list(req.checks) if req.checks else list(ENUM_QA_CHECKS)
    hits = detect_beats(req.brief.beats, beat_context(req), req.vision.beat_hits if req.vision else None)
    results: dict[str, CheckResult] = {}
    skipped: list[str] = []
    for check in ENUM_QA_CHECKS:
        if check not in wanted:
            continue
        res = check_brief_beats(req, hits) if check == "brief_beats" else SIMPLE_CHECKS[check](req)
        if res is None:
            skipped.append(check)
        else:
            results[check] = res
    return results, skipped, hits


def run_qa(req: QaRequest) -> QaResponse:
    results, skipped, hits = run_checks(req)
    checks: list[QaCheckOut] = []
    flags: list[QaFlag] = []
    for check in ENUM_QA_CHECKS:
        res = results.get(check)
        if res is None:
            continue
        code = res.reason_code if res.result != "pass" else None
        checks.append(
            QaCheckOut(
                check=check,
                result=res.result,
                message=res.message,
                evidence=res.evidence,
                blocks_settlement=res.blocks_settlement and res.result == "fail",
                reason_code=code,
            )  # type: ignore[arg-type]
        )
        if res.result != "pass" and code:
            m = meta(code)
            flags.append(
                QaFlag(
                    check=check,
                    result=res.result,
                    reason_code=code,
                    label=m.label,
                    message=res.message,  # type: ignore[arg-type]
                    creator_copy=m.creator_copy,
                    fix=res.fix or m.fix_hint,
                    evidence=res.evidence,
                    blocks_settlement=res.blocks_settlement and res.result == "fail",
                    t_ms=res.t_ms,
                )
            )
    fails = [f for f in flags if f.result == "fail"]
    warns = [f for f in flags if f.result == "warn"]
    verdict = "fail" if fails else "warn" if warns else "pass"
    blocks = any(f.blocks_settlement for f in flags)
    lead = sorted(fails or warns, key=lambda f: _PRIORITY.index(f.check))
    suggested = lead[0].reason_code if lead else None

    reasons: list[Reason] = []
    for f in sorted(flags, key=lambda f: (-_RESULT_RANK[f.result], _PRIORITY.index(f.check))):
        reasons.append(
            Reason(
                code=f.check,
                severity="critical" if f.result == "fail" else "warning",
                title=f.label,
                message=f.message,
                t_ms=f.t_ms,
                evidence=f.evidence,
            )
        )
    passed_checks = [c for c in checks if c.result == "pass"]
    if passed_checks:
        reasons.append(
            Reason(
                code="passed",
                severity="positive",
                title="Checks passed",
                message=f"{len(passed_checks)} of {len(checks)} checks passed: {', '.join(c.check for c in passed_checks)}.",
            )
        )
    fixes = [
        Fix(
            id=f"fix_{f.check}",
            target=f.check,
            text=f.fix,
            gain=None,
            effort="quick"
            if f.check in {"disclosure_onscreen", "safe_zone", "length", "audio_clarity"}
            else "moderate",
            t_ms=f.t_ms,
        )
        for f in sorted(flags, key=lambda f: (-_RESULT_RANK[f.result], _PRIORITY.index(f.check)))
    ]
    if verdict == "pass":
        summary = f"Pass: {len(checks)} checks passed" + (
            f" ({len(skipped)} skipped for lack of input)." if skipped else "."
        )
    else:
        parts = []
        if fails:
            parts.append(f"{len(fails)} failed ({', '.join(f.check for f in fails)})")
        if warns:
            parts.append(f"{len(warns)} to review ({', '.join(f.check for f in warns)})")
        summary = ("Fail: " if verdict == "fail" else "Review: ") + ", ".join(parts) + "."
        if blocks:
            summary += " Settlement is blocked until the disclosure is fixed."
    return QaResponse(
        model=MODEL,
        verdict=verdict,
        passed=verdict == "pass",
        auto_approvable=verdict == "pass" and not skipped,  # type: ignore[arg-type]
        blocks_settlement=blocks,
        summary=summary,
        checks=checks,
        flags=flags,
        skipped=skipped,  # type: ignore[arg-type]
        beats=hits,
        suggested_reason_code=suggested,
        reasons=reasons,
        fixes=fixes,
    )
