# Monitoring & Observability — MyMetaView 4.0

**Issue:** AIL-127  
**Parent:** AIL-114 (MyMetaView 4.0 — Final Implementation Plan)  
**Author:** Founding Engineer  
**Date:** 2026-03-10  
**Builds on:** P4 (Production reliability), `TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md` §5.2, §7.3

---

## 1. Executive Summary

This spec defines metrics, logging, alerting, and dashboards for the MyMetaView 4.0 batch API. It enables operational visibility, SLA tracking, and incident response for production batch jobs.

**Scope:** Batch job pipeline (`/api/demo-v2/batch`), queue, workers, webhooks. Single-URL demo flow is out of scope unless explicitly integrated.

**Reference:** `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md` §3.4 (P4), `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md` §5.2, §7.3.

---

## 2. Metrics

### 2.1 Naming Convention

- Prefix: `demo.batch.*`
- Labels: `tenant_id`, `quality_mode`, `status` (where applicable)
- Use Prometheus-style names: `metric_name_unit` (e.g. `_seconds`, `_total`)

### 2.2 Core Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|--------------|
| `demo.batch.queue_depth` | Gauge | — | Current number of jobs in queue (queued, not yet running) |
| `demo.batch.jobs_submitted_total` | Counter | `tenant_id` | Jobs submitted via API |
| `demo.batch.jobs_completed_total` | Counter | `tenant_id`, `status` | Jobs completed (`completed` or `failed`) |
| `demo.batch.jobs_in_progress` | Gauge | — | Jobs currently being processed |
| `demo.batch.job_duration_seconds` | Histogram | `tenant_id`, `quality_mode`, `status` | End-to-end job duration (submit → completed) |
| `demo.batch.url_duration_seconds` | Histogram | `quality_mode`, `status` | Per-URL processing time (cache hit vs miss) |
| `demo.batch.urls_failed_total` | Counter | `tenant_id`, `error_type` | URLs that failed (timeout, 5xx, etc.) |
| `demo.batch.cache_hits_total` | Counter | `quality_mode` | Cache hits for URL previews |
| `demo.batch.cache_misses_total` | Counter | `quality_mode` | Cache misses for URL previews |
| `demo.batch.webhook_deliveries_total` | Counter | `tenant_id`, `status` | Webhook delivery attempts (`success`, `failed`) |
| `demo.batch.api_requests_total` | Counter | `tenant_id`, `status_code` | API requests by status (200, 201, 429, 503, etc.) |

### 2.3 Histogram Buckets

- **Job duration:** `[5, 15, 30, 60, 120, 300, 600, 1800]` seconds (covers 30s–30min jobs)
- **URL duration:** `[1, 5, 15, 30, 60, 120]` seconds

### 2.4 Derived Metrics (SLA)

- **SLA compliance:** % of jobs completing within 2× estimated time (P4: 95% target)
- **Estimated time:** `total_urls × p50_url_duration` (or configurable per quality mode)
- **Failure rate:** `urls_failed_total / (urls_completed + urls_failed)` per tenant

---

## 3. Logging

### 3.1 Structured Log Format

- **Format:** JSON (one JSON object per line)
- **Fields:** `timestamp`, `level`, `message`, `job_id`, `tenant_id`, `event`, `duration_ms`, `error`, `metadata`

### 3.2 Log Levels

| Level | Use Case |
|-------|----------|
| `DEBUG` | Per-URL trace; cache hit/miss; retry attempts |
| `INFO` | Job lifecycle (submitted, started, completed, failed); webhook sent |
| `WARN` | Partial success; retry exhausted; webhook delivery failed |
| `ERROR` | Total job failure; unrecoverable error |

### 3.3 Key Events to Log

| Event | Level | Fields |
|-------|-------|--------|
| `job.submitted` | INFO | `job_id`, `tenant_id`, `url_count`, `quality_mode` |
| `job.started` | INFO | `job_id`, `tenant_id`, `queue_wait_ms` |
| `job.completed` | INFO | `job_id`, `tenant_id`, `duration_ms`, `completed_count`, `failed_count` |
| `job.failed` | ERROR | `job_id`, `tenant_id`, `duration_ms`, `error` |
| `url.completed` | DEBUG | `job_id`, `url`, `status`, `duration_ms`, `cache_hit` |
| `url.failed` | WARN | `job_id`, `url`, `error`, `retry_count` |
| `webhook.sent` | INFO | `job_id`, `tenant_id`, `status_code` |
| `webhook.failed` | WARN | `job_id`, `tenant_id`, `error`, `retry_count` |
| `queue.backpressure` | WARN | `queue_depth`, `rejected` |

### 3.4 Sensitive Data

- **Never log:** API keys, full URLs with tokens, PII
- **Redact:** URLs with query params containing tokens (log `https://example.com/page1` only)
- **Tenant:** Log `tenant_id` (UUID) for correlation; not tenant name

