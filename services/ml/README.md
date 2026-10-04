# flowd ML service

Day-one **pretrained + rules** models for the flowd creator market, behind one FastAPI app. Money follows what works, so every
video gets priced, scored and checked, and every answer says **why**.

> **Honesty rule.** Hook Score and Flow Score are **checklist scores** until a learned model beats them on held-out apps
> (about 1,000 settled posts). Every score response carries the label *"Checklist score. It gets smarter as bounties settle."*

- 9 endpoints under `/v1` (+ phash, embed, models, meta), OpenAPI at [`openapi.json`](openapi.json)
- Pure Python runtime: scores, QA, fraud, matching, pricing, fatigue and perceptual hashing need **no GPU, no numpy, no downloads**
- Video understanding behind **adapter interfaces**: deterministic fake adapters for tests/dev/CI, real Whisper / PySceneDetect / Claude VLM / SigLIP adapters behind lazy imports
- LightGBM trainer, held-out-app evaluation, model card writer, calibration reports
- Golden vectors for the TypeScript and Swift engines: [`packages/contract/testvectors/ml/`](../../packages/contract/testvectors/ml/README.md)

## Quick start

Python **3.12 or newer** (tested on 3.12, 3.13 and 3.14; the Docker and Modal images run 3.12). Create the virtualenv **outside the repo** (OneDrive folders and venvs do not mix):

```powershell
python -m venv $env:TEMP\flowd-ml-venv
$env:TEMP\flowd-ml-venv\Scripts\python -m pip install -e ".[dev]"      # from services/ml
$env:TEMP\flowd-ml-venv\Scripts\python -m pytest                        # the whole suite
$env:TEMP\flowd-ml-venv\Scripts\python -m flowd_ml.cli serve --port 8080
```

```bash
curl -s localhost:8080/v1/hook-score -H 'content-type: application/json' -d '{
  "lands_ms": 3600, "face_ms": 3100, "app_ms": 6200, "speech_ms": 1700, "creator_median_views": 14200
}'
```

```jsonc
{
  "model": { "name": "hook-score", "kind": "creative_scorer", "version": "heuristic-1.0.0", "stage": "heuristic" },
  "band": "E", "points": 5,
  "label": "Checklist score. It gets smarter as bounties settle.",
  "summary": "Hook Score band E (5/100). Biggest gain, +20: Cut 1.6s of intro so the hook lands by 2.0s (it lands at 3.6s). Fixing all 8 could reach band A.",
  "reasons": [{ "code": "hook_lands_2s", "severity": "critical", "message": "Hook lands at 3.6s.", "t_ms": 3600, "impact": -20.0 }, "..."],
  "fixes":   [{ "id": "fix_hook_lands_2s", "gain": 20.0, "band_after": "E", "effort": "moderate", "text": "Cut 1.6s of intro so the hook lands by 2.0s ..." }, "..."]
}
```

## Endpoints

| Endpoint | Model (BLUEPRINT "ML systems") | In | Out |
|---|---|---|---|
| `POST /v1/hook-score` | 5 Creative scorer: first 3 seconds | observed timings (ms) | band, points, 8 timecoded items, reasons, ordered fixes with payoff, views estimate |
| `POST /v1/flow-score` | 5 Creative scorer: whole video | hook points or hook features, beats, disclosure, length, CTA, audio, format order | band, points, 9 items, reasons, fixes, optional learned **shadow** prediction |
| `POST /v1/qa` | 3 Auto-QA | transcript, on-screen text, scenes, audio + vision facts, brief, perceptual hashes | verdict, 14 checks, flags with reason codes + evidence, `blocks_settlement`, reasons, fixes |
| `POST /v1/fraud` | 4 View-fraud | view curve (hourly or snapshots), engagement, traffic sources, geo, account, history, hashes | score 0-100, band, action, ten signals with evidence, reviewer next steps |
| `POST /v1/match` | 6 Matching | creator profile + up to 500 bounties | ranked feed with gates, six factors per bounty, embedding lift, locked bounties and how to unlock them |
| `POST /v1/suggest-cpm` | 7 Pricing | market stats (or category defaults), budget, plan, priority / target fill / candidate | suggested CPM, six-point price-vs-fill curve with all-in prices, confidence, thin-market warning, creator pay |
| `POST /v1/analyze-video` | 1 Video understanding | video ref + brief | the contract's `VideoAnalysis` + scores + QA + tags + hash + embedding info + reasons |
| `POST /v1/fatigue` | 8 Fatigue | daily metric series | healthy / watch / fatigued / insufficient data, peak, drop, refresh actions |
| `POST /v1/phash/{compare,duplicates,from-frames}` | 3 Auto-QA (duplicates) | hashes or grayscale frames | distance, duplicate verdict, matches |
| `POST /v1/calibration/report` | admin ML page | settled posts with predicted band | per-band results, monotonic check, rank correlation, drift vs Pay Math, recommendation |
| `POST /v1/embed` | 1 / 6 | texts | unit vectors from the configured provider |
| `GET /v1/models`, `GET /v1/meta` | registry | | the eight systems and their stage; versions; adapters |
| `GET /healthz`, `GET /readyz` | | | liveness, readiness |

