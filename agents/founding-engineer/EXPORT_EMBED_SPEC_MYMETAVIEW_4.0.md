# Export & Embed Workflows — MyMetaView 4.0 (P7)

**Issue:** AIL-123  
**Parent:** AIL-114 (MyMetaView 4.0 — Final Implementation Plan)  
**Owner:** Founding Engineer  
**Date:** 2026-03-10  
**Reference:** `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md` §3.3, `agents/ux-manager/UX_SPEC_MYMETAVIEW_4.0.md` §4

---

## 1. Executive Summary

P7 delivers export formats (PNG, PDF, embed code) and an embeddable widget for MyMetaView 4.0. These workflows build on the P3 batch API: `result_urls` from `GET /api/demo-v2/batch/{job_id}/results` provide `preview_url` values that are the source for all export and embed flows.

**Scope lock:** `doc/plans/mymetaview-4.0-scope.md` — Export (PNG, PDF, embed code); embeddable widget; download flows.

---

## 2. Export Formats

### 2.1 Format Matrix

| Format | Use Case | Source | Delivery |
|--------|----------|--------|----------|
| **PNG** | Single image download | `preview_url` (already PNG) | Direct download or redirect |
| **PDF** | Multi-page document | Multiple `preview_url`s | Generated PDF; download |
| **Embed code** | Copy-paste for CMS | `preview_url` | Client-side snippet; copy to clipboard |
| **ZIP** | Bulk download | Multiple `preview_url`s | Archive of PNGs; download |

### 2.2 PNG Export

**Flow:** User clicks "Download PNG" on a single result.

| Implementation | Description |
|----------------|-------------|
| **Option A (redirect)** | `GET /api/demo-v2/export/png?url={preview_url}` — validates URL belongs to tenant/job; redirects with `Content-Disposition: attachment; filename="preview.png"` |
| **Option B (proxy)** | Same endpoint; streams image bytes with attachment headers |
| **Option C (client)** | If `preview_url` is same-origin or CORS-enabled, client fetches and triggers download via blob URL |

**Recommendation:** Option A or B for security (validate tenant ownership of preview). Option C only if previews are public CDN URLs with no tenant isolation.

**Headers:**
```
Content-Type: image/png
Content-Disposition: attachment; filename="mymetaview-preview.png"
```

### 2.3 PDF Export

**Flow:** User selects one or more results; clicks "Export as PDF"; optional filename; generate and download.

**Implementation:**
- **Endpoint:** `POST /api/demo-v2/export/pdf` (or `GET` with query params for small sets)
- **Request:** `{ "preview_urls": ["url1", "url2", ...], "filename": "previews.pdf" }`
- **Validation:** All `preview_urls` must belong to tenant (from batch job results)
- **Processing:** Server fetches images, assembles into PDF (e.g. one image per page), streams response
- **Response:** `Content-Type: application/pdf`, `Content-Disposition: attachment`

**Libraries:** ReportLab, img2pdf, or Pillow + pdf generation. One image per page; optional metadata (source URL, timestamp).

**Limits:** Max 50 pages per PDF (align with P9 batch limits); reject with 400 if exceeded.

### 2.4 Embed Code

**Flow:** User clicks "Copy embed code" on a result; snippet shown in modal; copy to clipboard.

**Implementation:** Client-side. No backend endpoint. Snippet format:

```html
<!-- MyMetaView Preview — https://example.com/page1 -->
<img src="https://cdn.mymetaview.com/previews/abc123.png" 
     alt="Preview of https://example.com/page1" 
     width="1200" 
     height="630" 
     loading="lazy" />
```

**Variants:**
- **Basic:** `<img>` with `preview_url`, `alt` from source URL
- **With link:** Wrap in `<a href="{source_url}">` for click-through
- **OG meta:** Optional snippet for `<meta property="og:image" content="...">` for CMS

**UX:** Modal shows full snippet; "Copy" button; optional "Preview" if embeddable.

### 2.5 ZIP Export

**Flow:** User selects multiple results (or "all"); clicks "Download all as ZIP"; progress indicator; download.

**Implementation:**
- **Endpoint:** `POST /api/demo-v2/export/zip`
- **Request:** `{ "preview_urls": ["url1", "url2", ...], "filename": "previews.zip" }`
- **Validation:** All URLs belong to tenant
- **Processing:** Fetch images; zip with sensible filenames (e.g. `preview_1.png`, `preview_2.png` or hash-based)
- **Response:** `Content-Type: application/zip`, `Content-Disposition: attachment`

**Limits:** Max 50 files per ZIP (P9 alignment).

---

## 3. API Surface (Export Endpoints)

### 3.1 Base Path

`/api/demo-v2/export` (or `/api/v1/demo-v2/export` if versioned)

### 3.2 Endpoints

| Action | Method | Endpoint | Purpose |
|--------|--------|----------|---------|
| Download PNG | GET | `/api/demo-v2/export/png?url={preview_url}` | Single image download |
| Export PDF | POST | `/api/demo-v2/export/pdf` | Multi-page PDF |
| Export ZIP | POST | `/api/demo-v2/export/zip` | Bulk PNG archive |

