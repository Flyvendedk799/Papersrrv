# AIL-153 Frontend Integration Summary

**Issue:** [AIL-153](/AIL/issues/AIL-153) — MyMetaView 5.0 UI flows for demo-generation  
**Parent:** [AIL-145](/AIL/issues/AIL-145) (MyMetaView 5.0 demo generation workstream)  
**Owner:** Frontend Engineer  
**Date:** 2026-03-11

---

## What was done

- **API integration layer** — `demo-batch-api.ts` client for `POST /api/demo-v2/batch`, `GET /api/demo-v2/batch/{job_id}`, `GET /api/demo-v2/batch/{job_id}/results`, and 5.0 `GET /api/demo-v2/batch/{job_id}/pages`.
- **Page wrapper** — `DemoGenerationPage.tsx` wires `DemoGenerationExperience` (from Junior Dev Animation) to the batch API with `onCreateJob` and `onPollJob`.
- **Animation styles** — `demo-generation.css` defines `.mv-shimmer` for skeleton cards (per animation spec).
- **Status mapping** — Backend `queued`/`running`/`completed`/`failed` mapped to UI `pending`/`generating`/`success`/`error`.

---

## Files changed

| File | Copy To (MyMetaView repo) | Purpose |
|------|---------------------------|---------|
| `demo-batch-api.ts` | `src/api/demo-batch-api.ts` | Batch API client |
| `demo-generation.css` | `src/styles/demo-generation.css` | Skeleton shimmer, reduced-motion |
| `DemoGenerationPage.tsx` | `src/pages/DemoGenerationPage.tsx` | API-wired page |

**Also copy (from animation deliverable):**

| File | Copy To | Purpose |
|------|---------|---------|
| `agents/junior-dev-animation/deliverables/mymetaview-demo-animation.tsx` | `src/components/DemoGenerationExperience.tsx` | Core demo UI component |

---

## Copy instructions

1. Copy `mymetaview-demo-animation.tsx` and `DemoGenerationPage.tsx` into your repo.
2. Update the import in `DemoGenerationPage.tsx`:
   ```ts
   import { DemoGenerationExperience, type DemoItem } from "./components/DemoGenerationExperience";
   ```
3. Copy `demo-batch-api.ts` and update imports in `DemoGenerationPage.tsx`:
   ```ts
   import { submitBatchJob, getBatchPages, getBatchResults, DEFAULT_API_BASE } from "./api/demo-batch-api";
   ```
4. Import `demo-generation.css` in your app entry (e.g. `main.tsx` or layout):
   ```ts
   import "./styles/demo-generation.css";
   ```
5. Add route for the demo page:
   ```tsx
   <Route path="/demo" element={<DemoGenerationPage />} />
   ```
6. Configure `apiBase` and `apiKey` if your API is not same-origin or requires auth:
   ```tsx
   <DemoGenerationPage apiBase={import.meta.env.VITE_API_URL} apiKey={apiKey} />
   ```

---

## Dependencies

- `framer-motion` — for animations (per animation spec)
- `tailwindcss` — for styling (component uses Tailwind classes)

---

## Coordination

- **Backend (AIL-150):** Uses `/api/demo-v2/batch` (4.0) and optional `/pages`, `/retry-url`, `/retry-failed` (5.0). Falls back to `/results` polling when `/pages` unavailable.
- **Animation (AIL-149):** `DemoGenerationExperience` component with state machine and motion tokens.
- **Product Designer:** `MYMETAVIEW_5.0_DEMO_UX_TOUCHPOINTS.md` — flow and copy alignment.

---

## Open items

- Retry per-card: `handleRetryFailed` in the animation component re-populates URLs and returns to configure. Backend 5.0 `POST /retry-url` would allow in-place retry without full re-run; UI can be extended when that endpoint is available.
- API base URL: Default `""` uses same-origin. For CORS or separate API host, set `apiBase` from env.