Every `/v1` response (except health, embed and the registry) carries **`model`** (name, version, stage), ordered **`reasons`**
(plain English, severity, timecode, points) and ordered **`fixes`** (with the points they would earn). `/docs` serves Swagger in dev.

### Contract

Formulas are ports of `packages/contract/schema/formulas.mjs` and DOMAIN.md section 11/12: bit-for-bit rounding (`Math.round`, `toFixed`, basis
points; Python's banker's rounding is wrong here), fixed checklist strings, fraud composition `min(100, sum(round(max_points x severity)))`,
price curve, funding, Pay Math. `tests/test_contract_parity.py` runs the contract's JavaScript with node and fuzzes the Python against it.
Constants are mirrored in `src/flowd_ml/constants.py` and a test fails on any drift. Where the service adds to the contract it says so:

| Addition / difference | Why |
|---|---|
| `HookAnalysis.hook_type` and `VideoTags.hook_type` are **nullable** | "not a library hook type" is a real answer (it scores 0 on `proven_hook_type`); the contract requires a value, so the backend should map `null` to its own default |
| `ScoreItem.t_ms` / `target_ms`, `Reason`, `Fix`, `model`, `summary` | explainability is first-class; engines may ignore them |
| QA `skipped[]` | checks without input are reported, never silently passed; `auto_approvable` needs every check to have run |
| `analysed_at` uses `ML_FIXED_NOW` when set | the demo world's clock is 2026-10-03T14:00:00Z |

## The models, in one paragraph each

- **Hook Score / Flow Score.** The contract's checklist (weights 20/15/15/15/10/10/10/5 and 30/25/10/10/5/5/5/5/5; full, half or zero per item). On top: reasons ordered by points lost, timecodes, one-tap fixes personalised with the video's own numbers ("Cut 1.6s of intro ... it lands at 3.6s"), `band_after` for each fix, a views estimate (`median x band multiplier`, always labelled *Estimate*). `proven_hook_type` uses a day-one prior (confession, risk reversal and specific-number hooks are above the median) that observed trial rates replace.
- **Auto-QA.** 14 checks (`disclosure_audio`, `disclosure_onscreen`, `music_licence`, `banned_claims`, `ai_content`, `duplicate`, `watermark`, `brief_beats`, `safe_zone`, `aspect_ratio`, `length`, `resolution`, `audio_clarity`, `moderation`). pass / warn / fail; **disclosure failures block settlement**. Every flag maps to a DOMAIN reason code with creator copy, a fix hint and evidence (a timecode, a transcript line, a quoted brief requirement). Brand banned claims fail; platform-level risky claims (income and health guarantees) only warn.
- **View-fraud.** The ten contract signals. Each detector turns raw evidence into a severity 0..1 (documented in `fraud/signals.py`), returns the numbers it saw, and says `no_data` when evidence is missing. Curve analysis classifies the shape (organic / spiky / flat / stepped). Only proven fraud is clawed back; delivered views are still paid.
- **Matching.** Hard gates (tier, country, linked account, funded, not submitted) lock bounties, they never silently disappear. Score = niche 40 + platform 15 + region 15 + price 15 + brand reliability 10 + recency 5. Niche = rules overlap with adjacent-niche credit; an embedding can only **lift** a weak rules match, never pull a perfect one down. A first-ranked bounty needs 60+ to be a "top pick".
- **Pricing.** `p50 = max(6, H x (clearing/cpm)^1.6)`, `p80 = p50 x 1.8`, confidence shrinks with few comparable bounties and with distance from the clearing price; under 8 comparable bounties is a thin market. All-in price (fee + card processing) beside every CPM; Pay Math shows what a typical creator earns and echoes Brief Lint's low-pay warning.
- **Fatigue.** Trailing three-day median of the metric; down 30% from its peak is an alert, 20-30% a watch.
- **Video understanding.** transcribe, detect scenes, sample frames (every 500 ms through the hook, then every 2 s), describe frames with the VLM, analyse audio, hash, embed, derive observations, run QA and both scores, tag (format, hook type and words, time to app reveal, CTA).
- **Perceptual hash.** 64-bit DCT pHash in pure Python (grayscale, 32x32 area average, 8x8 low-frequency DCT, bit = coefficient above the median); a video hash is the majority vote of its keyframes; duplicate = Hamming distance 6 or less. A BK-tree index answers "everything within d bits".

