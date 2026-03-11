# AIL-123: Export & Embed Integration Guide

**Issue:** AIL-123 (Export & embed workflows for MyMetaView 4.0)  
**Deliverables:** `export_service.py`, `export_routes.py`, `embed-widget.js`  
**Spec:** `agents/founding-engineer/EXPORT_EMBED_SPEC_MYMETAVIEW_4.0.md`

---

## 1. Overview

P7 delivers export formats (PNG, PDF, ZIP, embed code) and an embeddable widget. These files are implementation-ready and must be integrated into the MyMetaView backend and frontend.

---

## 2. Backend Integration

### 2.1 Dependencies

```bash
pip install requests img2pdf pillow
```

### 2.2 File Placement

| Deliverable | Target Path |
|-------------|-------------|
| `export_service.py` | `backend/services/export_service.py` |
| `export_routes.py` | `backend/routes/export_routes.py` |

### 2.3 Register Blueprint

In your Flask app (e.g. `app.py` or `backend/__init__.py`):

```python
from routes.export_routes import export_bp
app.register_blueprint(export_bp, url_prefix="/api/demo-v2")
```

Resulting endpoints:
- `GET /api/demo-v2/export/png?url={encoded_preview_url}`
- `POST /api/demo-v2/export/pdf`
- `POST /api/demo-v2/export/zip`

### 2.4 Auth Middleware

Export routes expect `g.tenant_id` (or `request.tenant_id`) set by your API key auth middleware. Ensure:

1. `Authorization: Bearer <key>` or `X-Api-Key: <key>` is validated
2. Resolve key → tenant_id
3. Set `g.tenant_id = tenant_id` before the request reaches export routes

### 2.5 Tenant Validation (Required for Production)

The export service validates that `preview_url` belongs to the tenant. Implement a validator that checks your job storage:

```python
def validate_preview_ownership(preview_url: str, tenant_id: str) -> bool:
    # Return True if preview_url appears in result_urls of any job owned by tenant_id
    # Example: query jobs where tenant_id=X and result_urls contains preview_url
    ...
```

Wire it in a `before_request`:

```python
@app.before_request
def set_export_validator():
    g.export_validator = validate_preview_ownership
```

---

## 3. Embed Widget Integration

### 3.1 Static Asset

Copy `embed-widget.js` to your static assets:

| Deliverable | Target Path |
|-------------|-------------|
| `embed-widget.js` | `static/embed/embed-widget.js` or `public/embed/embed-widget.js` |

Serve at: `https://www.mymetaview.com/embed/embed-widget.js`

### 3.2 Usage (Third-Party Sites)

```html
<script src="https://www.mymetaview.com/embed/embed-widget.js"
        data-url="https://example.com/page-to-preview"
        data-api-key="sk_..."
        async></script>
<div id="mymetaview-preview"></div>
```

- **With API key:** Calls batch API, polls for result, renders preview
- **Without key:** Renders "Try MyMetaView" CTA linking to `/demo?url=...`

### 3.3 Optional: data-base-url

If your API is at a different base URL:

```html
<script src="https://www.mymetaview.com/embed/embed-widget.js"
        data-url="https://example.com/page"
        data-base-url="https://api.yourdomain.com"
        async></script>
```

The widget reads `data-base-url` and uses it for API calls (batch submit, status, results).

---

## 4. Embed Code (Client-Side, No Backend)

Per spec §2.4, "Copy embed code" is client-side. Snippet format:

```html
<!-- MyMetaView Preview — https://example.com/page1 -->
<img src="https://cdn.mymetaview.com/previews/abc123.png"
     alt="Preview of https://example.com/page1"
     width="1200" height="630" loading="lazy" />
```

The results UI should provide a modal with this snippet and a "Copy" button. No backend endpoint required.

---

## 5. Limits (P9 Alignment)

| Endpoint | Limit |
|----------|-------|
| PDF | Max 50 preview_urls |
| ZIP | Max 50 preview_urls |

Enforced in `validate_urls_ownership()`.

---

## 6. References

- `agents/founding-engineer/EXPORT_EMBED_SPEC_MYMETAVIEW_4.0.md`
- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md` §3.3
- `agents/ux-manager/UX_SPEC_MYMETAVIEW_4.0.md` §4
