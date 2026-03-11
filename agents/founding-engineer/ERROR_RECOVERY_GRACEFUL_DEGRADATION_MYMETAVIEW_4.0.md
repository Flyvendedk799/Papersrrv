# Error Recovery & Graceful Degradation — MyMetaView 4.0

**Issue:** AIL-128  
**Parent:** AIL-114 (MyMetaView 4.0 — Final Implementation Plan)  
**Author:** Founding Engineer  
**Date:** 2026-03-10  
**Builds on:** P4 (Production reliability), `TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md` §2.3, §7

---

## 1. Executive Summary

This spec defines partial success handling, retry UX, and fallback behaviors for the MyMetaView 4.0 batch API. It ensures users and API clients receive clear outcomes when some or all URLs fail, can retry failed work without friction, and benefit from graceful degradation when services are impaired.

**Scope:** Batch job pipeline (`/api/demo-v2/batch`), workers, UI flows. Single-URL demo flow inherits same principles where applicable.

**Reference:** `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md` §3.3 (P4), §3.4 (P4), `TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md` §2.3, §7.

---

## 2. Partial Success Handling

### 2.1 Definition

A job completes with **partial success** when at least one URL succeeds and at least one fails. The job `status` is `completed` (not `failed`). Clients must inspect per-URL `status` in `result_urls`.

### 2.2 API Contract

**Status response (`GET /api/demo-v2/batch/{job_id}`):**

| Field | Type | Description |
|-------|------|--------------|
| `status` | enum | `queued` \| `running` \| `completed` \| `failed` |
| `total` | int | Total URLs in job |
| `completed` | int | URLs that succeeded |
| `failed` | int | URLs that failed (after retries exhausted) |
| `pending` | int? | Optional; URLs not yet processed (when `status: running`) |

**Results response (`GET /api/demo-v2/batch/{job_id}/results`):**

Each item in `result_urls`:

```json
{
  "url": "https://example.com/page1",
  "preview_url": "https://cdn.example.com/previews/abc123.png",
  "status": "completed",
  "error": null
}
```

For failed URLs:

```json
{
  "url": "https://example.com/bad",
  "preview_url": null,
  "status": "failed",
  "error": "Timeout after 60s"
}
```

### 2.3 Worker Behavior

| Scenario | Job status | `result_urls` | Notes |
|----------|------------|---------------|-------|
| All URLs succeed | `completed` | All `status: "completed"` | Normal path |
| Some fail after retries | `completed` | Mix of `completed` and `failed` | Partial success |
| All fail after retries | `failed` | All `status: "failed"` | Total failure |
| Job-level timeout | `failed` | Partial results + `failed` for unfinished | Job aborted |
| Unrecoverable worker crash | `failed` | Partial or empty | Recover via idempotent retry |

### 2.4 Implementation Checklist

- [x] Worker never marks job `failed` when any URL succeeded; use `completed` with mixed `result_urls`
- [x] Per-URL `error` string is human-readable (e.g. "Timeout after 60s", "Target returned 503")
- [x] Webhook payload includes `failed_urls` array and `error_summary` (e.g. "2 of 5 URLs failed")
- [x] Status endpoint returns `completed` and `failed` counts for live progress display

---

## 3. Retry UX

### 3.1 Principles

- **Idempotent retry:** Resubmitting failed URLs in a new job is safe; cache hits speed up retries
- **Retry failed only:** UI must support creating a new batch from failed URLs only
- **No automatic retry in UI:** User explicitly chooses "Retry failed"; no background retries without consent

### 3.2 API Support

**No new endpoint required.** Retry is implemented by:

1. Client reads `result_urls` from completed/failed job
2. Filters items with `status: "failed"`
3. Extracts `url` from each
4. Submits `POST /api/demo-v2/batch` with `urls: [extracted URLs]`

**Optional enhancement:** `GET /api/demo-v2/batch/{job_id}/failed-urls` returns `["url1", "url2"]` for convenience. Implementation: filter `result_urls` where `status === "failed"`, return `url` array. Not required for V1.

### 3.3 UI Flow — "Retry failed"

| Step | UI Action | API |
|------|-----------|-----|
| 1 | User views job results; sees "2 failed" section with URLs and errors | — |
| 2 | User clicks "Retry failed" | — |
| 3 | UI navigates to batch creation with failed URLs pre-filled (editable) | — |
| 4 | User may edit URLs (fix typos, remove); clicks "Run batch" | `POST /api/demo-v2/batch` |
| 5 | New job created; redirect to job status | `GET /api/demo-v2/batch/{new_job_id}` |