---

## 4. Alerting

### 4.1 Alert Severity

| Severity | Response |
|----------|----------|
| `critical` | Page on-call; immediate action |
| `warning` | Slack/email; investigate within 4h |
| `info` | Dashboard; optional notification |

### 4.2 Alert Rules

| Alert | Condition | Severity | Description |
|-------|-----------|----------|-------------|
| `BatchQueueDepthHigh` | `demo.batch.queue_depth > 100` for 5 min | warning | Queue backing up; consider scaling workers |
| `BatchQueueDepthCritical` | `demo.batch.queue_depth > 400` for 2 min | critical | Near backpressure limit; jobs may be rejected |
| `BatchSLABreach` | `sla_compliance_rate < 90%` over 1h | warning | Jobs exceeding 2× estimated time |
| `BatchFailureRateHigh` | `failure_rate > 10%` over 15 min | warning | Elevated URL failure rate |
| `BatchFailureRateCritical` | `failure_rate > 25%` over 5 min | critical | Major degradation |
| `BatchWebhookDeliveryFailing` | `webhook_deliveries_total{status="failed"}` rate > 5/min | warning | Webhook delivery issues |
| `BatchQueueDepthZero` | `demo.batch.queue_depth == 0` AND `demo.batch.jobs_in_progress == 0` for 24h | info | No batch activity (optional; health check) |

### 4.3 Runbook Links

Each alert should include a runbook link:

- `BatchQueueDepthHigh` → Scale workers; check Redis; inspect slow jobs
- `BatchSLABreach` → Check p95 latency; inspect cache hit rate; review timeout config
- `BatchFailureRateHigh` → Inspect `error_type`; check target URLs; review timeout/retry limits

---

## 5. Dashboards

### 5.1 Operational Dashboard

**Purpose:** Real-time view for on-call and ops.

| Panel | Metric | Visualization |
|-------|--------|---------------|
| Queue depth | `demo.batch.queue_depth` | Gauge + sparkline |
| Jobs/min | `rate(demo.batch.jobs_submitted_total[5m])` | Time series |
| Jobs in progress | `demo.batch.jobs_in_progress` | Gauge |
| Job duration p50/p95/p99 | `histogram_quantile` on `demo.batch.job_duration_seconds` | Time series |
| Failure rate | `urls_failed / (urls_completed + urls_failed)` | Time series |
| SLA compliance | Derived % | Gauge |
| API status codes | `demo.batch.api_requests_total` by status | Stacked area |
| Cache hit rate | `cache_hits / (cache_hits + cache_misses)` | Time series |

### 5.2 SLO Dashboard

**Purpose:** Track SLA targets; weekly review.

| SLO | Target | Panel |
|-----|--------|-------|
| Job completion within 2× estimated time | 95% | Gauge + trend |
| Per-URL failure rate | < 5% | Gauge |
| Queue depth | < 100 (p95) | Histogram |

### 5.3 Per-Tenant Dashboard (Optional)

**Purpose:** Support and customer success; tenant isolation.

- Filter by `tenant_id`
- Jobs submitted, completed, failed
- Avg job duration
- Failure rate by error type

---

## 6. Implementation Notes

### 6.1 Tooling

- **Metrics:** Prometheus-compatible (Prometheus, VictoriaMetrics, Datadog, etc.)
- **Logging:** Structured JSON to stdout; ship via Fluentd/Fluent Bit, CloudWatch, or similar
- **Dashboards:** Grafana, Datadog, or provider-native
- **Alerting:** Alerts from Prometheus Alertmanager, PagerDuty, Opsgenie, etc.

**Reference implementations (this repo):**
- `agents/founding-engineer/mymetaview-4.0-prometheus-alerts.yaml` — Prometheus alert rules
- `agents/founding-engineer/mymetaview-4.0-grafana-dashboard.json` — Grafana operational dashboard
- `agents/founding-engineer/deliverables/AIL127_MONITORING_INTEGRATION.md` — Instrumentation integration guide

### 6.2 Instrumentation Points

- **API layer:** `jobs_submitted_total`, `api_requests_total` on request; `job_duration_seconds` on job completion
- **Queue:** `queue_depth` on enqueue/dequeue; `jobs_in_progress` on worker start/stop
- **Worker:** `url_duration_seconds`, `urls_failed_total`, `cache_hits_total`, `cache_misses_total` per URL
- **Webhook:** `webhook_deliveries_total` on send attempt

### 6.3 Dependencies

- P4 (reliability) must be in place: retries, timeouts, SLA definition
- P3 (batch API) must be implemented: queue, workers, endpoints
- P8 (webhooks): optional for webhook metrics

---

## 7. References

- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md` §3.3, §3.4
- `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md` §5.2, §7.3, §8
- `doc/plans/mymetaview-4.0-plan.md` P11
