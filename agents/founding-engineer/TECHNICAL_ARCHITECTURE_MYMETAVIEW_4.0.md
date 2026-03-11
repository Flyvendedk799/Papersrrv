# Technical Architecture for Scale — MyMetaView 4.0

**Issue:** AIL-116  
**Parent:** AIL-114 (MyMetaView 4.0 — Final Implementation Plan)  
**Author:** Founding Engineer  
**Date:** 2026-03-10  
**Reference:** `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md` §3, `doc/plans/mymetaview-4.0-plan.md`

---

## 1. Executive Summary

MyMetaView 4.0 transforms the demo generation tool from a single-URL gimmick into a production-grade, scalable product. This architecture doc defines the batch job model, queue design, API surface, scaling strategy, and auth model required for P2–P3 implementation.

**Strategic shift:** 3.5 improved generation quality (model, prompts, caching). 4.0 makes the *tool itself* production-ready: batch processing, API, reliability, integrations.

**Reference:** `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_3.5.md` for existing pipeline (model, prompts, caching, quality profiles).

---

## 2. Batch Job Model

### 2.1 Job Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique job identifier |
| `status` | enum | `queued` \| `running` \| `completed` \| `failed` |
| `urls` | string[] | Input URLs to process |
| `quality_mode` | string | `fast` \| `balanced` \| `ultra` \| `auto` |
| `created_at` | ISO8601 | Job creation timestamp |
| `started_at` | ISO8601? | When processing began |
| `completed_at` | ISO8601? | When job finished (success or failure) |
| `result_urls` | object[] | Per-URL results: `{url, preview_url, status, error?}` |
| `tenant_id` | string | Tenant/API key owner for isolation |
| `callback_url` | string? | Optional per-job webhook URL |
| `metadata` | object? | Client-provided opaque metadata |

### 2.2 Result Item Schema

```json
{
  "url": "https://example.com/page1",
  "preview_url": "https://cdn.example.com/previews/abc123.png",
  "status": "completed",
  "error": null
}
```

For failed URLs: `status: "failed"`, `error: "string"`, `preview_url: null`.

### 2.3 Partial Success

Jobs may complete with mixed results: some URLs succeed, some fail. `status: "completed"` with `result_urls` containing both `completed` and `failed` items. Clients must inspect per-URL `status`.

---

## 3. Queue Design

### 3.1 Backend Options

| Option | Use Case | Persistence | Concurrency |
|--------|----------|-------------|-------------|
| **In-memory** | Single-instance dev; &lt;100 jobs/day | None | Process-local |
| **Redis** | Production; multi-worker; &lt;10k jobs/day | Yes (optional AOF) | Global |

**Recommendation:** Start with Redis-backed queue for production. In-memory acceptable for dev/single-node.

### 3.2 Queue Structure

- **Queue name:** `demo:batch:jobs` (FIFO list or stream)
- **Payload:** Job ID only; full job data in DB or Redis hash
- **Concurrency limit:** Configurable `BATCH_WORKER_CONCURRENCY` (e.g. 4 workers per process)
- **Job ordering:** FIFO within tenant; optional priority queue later

### 3.3 Worker Model

- Workers poll or block on queue
- On dequeue: load job, validate, process URLs sequentially or with bounded parallelism (e.g. 2 URLs in parallel per job)
- Update job status: `running` → `completed`/`failed`
- On completion: trigger webhook if configured; update `result_urls`

### 3.4 Idempotency

- Job creation is idempotent if client supplies `idempotency_key` (optional)
- Retry of failed job: same `job_id`; append/merge results for partial retries (P4)

---

## 4. API Surface

### 4.1 Base Path

`/api/demo-v2/batch` (or `/api/v1/demo-v2/batch` if versioned)

### 4.2 Endpoints

| Action | Method | Endpoint | Purpose |
|--------|--------|----------|---------|
| Submit job | POST | `/api/demo-v2/batch` | Submit multi-URL job; returns `job_id` |
| Poll status | GET | `/api/demo-v2/batch/{job_id}` | Status: queued, running, completed, failed |
| Get results | GET | `/api/demo-v2/batch/{job_id}/results` | Retrieve generated preview URLs/images |

### 4.3 Submit Request

**Request body:**

```json
{
  "urls": ["https://example.com/page1", "https://example.com/page2"],
  "quality_mode": "balanced",
  "callback_url": "https://client.example.com/webhook",
  "metadata": {}
}
```

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `urls` | string[] | Yes | — |
| `quality_mode` | string | No | `balanced` |
| `callback_url` | string | No | — |
| `metadata` | object | No | `{}` |

