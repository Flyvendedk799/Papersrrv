# MyMetaView 5.0 — Backend/Data Implementation Spec

**Issue:** AIL-150 (MyMetaView 5.0 backend/data implementation — Backend 3)  
**Parent:** [AIL-145](/AIL/issues/AIL-145) (MyMetaView 5.0 demo generation workstream)  
**Program:** [AIL-142](/AIL/issues/AIL-142) (MyMetaView 5.0 execution delegation)  
**Owner:** Junior Dev (Backend 3)  
**Date:** 2026-03-11  
**References:**  
- `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md`  
- `.agent-workspaces/documentation-specialist/docs/DEMO_GENERATION_USER_GUIDE_MYMETAVIEW_5.0.md`  
- `agents/product-designer/MYMETAVIEW_5.0_DEMO_UX_TOUCHPOINTS.md`  
- `agents/visual-documentation-specialist/MYMETAVIEW_5.0_VISUAL_DOCUMENTATION.md`  

---

## 1. Scope and Goals

**Scope for Backend 3 (this spec):**

- Define the **backend/data contracts** that power the MyMetaView 5.0 demo-generation experience:
  - API endpoints used by the 5.0 demo UI.
  - Data model for demo runs and per-URL preview status.
  - How 5.0 builds on the **4.0 batch API and 3.5/4.0 pipeline**.
- Call out **performance, reliability, and observability** expectations that matter for live demos.
- Provide a concrete **implementation checklist** that Backend 2 and Senior Product Engineer can pair with for code delivery.

**Explicit goals:**

- Reuse the proven **4.0 batch API** (`/api/demo-v2/batch`) as the core engine.
- Expose enough backend state to drive the **5.0 UI state machine**:
  - `configure`, `submitting`, `generating`, `results_success`, `results_partial`, `results_error`.
- Support **multi-URL runs**, **partial failures**, and **per-URL retry** flows as described in the 5.0 docs.
- Keep the system **safe for live sales demos**: predictable latencies, graceful failures, and clear limits.

**Non-goals (for this spec / 5.0 scope):**

- No redesign of the 3.5/4.0 generation stages themselves (reasoning, critic, brand extraction).
- No new quality modes beyond `fast | balanced | ultra | auto`.
- No multi-tenant billing, rate-limiting, or usage limits beyond what is already defined for 4.0 (remains P9+).

---

## 2. Architectural Alignment (4.0 → 5.0)

### 2.1 Reuse of 4.0 Batch API

5.0 is **explicitly layered** on top of the 4.0 batch job model defined in `TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md`:

- Job entity still contains:
  - `id`, `status` (`queued | running | completed | failed`)
  - `urls: string[]`
  - `quality_mode: "fast" | "balanced" | "ultra" | "auto"`
  - `result_urls: { url, preview_url, status, error? }[]`
  - `tenant_id`, `callback_url?`, `metadata?`
- Core endpoints (unchanged):
  - `POST /api/demo-v2/batch`
  - `GET /api/demo-v2/batch/{job_id}`
  - `GET /api/demo-v2/batch/{job_id}/results`

**5.0 adds:**

- **Stronger contracts** around:
  - Multi-URL runs (always modelled as 1 job with N URLs).
  - Partial success and demo-ready thresholds.
  - Per-URL status transitions that map cleanly onto the 5.0 UI.
- **Optional enhancements** (new endpoints and fields) to support:
  - **Per-URL retry** without recreating the job.
  - **Fine-grained progress reporting** for demo UX (e.g., completed vs failed counts).

### 2.2 Mapping to 5.0 UI States

Backend-facing mapping (recapping the docs and making it explicit for implementors):

| UI State           | Backend condition                                                                             |
|--------------------|-----------------------------------------------------------------------------------------------|
| `configure`        | No job created yet (`job_id` unknown on client).                                             |
| `submitting`       | `POST /api/demo-v2/batch` in flight; client has not yet received `job_id`.                   |
| `generating`       | Job exists with `status` in `{ "queued", "running" }`.                                       |
| `results_success`  | Job `status = "completed"` and **all** `result_urls[].status = "completed"`.                 |
| `results_partial`  | Job `status = "completed"` and **at least one** `result_urls[].status = "failed"`.           |
| `results_error`    | Job `status = "failed"` (pipeline-level error, not just per-URL).                            |

The backend must **not** overload `job.status` to represent partial failures; those are always expressed via per-URL status in `result_urls`.

---

## 3. Data Model for Demo Runs (5.0 View)

This section describes how the data should be shaped for the 5.0 demo UI. It is **logically** defined here; actual persistence can reuse or extend the 4.0 implementation.

### 3.1 DemoRun (logical view)

```ts
type DemoRun = {
  job_id: string;
  created_at: string;
  status: "queued" | "running" | "completed" | "failed";
  total_urls: number;
  completed_count: number;
  failed_count: number;
  quality_mode: "fast" | "balanced" | "ultra" | "auto";
  // Optional: effective mode after auto-resolution (fast/balanced/ultra)
  effective_quality_mode?: "fast" | "balanced" | "ultra";
};
```

