# P11 Monitoring Integration — MyMetaView 4.0 Batch API

**Issue:** AIL-127  
**Reference:** `agents/founding-engineer/MONITORING_OBSERVABILITY_MYMETAVIEW_4.0.md`

## Overview

Wire Prometheus metrics and structured logging into the batch API. Prometheus uses underscores in metric names (`demo_batch_*`); the spec uses dots (`demo.batch.*`) for readability — they map 1:1.

## 1. Dependencies

```bash
pip install prometheus-client
```

## 2. Metric Definitions

Copy `agents/founding-engineer/deliverables/batch_metrics.py` to `backend/services/batch_metrics.py`, or install `prometheus-client` and define the metrics per the spec. The deliverable includes all gauges, counters, and histograms from §2.2.

## 3. Instrumentation Points

### 3.1 API Layer — Batch Submit (`POST /api/v1/demo-v2/batch`)

```python
from backend.services.batch_metrics import (
    jobs_submitted_total,
    api_requests_total,
    job_duration_seconds,
)

# On successful submit (before returning 201):
tenant_id = get_tenant_id(request)  # or "anonymous" pre-P10
jobs_submitted_total.labels(tenant_id=tenant_id).inc()
api_requests_total.labels(tenant_id=tenant_id, status_code="201").inc()

# On error responses:
api_requests_total.labels(tenant_id=tenant_id, status_code="429").inc()  # rate limit
api_requests_total.labels(tenant_id=tenant_id, status_code="503").inc()  # backpressure
```

### 3.2 API Layer — Status/Results (GET endpoints)

```python
# On each GET /batch/{id} or GET /batch/{id}/results:
api_requests_total.labels(tenant_id=tenant_id, status_code=str(status_code)).inc()
```

### 3.3 Job Duration (on completion)

```python
# When job finishes (worker or callback):
elapsed = (completed_at - submitted_at).total_seconds()
job_duration_seconds.labels(
    tenant_id=tenant_id,
    quality_mode=quality_mode,
    status="completed",  # or "failed"
).observe(elapsed)
jobs_completed_total.labels(tenant_id=tenant_id, status="completed").inc()
```

### 3.4 Queue

```python
from backend.services.batch_metrics import queue_depth, jobs_in_progress

# On enqueue:
queue_depth.inc()

# On dequeue (worker picks up job):
queue_depth.dec()
jobs_in_progress.inc()

# When worker finishes job:
jobs_in_progress.dec()
```

### 3.5 Worker — Per-URL

```python
from backend.services.batch_metrics import (
    url_duration_seconds,
    urls_failed_total,
    cache_hits_total,
    cache_misses_total,
)

# Per URL (cache hit):
cache_hits_total.labels(quality_mode=quality_mode).inc()
with url_duration_seconds.labels(quality_mode=quality_mode, status="hit").time():
    _ = fetch_from_cache_or_generate(url)  # wrap actual work

# Per URL (cache miss, success):
cache_misses_total.labels(quality_mode=quality_mode).inc()
with url_duration_seconds.labels(quality_mode=quality_mode, status="miss").time():
    _ = generate_preview(url)

# Per URL (failure):
urls_failed_total.labels(tenant_id=tenant_id, error_type="timeout").inc()
# error_type: "timeout", "5xx", "network", "unknown"
```

### 3.6 Webhook (P8)

```python
from backend.services.batch_metrics import webhook_deliveries_total

# On webhook send:
webhook_deliveries_total.labels(tenant_id=tenant_id, status="success").inc()
# or status="failed"
```

## 4. Prometheus Endpoint

Expose `/metrics` for scraping:

```python
from prometheus_client import make_asgi_app

# FastAPI:
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

# Flask:
from prometheus_client import make_wsgi_app
from werkzeug.middleware.dispatcher import DispatcherMiddleware
app.wsgi_app = DispatcherMiddleware(app.wsgi_app, {"/metrics": make_wsgi_app()})
```

## 5. Structured Logging

JSON one-per-line; redact URLs (no tokens), never log API keys.

```python
import json
import logging

def log_batch_event(level, event, **fields):
    log = {"timestamp": datetime.utcnow().isoformat() + "Z", "level": level, "event": event, **fields}
    print(json.dumps(log))

# Examples:
log_batch_event("INFO", "job.submitted", job_id=job_id, tenant_id=tenant_id, url_count=len(urls), quality_mode=quality_mode)
log_batch_event("INFO", "job.started", job_id=job_id, tenant_id=tenant_id, queue_wait_ms=queue_wait_ms)
log_batch_event("INFO", "job.completed", job_id=job_id, tenant_id=tenant_id, duration_ms=duration_ms, completed_count=n, failed_count=m)
log_batch_event("ERROR", "job.failed", job_id=job_id, tenant_id=tenant_id, duration_ms=duration_ms, error=str(e))
log_batch_event("WARN", "url.failed", job_id=job_id, url=redact_url(url), error=err, retry_count=retries)
```

## 6. Deploy Artifacts

| Artifact | Location | Purpose |
|----------|----------|---------|
| batch_metrics.py | `agents/founding-engineer/deliverables/batch_metrics.py` | Drop-in Prometheus metrics module |
| Prometheus alerts | `agents/founding-engineer/mymetaview-4.0-prometheus-alerts.yaml` | Load into Alertmanager |
| Grafana dashboard | `agents/founding-engineer/mymetaview-4.0-grafana-dashboard.json` | Import into Grafana |
| Spec | `agents/founding-engineer/MONITORING_OBSERVABILITY_MYMETAVIEW_4.0.md` | Full metric/log/alert definitions |

---

**Reference:** `agents/founding-engineer/MONITORING_OBSERVABILITY_MYMETAVIEW_4.0.md` §6.2
