# UX Spec: Professional Tool UX — MyMetaView 4.0 (AIL-121)

**Issue:** AIL-121  
**Parent:** AIL-114 (MyMetaView 4.0 — Final Implementation Plan)  
**Owner:** UX Manager  
**Partner:** Product Designer (AIL-122)  
**Date:** 2026-03-10  
**Feeds:** P7 (Export & embed), P13 (Documentation)

---

## 1. Executive Summary

**Mandate:** The demo generation tool is a gimmick — screenshot-based, not a full-scale tool. MyMetaView 4.0 shifts from **demo-first** to **tool-first** UX. This spec defines the mental model, flows for batch, export, and settings, and acceptance criteria for professional tool UX.

**Scope lock:** `doc/plans/mymetaview-4.0-scope.md` — UX = tool-first; batch flows, export, settings.

---

## 2. Mental Model Shift

### 2.1 Demo vs. Product

| Dimension | Demo (3.5) | Product (4.0) |
|-----------|-------------|---------------|
| **User intent** | "Try it once" | "Get work done" |
| **Entry point** | Single URL, instant preview | Batch job, queue, results |
| **Primary flow** | One URL → one preview | Many URLs → many previews; export; manage |
| **Framing** | "Generate Preview" | "Create Previews" / "Run Batch" |
| **Context** | Ephemeral; no persistence | Jobs, history, exports, settings |
| **Auth** | Optional for demo | Required for tool (API keys, limits) |

### 2.2 Tool-First Principles

1. **Work-oriented:** UI surfaces jobs, status, results — not a single "try it" moment.
2. **Batch-native:** Multi-URL is the default; single-URL is a special case.
3. **Export-first:** Results are meant to be used (PNG, PDF, embed) — not just viewed.
4. **Settings-visible:** Quality mode, limits, API keys are first-class — not hidden.
5. **Recovery-friendly:** Partial success, retries, and error states are expected and surfaced.

---

## 3. Batch Flow UX

### 3.1 Entry Points

| Entry | Location | User Action |
|-------|----------|-------------|
| **Primary** | `/app` (authenticated) | "New Batch" or "Create Previews" CTA |
| **Secondary** | `/demo` (unauthenticated) | Keep for trial; add "Upgrade for batch" CTA when user tries multi-URL |
| **API** | REST | `POST /api/demo-v2/batch` — no UI required |

### 3.2 Batch Submit Flow

**Steps:**
1. User lands on batch creation screen.
2. **Input:** URL list (textarea or multi-input); paste support; example URLs optional.
3. **Options:** Quality mode (fast / balanced / ultra / auto); optional callback URL.
4. **Submit:** "Run Batch" or "Create Previews" — returns job_id; redirect to job status.

**UX requirements:**
- URL validation (format, duplicates removed) before submit.
- Clear feedback: "Submitting 12 URLs…" → "Job created. View status."
- Link to job status immediately after submit.

### 3.3 Job Status Flow

**Steps:**
1. User views job status page (e.g. `/app/jobs/{job_id}` or `/app/batch/{job_id}`).
2. **Status display:** queued → running → completed / failed / partial.
3. **Progress:** total, completed, failed counts; optional ETA.
4. **Results:** When complete, list of result URLs/images; failed URLs with error summary.

**UX requirements:**
- Polling or WebSocket for live updates; avoid manual refresh.
- Partial success: show completed + failed separately; "Retry failed" CTA.
- Clear status labels: "Queued", "Running (3/12)", "Completed (10/12, 2 failed)".

### 3.4 Results Retrieval Flow

**Steps:**
1. User sees results list (thumbnails or URLs).
2. **Actions per result:** View, Download (PNG), Add to export.
3. **Bulk actions:** "Export all as ZIP", "Download all PNGs", "Copy embed codes".

**UX requirements:**
- Thumbnail grid or list; click to expand.
- Export actions visible without extra clicks.
- Failed items: show URL, error message, "Retry" if supported.

---

## 4. Export Flow UX

### 4.1 Export Formats (P7 — Founding Engineer)

| Format | Use Case | UX Entry |
|--------|----------|----------|
| **PNG** | Single image download | Per-result "Download PNG" |
| **PDF** | Multi-page document | "Export as PDF" (select results) |
| **Embed code** | Copy-paste for CMS | "Copy embed code" per result |
| **ZIP** | Bulk download | "Download all as ZIP" |

### 4.2 Export Flow Steps