**Backend requirements:**

- `total_urls` must equal the length of the original `urls` array.
- `completed_count` / `failed_count` are derived from `result_urls`:
  - `completed_count = result_urls.filter(r => r.status === "completed").length`
  - `failed_count = result_urls.filter(r => r.status === "failed").length`
- `effective_quality_mode` reflects the resolved mode used internally when `quality_mode = "auto"` (see §4.0 quality profiles).

### 3.2 DemoPage (per-URL view)

```ts
type DemoPage = {
  url: string;
  status: "queued" | "running" | "completed" | "failed";
  preview_url: string | null;
  error: string | null;
  started_at?: string;
  completed_at?: string;
};
```

**Backend requirements:**

- `status` for each `DemoPage` must be **independent**:
  - Pages can be `completed` while others are still `queued`/`running`/`failed`.
- `preview_url` is only non-null when `status = "completed"`.
- `error` is only non-null when `status = "failed"`.
- Timestamps should be recorded where feasible for later performance analysis and demo storytelling (“this batch finished in X seconds”).

---

## 4. API Surface for 5.0 Demo UI

### 4.1 Existing Endpoints (4.0 carry-over)

These remain the **canonical** endpoints, but 5.0 callers will rely on stricter semantics:

1. **Submit demo run**

- `POST /api/demo-v2/batch`
- Request (same as 4.0):

```json
{
  "urls": ["https://example.com/page1", "https://example.com/page2"],
  "quality_mode": "balanced",
  "callback_url": "https://client.example.com/webhook",
  "metadata": {}
}
```

- Response (201 Created):

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "total": 2,
  "created_at": "2026-03-10T22:00:00Z"
}
```

2. **Poll overall job status**

- `GET /api/demo-v2/batch/{job_id}`
- Returns a `DemoRun`-compatible view (§3.1) plus any 4.0-compatible fields.

3. **Retrieve results**

- `GET /api/demo-v2/batch/{job_id}/results`
- Returns:

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

**Contract alignment with 5.0 docs:**

- When `status = "completed"` and at least one `result_urls[].status = "failed"`, the UI MUST treat this as `results_partial`.
- When `status = "failed"`, the UI MUST treat this as `results_error`, regardless of the contents of `result_urls`.

### 4.2 New/Clarified Endpoints for 5.0

To support the **per-card retry** and **fine-grained progress** flows in the 5.0 user guide, Backend 3 proposes the following API additions for implementation by the backend team:

1. **List per-URL pages with normalized fields**

- `GET /api/demo-v2/batch/{job_id}/pages`
- Response:

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "pages": [
    {
      "url": "https://example.com/page1",
      "status": "completed",
      "preview_url": "https://cdn.example.com/previews/abc123.png",
      "error": null
    },
    {
      "url": "https://example.com/page2",
      "status": "failed",
      "preview_url": null,
      "error": "Timeout after 60s"
    }
  ]
}
```

**Notes:**

- This can be a **thin wrapper** over the existing `result_urls` array; no new persistence is strictly required.
- The 5.0 demo UI can use this endpoint to drive the **per-card status rows** in the generating/results views.

2. **Per-URL retry within an existing job**

- `POST /api/demo-v2/batch/{job_id}/retry-url`
- Request body:

```json
{
  "url": "https://example.com/page2"
}
```

- Semantics:
  - Only valid when the job is in `status` `"running"` or `"completed"`.
  - Backend enqueues a **new per-URL work item** against the same job context.
  - On success:
    - The corresponding `result_urls` entry is updated (`status: "completed"`, new `preview_url`, `error: null`).
  - On retry failure:
    - `status` stays `"failed"`, `error` updated with the new failure reason.
  - The job-level `status` **does not change** back to `"running"`; UI remains in a results state but shows per-card skeletons for retried URLs.

3. **Optional: Retry all failed URLs**

- `POST /api/demo-v2/batch/{job_id}/retry-failed`
- No body required.
- Semantics:
  - For all `result_urls` with `status = "failed"`, behaves as if `retry-url` were called once per URL.
  - Returns a summary of how many URLs were re-queued.

These endpoints are intended to match the **Retry** stories in the user guide (§5.3 “Retry Path”) without requiring the UI to **clone jobs** or manage multi-job stitching.

---

## 5. Performance, Limits, and Reliability (Demo-Safe Defaults)

Because 5.0 is heavily demo-focused, backend behavior must avoid surprising pauses or overload.

### 5.1 Recommended Operational Defaults

- **URL count per demo run (soft limits):**
  - Default max: **10 URLs** per run for demo environments.
  - Hard cap (backend-enforced): return `400` if client exceeds configurable `MAX_DEMO_URLS` (recommended 20).