**UX requirements (from UX_SPEC_MYMETAVIEW_4.0.md, PRODUCT_DESIGN_ALIGNMENT):**

- "Retry failed" CTA visible when `failed > 0`
- Failed URLs shown in separate section with error message
- Pre-fill preserves order; user can remove URLs before retry
- No automatic retry; user must confirm

### 3.4 Per-URL Retry (Optional)

For power users: "Retry" on a single failed URL creates a batch of one. Same flow as above.

### 3.5 Implementation Checklist

- [ ] Results view has "Retry failed" button when `failed > 0` (P6 batch UI)
- [ ] Button extracts failed URLs from `result_urls` and navigates to batch creation with pre-fill
- [ ] Batch creation form accepts initial URL list (e.g. query param or state)
- [x] Error messages displayed per failed URL to inform retry decisions (API returns per-URL `error`)

---

## 4. Fallback Behaviors

### 4.1 Per-URL Fallbacks

| Failure Type | Retry? | Fallback | User-Visible |
|--------------|--------|----------|--------------|
| Timeout | Yes (3x, backoff) | None; mark failed | "Timeout after 60s" |
| 5xx from target | Yes (3x, backoff) | None; mark failed | "Target returned 503" |
| 429 rate limit | Yes (3x, backoff) | None; mark failed | "Rate limited by target" |
| 4xx client error | No | None; mark failed | "Target returned 404" |
| AI/service error | Yes (3x, backoff) | None; mark failed | "Generation failed" |
| Cache hit | N/A | Return cached result | Transparent |

**No silent fallbacks.** We do not substitute a lower-quality result or placeholder without explicit user/config opt-in. Failed = failed.

### 4.2 Job-Level Fallbacks

| Scenario | Behavior | HTTP | User-Visible |
|----------|----------|------|--------------|
| Queue full | Reject new job | 503 + `Retry-After` | "Service busy; try again in N seconds" |
| Auth invalid | Reject | 401 | "Invalid API key" |
| Rate limit exceeded | Reject | 429 + `Retry-After` | "Limit exceeded; retry after N" |
| Job timeout | Abort job; partial results | 200 on results (status: failed) | "Job timed out; X of Y completed" |

### 4.3 Degraded Mode (Future)

**Out of scope for V1.** Possible future enhancements:

- **Cache-only mode:** When AI service is down, return cached results only; mark uncached as failed
- **Read-only status:** When workers are down, allow status/results retrieval but no new jobs
- **Graceful shutdown:** Drain queue before deploy; reject new jobs, complete in-flight

Document for P12 completion; implementation in later phase.

### 4.4 Implementation Checklist

- [x] 503 response includes `Retry-After` header (seconds)
- [x] 429 response includes `Retry-After` header
- [ ] Job timeout sets `status: failed`; `result_urls` contains partial results with `error` for unfinished (future)
- [x] No silent substitution of results; all failures reported in `result_urls`

---

## 5. Error Message Guidelines

### 5.1 Per-URL Errors

| Error Type | Example Message |
|------------|-----------------|
| Timeout | "Timeout after 60s" |
| Target 5xx | "Target returned 503" |
| Target 4xx | "Target returned 404" |
| Rate limit | "Rate limited by target" |
| AI failure | "Generation failed" |
| Invalid URL | "Invalid or unreachable URL" |
| Generic | "Processing failed" (last resort) |

### 5.2 Job-Level Errors

| Error Type | Example Message |
|------------|-----------------|
| Job timeout | "Job timed out; partial results available" |
| Worker crash | "Job failed; retry with same URLs" |

### 5.3 Webhook `error_summary`

Human-readable one-liner, e.g.:

- "All 5 URLs completed successfully"
- "3 of 5 URLs completed; 2 failed"
- "All 5 URLs failed"
- "Job timed out; 2 of 5 completed"

---

## 6. Dependencies and Handoff

| Consumer | Use Case |
|----------|----------|
| **Batch API (P3)** | Implement partial success in worker; status/results contract |
| **UX (P6)** | Implement "Retry failed" flow per §3.3 |
| **Product Designer (AIL-122)** | Failed section layout; retry CTA placement |
| **Webhooks (P8)** | Include `failed_urls`, `error_summary` in payload |
| **Monitoring (P11)** | Log partial success; alert on high failure rate |

---

## 7. References

- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md` §3.3, §3.4
- `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md` §2.3, §7, §8
- `agents/ux-manager/UX_SPEC_MYMETAVIEW_4.0.md` §3.3, §3.4
- `.agent-workspaces/product-designer/PRODUCT_DESIGN_ALIGNMENT_MYMETAVIEW_4.0.md` §5.3