## Adapters: zero-GPU by default

`flowd_ml.video.adapters.base` defines `Prober`, `Transcriber`, `SceneDetector`, `VisionLanguageModel`, `FrameSampler`, `AudioAnalyzer` and `VideoEmbedder`
protocols, grouped in an `AdapterSet`.

| | `fake` (default: tests, dev, CI) | `real` (GPU worker) |
|---|---|---|
| Transcribe | scripted scenarios | `FasterWhisperTranscriber` (faster-whisper) |
| Scenes | scripted cuts | `PySceneDetectDetector` (ContentDetector) |
| Frames | per-frame facts from the scenario timeline | `ClaudeVisionLanguageModel` (Anthropic SDK, JSON out; `ML_VLM_MODEL`) + `OpenCvFrameSampler` |
| Audio | scripted | `FfmpegAudioAnalyzer` (`silencedetect`, `ebur128`); music detection is left unknown, never guessed |
| Embeddings | `HashingEmbedder` (feature hashing, 256 dims) | `SigLipEmbedder` / `ClipEmbedder` (transformers) |

Nothing heavy is imported until a real adapter is used (a test proves it). A missing dependency raises `AdapterUnavailableError` naming `pip install 'flowd-ml[real]'`; the service never falls back silently to a fake. Adapter names are stored on every analysis (`fake-whisper` vs `faster-whisper-large-v3`), and a production deployment with fake adapters **refuses** `/v1/analyze-video`.

Fake URIs pick a scripted scenario: `fake://strong_screen_reaction`, `slow_hook_no_disclosure`, `banned_claim`, `ai_unlabelled`, `watermark_competitor`, `faceless_slideshow`, `long_landscape`, `unsafe_content`, optionally `?seed=n` (same seed = same footage, i.e. a duplicate). Any other URI is mapped to an everyday scenario by hash, so every test file analyses the same way every time.

## Configuration

All `ML_*` environment variables (or a `.env`, see `.env.example`):

| Variable | Default | |
|---|---|---|
| `ML_ENV` | `dev` | `dev`, `test` or `prod`. **prod requires `ML_API_KEY`**, serves no `/docs` or `/openapi.json` (the committed file is the contract) and refuses `analyze-video` on fake adapters |
| `ML_API_KEY` | unset | Bearer token on every `/v1` route. Unset means open (dev only) |
| `ML_ADAPTERS` | `fake` | `fake` or `real` |
| `ML_FIXED_NOW` | unset | pin "now", e.g. `2026-10-03T14:00:00Z` |
| `ML_MODEL_DIR` | `models` | `<dir>/creative_scorer` enables the learned scorer in **shadow** mode |
| `ML_MAX_BODY_BYTES` | 16 MB | larger bodies get 413 before parsing |
| `ML_ALLOW_SCENARIO_URIS` | `true` | accept `fake://` scenario URIs; forced off with real adapters, and set `false` on every deployed image |
| `ML_VLM_MODEL`, `ML_WHISPER_MODEL`, `ML_EMBEDDER`, `ML_EMBEDDER_MODEL` | see `.env.example` | real adapters |

Errors always use one envelope: `{"error": {"code", "message", "details?", "request_id"}}` (`validation_error` names the field path; `unauthorized`, `payload_too_large`, `adapter_failed` 502, `adapter_unavailable` 503, `internal_error` never leaks internals). `X-Request-Id` is echoed or minted.

## Training, calibration, promotion

```bash
flowd-ml synth     --out data/synthetic.jsonl --n 1500            # SYNTHETIC export, dry runs only
flowd-ml train     --export data/settled_posts.jsonl --out models/creative_scorer
flowd-ml calibrate --export data/settled_posts.jsonl --out reports/
```