- **Job timeouts:**
  - Keep 4.0 defaults unless otherwise overridden:
    - Per-URL: `BATCH_URL_TIMEOUT_SEC` (default 60s).
    - Job-level: `BATCH_JOB_TIMEOUT_SEC` (default 30 min).
- **Backpressure:**
  - Respect 4.0 queue depth caps; when 5.0 demos hit `BATCH_QUEUE_MAX_DEPTH`, return `503` with a human-readable error string suitable for display (“We’re handling a lot of demo requests right now. Please try again in a moment.”).

### 5.2 Partial Success and Demo-Ready Threshold

For the 5.0 demo story, the UI should consider a run **“demo-ready”** when:

- `completed_count / total_urls >= 0.8` (80%), and
- At least **1** page is `completed`.

Backend does **not** need to explicitly encode this threshold; instead:

- Ensure `completed_count` / `failed_count` (or equivalent) are computable efficiently.
- Avoid job-level `failed` status for partial failures so the UI can keep the grid visible and interactive.

### 5.3 Observability Hooks

Backend 3 recommends the following metrics/log fields for MyMetaView 5.0 demo runs:

- **Metrics:**
  - `demo.batch.urls_per_job` (histogram).
  - `demo.batch.job_latency_sec` (histogram; time from `created_at` to all URLs terminal).
  - `demo.batch.url_latency_sec` (histogram; per-URL).
  - `demo.batch.partial_failure_rate` (percentage of jobs with at least one failed URL).
- **Logs:**
  - For each job: `job_id`, `urls.length`, `quality_mode`, `effective_quality_mode`, `tenant_id`, `status`, `completed_count`, `failed_count`.
  - For each URL failure: `job_id`, `url`, `error`, `timeout_ms`, `retry_count`.

These can plug into the existing monitoring plan for MyMetaView (`MONITORING_OBSERVABILITY_MYMETAVIEW_4.0.md`) with minimal additions.

---

## 6. Implementation Checklist and Ownership

This section is a concrete to-do list for backend implementation, intended to be shared with Backend 2 and the Senior Product Engineer.

### 6.1 Backend Tasks (Data & API)

1. **Align 4.0 batch schema with DemoRun/DemoPage views**
   - [ ] Confirm existing job schema fields cover `DemoRun` / `DemoPage` requirements (or add missing timestamps if needed).
   - [ ] Add any derived fields (e.g., `completed_count`, `failed_count`) at the API layer.
2. **Expose normalized status for the 5.0 UI**
   - [ ] Ensure `GET /api/demo-v2/batch/{job_id}` returns a `DemoRun` view (or easily derivable equivalent).
   - [ ] Ensure `GET /api/demo-v2/batch/{job_id}/results` is consistent with partial failure semantics.
3. **Add `/pages` endpoint for per-URL status**
   - [ ] Implement `GET /api/demo-v2/batch/{job_id}/pages` as a thin wrapper over `result_urls`.
4. **Implement per-URL retry**
   - [ ] Implement `POST /api/demo-v2/batch/{job_id}/retry-url` with concurrency-safe updates to `result_urls`.
   - [ ] Implement optional `POST /api/demo-v2/batch/{job_id}/retry-failed` helper.
5. **Enforce demo-friendly limits**
   - [ ] Guard `urls.length` in `POST /api/demo-v2/batch` with configurable `MAX_DEMO_URLS`.
   - [ ] Return clear, user-facing error messages for limit violations and backpressure conditions.
6. **Wire up observability**
   - [ ] Emit the metrics in §5.3.
   - [ ] Ensure failures carry structured context for post-mortems and QA.

### 6.2 Coordination Notes

- **Backend 2**
  - Pair on actual service and data-layer changes (queue integration, DB migrations, caching).
  - Owns production readiness (rollout, alerting thresholds) with guidance from the Founding Engineer.
- **Senior Product Engineer**
  - Validates that the API surface supports the full set of **5.0 UI flows**:
    - Multi-URL runs.
    - Partial failures with banner + per-card retry.
    - Smooth transitions between 5.0 UI states without hacks.
- **QA Automation Engineer**
  - Uses this spec as part of the **pre-push completeness checklist** (`PRE_PUSH_CHECKLIST_MYMETAVIEW_5.0.md`) to verify:
    - All required endpoints exist and are documented.
    - Partial failures and retries behave as described.

---

## 7. Open Questions / Follow-Ups

These should be resolved during implementation or via follow-up issues:

1. **Retry semantics and billing:** Are per-URL retries billed the same as initial generation (if/when billing is introduced)?  
2. **Job cloning vs in-place retry:** Do we need an explicit endpoint to clone a job for auditability, or is in-place per-URL retry sufficient for demo scenarios?  
3. **Long-running demos:** Should we auto-expire demo runs (and their stored preview URLs) after a fixed retention period, and if so, does the UI need a “regenerate demo” button that clones settings from an expired run?  

Once these are clarified, this spec should be updated and referenced from the parent workstream issue [AIL-145](/AIL/issues/AIL-145).