**Response (201):**

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "total": 2,
  "created_at": "2026-03-10T22:00:00Z"
}
```

### 4.4 Status Response

**GET `/api/demo-v2/batch/{job_id}`**

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "total": 2,
  "completed": 1,
  "failed": 0,
  "started_at": "2026-03-10T22:00:05Z"
}
```

### 4.5 Results Response

**GET `/api/demo-v2/batch/{job_id}/results`**

Returns 200 only when `status` is `completed` or `failed`. Otherwise 202 (Accepted) with status in body.

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "result_urls": [
    {
      "url": "https://example.com/page1",
      "preview_url": "https://cdn.example.com/previews/abc123.png",
      "status": "completed",
      "error": null
    },
    {
      "url": "https://example.com/page2",
      "preview_url": null,
      "status": "failed",
      "error": "Timeout after 60s"
    }
  ]
}
```

---

## 5. Scaling Strategy

### 5.1 Horizontal Scaling

- **Workers:** Stateless; scale out by adding worker processes/nodes
- **Queue:** Redis supports multiple consumers; no single point of contention
- **API:** Stateless; scale behind load balancer

### 5.2 Queue Depth Monitoring

- Metric: `demo.batch.queue_depth` (gauge)
- Alert when depth &gt; threshold (e.g. 100) for &gt;5 min
- Dashboard: jobs/min, avg latency, failure rate

### 5.3 Backpressure

- Reject new jobs when queue depth &gt; `BATCH_QUEUE_MAX_DEPTH` (e.g. 500)
- Return 503 with `Retry-After` header
- Per-tenant queue depth limits (P9) for fairness

### 5.4 Caching Integration

- Reuse 3.5 cache: `demo:preview:v4:{quality_mode}:{url_hash}`
- Batch jobs benefit from cache hits; cache misses processed by workers
- No change to cache key design from 3.5

---

## 6. Auth Model

### 6.1 API Keys

- **Storage:** Hashed at rest; `api_key_hash`, `tenant_id`, `name`, `created_at`
- **Header:** `Authorization: Bearer <api_key>` or `X-Api-Key: <api_key>`
- **Scope:** All batch endpoints require valid API key

### 6.2 Tenant Isolation

- Every job scoped to `tenant_id` from API key
- Workers filter jobs by tenant when multi-tenant
- No cross-tenant data access

### 6.3 Key Rotation

- Support multiple keys per tenant (e.g. `key_v1`, `key_v2`)
- Old keys revoked by setting `revoked_at`; new jobs rejected
- In-flight jobs complete with original key context

### 6.4 Rate Limiting (P9)

- Per-tenant: `N` jobs/hour, `M` URLs/job max
- Return 429 when exceeded; `Retry-After` header

---

## 7. Reliability (P4 — CTO Spec)

### 7.1 Retry Policies

- **Per-URL:** Exponential backoff for transient failures; max 3 retries
- **Backoff:** 2s, 4s, 8s (configurable)
- **Retryable errors:** Timeout, 5xx, rate limit (429)

### 7.2 Timeouts

| Level | Default | Configurable |
|-------|---------|--------------|
| Per-URL | 60s | `BATCH_URL_TIMEOUT_SEC` |
| Job-level | 30 min | `BATCH_JOB_TIMEOUT_SEC` |

### 7.3 SLA Targets

- 95% of jobs complete within 2× estimated time (estimate = `total_urls × avg_latency_per_url`)
- Track p50, p95, p99 latency; alert on SLA breach

### 7.4 Failure Modes

- **Partial success:** Return `completed` + `failed` in `result_urls`; `status: "completed"`
- **Total failure:** `status: "failed"`; `result_urls` with all `failed`
- **Idempotent retry:** Client may resubmit same URLs in new job; cache hits speed up

---

## 8. Integration Hooks (P8)

### 8.1 Webhooks

- **Config:** Per-tenant default webhook URL; or per-job `callback_url`
- **Trigger:** On job completion (success or partial)
- **Method:** POST to configured URL

### 8.2 Callback Payload

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "result_urls": [...],
  "failed_urls": ["https://example.com/bad"],
  "error_summary": "1 of 2 URLs failed"
}
```

### 8.3 Retries

- Webhook delivery: retry up to 3 times with backoff
- Log failures; optional dead-letter queue for manual inspection

---

## 9. Implementation Order

1. **P2 (this doc):** Architecture approved by CTO
2. **P3:** Batch API implementation per §4
3. **P4:** Reliability (retries, timeouts) — CTO spec, FE implement
4. **P8:** Webhooks/callbacks
5. **P9:** Usage limits, rate limiting
6. **P10:** Auth & multi-tenant — CTO foundation

---

## 10. References

- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md` §3
- `doc/plans/mymetaview-4.0-plan.md`
- `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_3.5.md`
