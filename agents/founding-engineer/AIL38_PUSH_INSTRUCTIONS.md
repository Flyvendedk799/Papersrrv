# AIL-38 / AIL-51 / AIL-73 / AIL-78: MyMetaView 2.0 PR — Push Instructions

**Branch:** `feature/mymetaview-2.0-final`  
**Status:** AIL-73 + AIL-78 fixes committed locally. **Push required** (run lacks GitHub credentials).

## To push (fixes Railway healthcheck failure)

```bash
cd agents/tmp-preview-check-20260308185629
git push -u origin feature/mymetaview-2.0-final
```

Then open: https://github.com/Flyvendedk799/preview/compare/main...feature/mymetaview-2.0-final

## AIL-78: Railway healthcheck robustness (2026-03-10)

Commit `d0edc56`:
- nginx: add `default_server` to listen directives so Railway's healthcheck.railway.app probe is always accepted
- Dockerfile.frontend: bump CACHEBUST to force rebuild

**Root cause:** AIL-73 fix was never pushed; Railway deploys from origin. Push required for deploy.

## AIL-73: Railway healthcheck robustness (2026-03-09)

Commit `937102b`:
- nginx: add `healthcheck.railway.app` to server_name (per Railway docs)
- entrypoint: reduce PORT wait from 10s to 5s for faster startup
- railway.json: add explicit healthcheckPath/timeout for backend
- Dockerfile.frontend: bump CACHEBUST to force rebuild

## AIL-51: Railway healthcheck fix (2026-03-09)

Commit `360a36b`: nginx now binds explicitly to `0.0.0.0:${PORT}` and `[::]:${PORT}` so Railway's healthcheck can reach `/health` on container startup. Addresses "1/1 replicas never became healthy" after redeploy.

## What's included

- **AIL-33:** Demo-v2 production migration (async job flow, deprecate sync)
- **AIL-34:** Design DNA extraction improvements
- **AIL-35:** Template fidelity and brand application
- **AIL-36:** UX polish and consistency
- **AIL-37:** QA regression tests (`test_demo_flow.py`), quality gates (`run_quality_gates.py`)

## Quality gates

Run before merge (requires `pip install pydantic pytest`):

```bash
cd agents/tmp-preview-check-20260308185629
PYTHONPATH=. python3 backend/scripts/run_quality_gates.py
```