**Auth:** Same as batch API — `Authorization: Bearer <api_key>` or `X-Api-Key`. All export endpoints require valid API key. Validate that `preview_url` was generated for the tenant (via job ownership).

### 3.3 PNG Request

**GET** `/api/demo-v2/export/png?url={encoded_preview_url}`

| Param | Required | Description |
|-------|----------|-------------|
| `url` | Yes | Preview URL from batch results (must belong to tenant) |

**Response:** 302 redirect to image with attachment headers, or 200 with image bytes.

**Errors:** 400 (invalid URL), 401 (no auth), 403 (URL not owned by tenant), 404 (preview not found).

### 3.4 PDF Request

**POST** `/api/demo-v2/export/pdf`

```json
{
  "preview_urls": ["https://cdn.mymetaview.com/previews/abc.png", "..."],
  "filename": "previews.pdf"
}
```

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `preview_urls` | string[] | Yes | — |
| `filename` | string | No | `mymetaview-previews.pdf` |

**Response:** 200, `Content-Type: application/pdf`, body = PDF bytes.

**Errors:** 400 (empty urls, >50 urls, invalid URL), 401, 403.

### 3.5 ZIP Request

**POST** `/api/demo-v2/export/zip`

```json
{
  "preview_urls": ["https://cdn.mymetaview.com/previews/abc.png", "..."],
  "filename": "previews.zip"
}
```

**Response:** 200, `Content-Type: application/zip`, body = ZIP bytes.

**Errors:** Same as PDF.

---

## 4. Embeddable Widget

### 4.1 Widget Purpose

Allow third-party sites to embed a live MyMetaView preview (or "generate preview" CTA) without full app integration.

### 4.2 Widget Variants

| Variant | Use Case | Implementation |
|---------|----------|----------------|
| **Static** | Show existing preview | `<img>` or iframe with preview URL |
| **CTA** | "Generate preview" button | Script injects button; opens demo or API flow |
| **Inline** | Preview + metadata | iframe or script-rendered card with image + link |

### 4.3 Embed Script (CTA / Inline)

**Script URL:** `https://www.mymetaview.com/embed/embed-widget.js`

**Usage:**
```html
<script src="https://www.mymetaview.com/embed/embed-widget.js" 
        data-url="https://example.com/page-to-preview"
        data-api-key="sk_..." 
        async></script>
<div id="mymetaview-preview"></div>
```

**Behavior:**
1. Script loads; reads `data-url`, optional `data-api-key`
2. If API key: call batch API (single URL); poll for result; render preview in `#mymetaview-preview`
3. If no key: render "Try MyMetaView" CTA linking to `/demo?url=...`
4. Renders: image (when ready) + optional "View on MyMetaView" link

### 4.4 Widget Security

- **CORS:** Allow embedding from configured origins (or `*` for public demo)
- **API key in script:** Optional; if present, ensure key is not exposed to other scripts (same-origin or sandboxed)
- **Rate limiting:** Widget-initiated requests count toward tenant limits (P9)

### 4.5 Widget File

**Deliverable:** `embed-widget.js` (or `embed-widget.min.js`)

**Location:** `/embed/embed-widget.js` (static asset)

**Contents:**
- Minimal dependency (vanilla JS or small bundle)
- Config via `data-*` attributes
- Renders preview or CTA
- Handles loading/error states

---

## 5. Download Flows (UX Alignment)

Per `UX_SPEC_MYMETAVIEW_4.0.md` §4:

| Step | User Action | System Response |
|------|-------------|-----------------|
| 1 | User selects result(s) | Selection state stored |
| 2 | User chooses format (PNG/PDF/ZIP) | — |
| 3 | **PNG:** Click "Download PNG" | Immediate download (redirect or fetch) |
| 4 | **PDF:** Click "Export as PDF" | Optional filename modal → POST → "Preparing…" → download |
| 5 | **ZIP:** Click "Download all as ZIP" | "Preparing 12 files…" → POST → download |
| 6 | **Embed:** Click "Copy embed code" | Modal with snippet; copy to clipboard |

**Progress:** For PDF/ZIP with many items, show "Preparing N files…" (or progress bar if backend supports streaming).

---

## 6. Implementation Checklist

| Item | Owner | Status |
|------|-------|--------|
| `routes_export.py` (or equivalent) | FE | Export endpoints |
| `export_service.py` | FE | PDF/ZIP generation; PNG redirect |
| `embed-widget.js` | FE | Embeddable script |
| Tenant validation for preview URLs | FE | All export endpoints |
| Export actions in results UI | FE/UX | Per UX spec §4 |
| API docs for export endpoints | Doc Specialist | P13 |

---

## 7. References

- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md` §3.3
- `agents/ux-manager/UX_SPEC_MYMETAVIEW_4.0.md` §4
- `agents/founding-engineer/TECHNICAL_ARCHITECTURE_MYMETAVIEW_4.0.md` §4
- `.agent-workspaces/documentation-specialist/docs/API_DOCS_MYMETAVIEW_4.0.md` (batch API)
