# run_quality_gates.py — Batch API Patch

**Issue:** AIL-120  
**Target:** `backend/scripts/run_quality_gates.py` in preview repo

## Change

Add batch API tests to **Gate 2** (regression tests).

### Before (example)

```python
REGRESSION_TESTS = [
    "backend.tests.test_demo_flow",
    "backend.tests.test_preview_reasoning",
    "backend.tests.test_brand_extractor",
    "backend.tests.test_demo_quality_profiles",
    "backend.tests.test_preview_cache_quality_policy",
]
```

### After

```python
REGRESSION_TESTS = [
    "backend.tests.test_demo_flow",
    "backend.tests.test_preview_reasoning",
    "backend.tests.test_brand_extractor",
    "backend.tests.test_demo_quality_profiles",
    "backend.tests.test_preview_cache_quality_policy",
    "backend.tests.test_batch_api",        # NEW: batch submit, status, results
    "backend.tests.test_batch_reliability",  # NEW: P4 retry, timeout, partial success
]
```

### Gate 3 (optional — batch smoke)

If the script has a smoke section, add:

```python
# Gate 3: Batch API smoke — POST /batch with 1 URL, poll until completed
# Run: DEMO_BATCH_BASE_URL=<base> pytest backend/tests/test_batch_api.py -v -k "test_b1_valid"
```

## Copy Instructions

1. Copy `test_batch_api.py` → `backend/tests/test_batch_api.py`
2. Copy `test_batch_reliability.py` → `backend/tests/test_batch_reliability.py`
3. Update `run_quality_gates.py` to include both in the regression list
4. Ensure `requests` is in `backend/requirements.txt`
5. Run: `PYTHONPATH=. python backend/scripts/run_quality_gates.py`

## Env Vars (optional)

| Var | Purpose |
|-----|---------|
| `DEMO_BATCH_BASE_URL` | Base URL for batch API (default: http://localhost:5000/api/v1/demo-v2) |
| `DEMO_API_KEY` | API key for auth (if required) |