1. User selects one or more results (or "all").
2. User chooses format: PNG, PDF, embed code, ZIP.
3. **PNG:** Direct download.
4. **PDF:** Optional filename; generate and download.
5. **Embed code:** Copy to clipboard; show snippet in modal.
6. **ZIP:** Generate archive; download.

**UX requirements:**
- Export actions in results toolbar and per-item context menu.
- Progress for bulk export: "Preparing 12 files…" → "Download ready."
- Embed code: show full snippet; "Copy" button; optional "Preview" if embeddable.

---

## 5. Settings Flow UX

### 5.1 Settings Scope

| Setting | Location | Purpose |
|---------|----------|---------|
| **Quality mode default** | `/app/settings` or profile | Default for new batches (fast / balanced / ultra / auto) |
| **API keys** | `/app/settings` or `/app/api-keys` | View, create, revoke API keys for programmatic access |
| **Usage / limits** | `/app/settings` or dashboard | Show current usage vs. plan limits (P9) |
| **Webhook URL** | `/app/settings` | Optional; for job completion notifications (P8) |

### 5.2 Settings Flow Steps

1. User navigates to Settings (from app nav or profile).
2. **Quality default:** Dropdown or radio; save on change.
3. **API keys:** List of keys (masked); "Create key" → name, copy key once; "Revoke".
4. **Usage:** Read-only display of usage vs. limits; link to upgrade if applicable.
5. **Webhook:** Optional URL input; test button; save.

**UX requirements:**
- Settings persist across sessions.
- API key creation: show key once; "Copy" and "I've saved it" confirmation.
- Usage: clear visualization (e.g. "45/100 URLs this month").

---

## 6. Navigation & Information Architecture

### 6.1 App Structure (Authenticated)

| Route | Purpose |
|-------|---------|
| `/app` | Dashboard: recent jobs, quick "New Batch" |
| `/app/batch/new` | Batch creation form |
| `/app/batch/{id}` | Job status and results |
| `/app/jobs` | Job history list (optional) |
| `/app/settings` | Quality, API keys, usage, webhook |
| `/app/api-keys` | Alternative: dedicated API key management |

### 6.2 Demo Retention

- **`/demo`** remains for unauthenticated trial: single-URL flow.
- When user pastes multiple URLs: "Batch requires an account. Sign up to process multiple URLs."
- CTA: "Start Free Trial" or "Sign up for batch access."

---

## 7. Error & Recovery UX

### 7.1 Partial Success

- **Display:** "10 of 12 completed. 2 failed."
- **Failed list:** URL, error message (short), "Retry" if idempotent.
- **Export:** Allow export of completed only; "Export 10 completed" vs. "Retry 2 failed".

### 7.2 Retry Flow

- **Per-URL retry:** From results view, "Retry" on failed item.
- **Bulk retry:** "Retry all failed" from job status.
- **New job:** "Create new batch" with same URLs (user can edit).

### 7.3 Timeout & Rate Limits

- **Timeout:** "Job timed out. X of Y completed. Retry remaining?"
- **Rate limit:** "You've reached your limit. Upgrade or try again later." — link to usage/settings.

---

## 8. Acceptance Criteria (P6)

- [ ] Batch submit flow: multi-URL input, quality mode, submit → job status.
- [ ] Job status flow: live progress, partial success display, retry failed.
- [ ] Export flow: PNG per result, PDF multi-select, embed code copy, ZIP bulk.
- [ ] Settings flow: quality default, API key management, usage display.
- [ ] Demo remains for single-URL trial; batch gated to authenticated users.
- [ ] Navigation: Dashboard, New Batch, Job status, Settings clearly accessible.
- [ ] Error states: partial success, retry, timeout, rate limit surfaced clearly.

---

## 9. Handoff to Product Designer (AIL-122)

- **Visual design:** Wireframes, component specs, copy for batch/export/settings screens.
- **CTA alignment:** "Run Batch" vs. "Create Previews"; "Export" vs. "Download".
- **Empty states:** No jobs yet; no API keys; usage at zero.
- **Mobile:** Responsive for job status and results; settings may be desktop-first.

---

## 10. References

- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md` §3 (Batch API), §4 (Workstreams)
- `doc/plans/mymetaview-4.0-scope.md` (UX definition)
- `doc/plans/mymetaview-4.0-plan.md` (P6 detail)
- `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_3.5.md` (quality modes)
- `agents/ux-manager/UX_VALIDATION_AIL100.md` (3.5 baseline)
- `.agent-workspaces/product-designer/PRODUCT_DESIGN_ALIGNMENT_MYMETAVIEW_3.5.md` (CTA principles)
