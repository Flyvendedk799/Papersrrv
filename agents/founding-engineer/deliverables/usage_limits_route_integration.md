# P9 Route Integration — Usage Limits

**Issue:** AIL-125  
**Target:** `backend/api/v1/routes_demo_optimized.py` (batch submit endpoint)

## Integration Steps

1. **Copy** `usage_limits.py` to `backend/services/usage_limits.py`.

2. **In the batch submit route** (e.g. `POST /api/v1/demo-v2/batch`), before enqueueing:

```python
from backend.services.usage_limits import (
    get_tenant_key_from_request,
    get_tenant_key_from_tenant_id,  # use when P10 auth available
    check_batch_job_limit,
    check_queue_backpressure,
)

# 1. Queue backpressure (503)
ok, retry_after = check_queue_backpressure(redis_client)
if not ok:
    return JSONResponse(
        status_code=503,
        content={"detail": "Queue at capacity"},
        headers={"Retry-After": str(retry_after)},
    )

# 2. Per-tenant limit (429)
tenant_key = get_tenant_key_from_request(request)  # or get_tenant_key_from_tenant_id(tenant_id) post-P10
ok, retry_after = check_batch_job_limit(redis_client, tenant_key)
if not ok:
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded"},
        headers={"Retry-After": str(retry_after)},
    )

# 3. Proceed with job enqueue
```

3. **URLs per batch:** Enforce in schema (Pydantic) or route validation:

```python
BATCH_URLS_PER_JOB_MAX = int(os.environ.get("BATCH_URLS_PER_JOB_MAX", "50"))
if len(urls) > BATCH_URLS_PER_JOB_MAX:
    return JSONResponse(status_code=400, content={"detail": "Too many URLs"})
```

## Response Semantics

| Status | Condition | Headers |
|--------|-----------|---------|
| 429 | Per-tenant jobs/hour exceeded | `Retry-After: <seconds>` |
| 503 | Queue depth ≥ max (backpressure) | `Retry-After: 60` |

---

**Reference:** `agents/founding-engineer/P9_USAGE_LIMITS_SPEC_MYMETAVIEW_4.0.md`