1. **Export** (`training/schema.py`): one row per settled post (observations behind the checklist at submission, verified 72-hour outcomes, creator median views, `flow_points` / `flow_band` at submission).
2. **Clean**: clawed-back and fraud-held posts are dropped; apps with fewer than 8 posts cannot be normalised.
3. **Target**: `ln((views + 1) / (creator's own median + 1))`, **centred per app**. The model learns the video, not the audience or the app. A second target, installs per 1,000 views, trains the same way.
4. **Split by app**: test apps are never seen in training.
5. **LightGBM** with monotone constraints (a later hook can only lower the prediction), early stopping on validation apps, bands from prediction quantiles, TreeSHAP reasons ("When the hook lands (6.0s) moves the predicted views -18% against this creator's median").
6. **Evaluate on held-out apps** against the checklist: within-app Spearman, top-fifth lift, monotone bands, app-bootstrap interval of the difference.
7. **Decide**: `keep_heuristic` below 1,000 settled posts or 3 held-out apps; `promote` only when the learned model wins with an interval clear of zero (and by 0.03), monotone bands; otherwise `shadow`. Shadow means the learned band is computed beside the checklist (`shadow` on `/v1/flow-score`) and **never shown to users**.
8. **Model card** (`MODEL_CARD.md` + `model_card.json`): data, split, metrics, calibration, features and constraints, limitations, fairness (no creator attributes as inputs; multi-brand creators are never penalised). Synthetic artifacts say so on line 3.

On Modal, `nightly_calibration` (03:00 UTC) writes the calibration report and `weekly_train` (Mondays 04:00 UTC) writes a candidate; candidates are copied to `creative_scorer/` only when the decision is `shadow` or `promote`, and a human flips the product label.

## Golden vectors and parity

`python scripts/export_vectors.py` writes 22 suites (312 cases) to `packages/contract/testvectors/ml/` in the same `in` / `out` shape as `formula-vectors.json`.
`required` suites are pure formulas both engines implement (hook, flow, fraud composition, match score, price curve, fill time, funding, first-bounty funding, all-in CPM, expected earnings, bands, rounding, perceptual hash); `reference` suites pin this service (QA text rules, fraud detectors, beats, fatigue, calibration, the fake video pipeline). `compare` semantics (subset objects, exact numbers) are in the vectors README. Tests fail if the committed files drift from the code, and re-run the required suites against the contract's JavaScript with node.

## Deployment

- **Docker**: `docker build -t flowd-ml .` (CPU rules API, non-root, health check) and `--target worker` for the GPU video worker with ffmpeg and the real adapters.
- **Modal**: `pip install -e ".[modal]"` then `modal deploy modal_app.py` (the package must be importable locally: Modal ships it with `add_local_python_source`). `api` (CPU, always warm, rules), `Video` (GPU class, real adapters loaded once per container, scales to zero), the two scheduled jobs, `modal run modal_app.py` as a smoke test. Needs the `flowd-ml` secret (`ML_API_KEY`, `ANTHROPIC_API_KEY`) and the `flowd-ml-models` / `flowd-ml-data` volumes.
- The backend calls scores/QA/fraud/match/pricing on the CPU deployment and `analyze-video` on the GPU one, once per upload.

## Development

```text
src/flowd_ml/
  scoring/      checklist core (contract port), bands, hook types, explanations
  qa/           14 checks, beat detection, reason codes
  fraud/        curve analysis, ten detectors, composition
  matching/     gates + factors, embeddings interface
  pricing/      fill model, suggest-cpm, money formulas
  fatigue/  phash/  calibration/
  video/        adapter protocols, fake + real adapters, scenarios, pipeline
  training/     export schema, synthetic data, trainer, evaluation, model card, shadow
  api/          app factory, routes, auth, errors, middleware
  vectors.py    golden vector builder
tests/          ~600 tests: unit, golden vectors, contract parity (node), API, training, deployment jobs
```

```bash
python -m pytest                                   # everything (parity tests skip without node; Modal tests need the dev extra)
python -m ruff check . && python -m ruff format --check .
python scripts/export_openapi.py                   # after changing a route or schema (a test checks it is current)
python scripts/export_vectors.py                   # after changing a model's behaviour (a test checks they are current)
python scripts/export_openapi.py --check && python scripts/export_vectors.py --check   # CI: fail when either is stale
```

Version pins were verified against PyPI on 2026-10-03; runtime dependencies are exact (`fastapi==0.142.2`, `pydantic==2.13.5`, `uvicorn==0.54.0`).

## Limitations (also in the model cards)

- Day-one models are rules and heuristics. The numbers in them (hook-type priors, category CPM defaults, detector severities, QA thresholds) are **hypotheses** labelled as such in `constants.py` until settled posts replace them.
- The fake adapters are scripted, not intelligent: they exist so everything downstream is testable. Do not read their output as a model's judgement.
- Music detection needs a classifier (an audio-fingerprint service) that is not wired in; the real audio adapter reports it as unknown, and QA then asks a human.
- Curve signals are only as good as the data's resolution: six-hour View Ledger snapshots smear a one-hour spike (the evidence says so).
- The pHash treats bare synthetic ramps as identical (they carry no low-frequency detail); real footage does.
