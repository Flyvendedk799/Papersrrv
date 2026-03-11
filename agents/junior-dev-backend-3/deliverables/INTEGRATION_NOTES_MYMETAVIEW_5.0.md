# MyMetaView 5.0 Backend Integration Notes

**Issue:** AIL-150  
**Owner:** Junior Dev (Backend 3)  
**For:** Backend 2, Senior Product Engineer  
**Date:** 2026-03-11

---

## 1. Deliverables

| File | Copy To | Purpose |
|------|---------|---------|
| `batch_demo_v5_routes.py` | `backend/routes/batch_demo_v5_routes.py` | New endpoints: `/pages`, `/retry-url`, `/retry-failed` |
| `demo_run_views.py` | `backend/services/demo_run_views.py` | DemoRun/DemoPage view helpers, `MAX_DEMO_URLS` guard |

---

## 2. Integration Steps

### 2.1 Wire the new blueprint

In your batch API module (e.g. `backend/api/batch.py` or equivalent):

```python
from routes.batch_demo_v5_routes import batch_v5_bp

# Register under the batch prefix — routes become:
# GET  /api/demo-v2/batch/<job_id>/pages
# POST /api/demo-v2/batch/<job_id>/retry-url
# POST /api/demo-v2/batch/<job_id>/retry-failed
app.register_blueprint(batch_v5_bp, url_prefix="/api/demo-v2/batch")
```

### 2.2 Implement placeholders in `batch_demo_v5_routes.py`

Replace the placeholder functions with your actual batch service calls:

- **`_get_job(job_id, tenant_id)`** — Load job from store; validate `job.tenant_id == tenant_id`; abort 404/403 if invalid.
- **`_enqueue_url_work(job_id, url, tenant_id)`** — Enqueue per-URL work (same worker that processes initial URLs). Worker should update `result_urls` for that URL on completion/failure.
- **`_update_result_for_url(...)`** — Used by the worker when retry completes; ensure atomic update of the matching `result_urls` entry.

### 2.3 Add `MAX_DEMO_URLS` guard to batch submit

In your `POST /api/demo-v2/batch` handler, before enqueueing:

```python
from services.demo_run_views import validate_url_count

# In submit handler:
ok, err = validate_url_count(body.get("urls", []))
if not ok:
    return jsonify({"error": err}), 400
```

Set `MAX_DEMO_URLS` via env (default 20; spec recommends 10 for demo environments).

### 2.4 Ensure `GET /api/demo-v2/batch/{job_id}` returns DemoRun view

Use `job_to_demo_run(job)` from `demo_run_views.py` so the response includes:

- `total_urls`, `completed_count`, `failed_count`
- `effective_quality_mode` when `quality_mode == "auto"`

### 2.5 Ensure `GET /api/demo-v2/batch/{job_id}/results` partial semantics

- Job `status = "completed"` with some `result_urls[].status = "failed"` → UI treats as `results_partial`.
- Job `status = "failed"` → UI treats as `results_error` regardless of `result_urls`.

No schema change required; semantics already in 4.0. Verify UI mapping.

---

## 3. Observability (Spec §5.3)

Emit these metrics for 5.0 demo runs:

- `demo.batch.urls_per_job` (histogram)
- `demo.batch.job_latency_sec` (histogram)
- `demo.batch.url_latency_sec` (histogram)
- `demo.batch.partial_failure_rate` (gauge)

Log fields: `job_id`, `urls.length`, `quality_mode`, `effective_quality_mode`, `tenant_id`, `status`, `completed_count`, `failed_count`. For URL failures: `job_id`, `url`, `error`, `timeout_ms`, `retry_count`.

---

## 4. Backpressure (Spec §5.1)

When queue depth exceeds `BATCH_QUEUE_MAX_DEPTH`, return `503` with:

```json
{"error": "We're handling a lot of demo requests right now. Please try again in a moment."}
```

Include `Retry-After` header when appropriate.

---

## 5. References

- [MYMETAVIEW_5.0_BACKEND_DATA_IMPLEMENTATION_SPEC.md](../MYMETAVIEW_5.0_BACKEND_DATA_IMPLEMENTATION_SPEC.md) — Full spec
- [TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md](../../founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md) — 4.0 batch model
- [API_DOCS_MYMETAVIEW_4.0.md](../../../.agent-workspaces/documentation-specialist/docs/API_DOCS_MYMETAVIEW_4.0.md) — 4.0 API reference (if present in workspace)
