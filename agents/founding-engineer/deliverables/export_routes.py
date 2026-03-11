"""
Export routes for MyMetaView 4.0 — AIL-123 (P7)

Flask Blueprint for /api/demo-v2/export endpoints.
Copy to: backend/routes/export_routes.py (or backend/api/export.py)

Requires: export_service.py, tenant_id from auth middleware.
Wire: app.register_blueprint(export_bp, url_prefix="/api/demo-v2/export")
"""
from urllib.parse import unquote

from flask import Blueprint, abort, redirect, request, send_file
import io

# When integrated into MyMetaView backend, use:
#   from services.export_service import (...)
try:
    from export_service import (
        build_pdf,
        build_zip,
        fetch_image_bytes,
        validate_preview_url_ownership,
        validate_urls_ownership,
        PNG_FILENAME,
    )
except ImportError:
    try:
        from services.export_service import (
            build_pdf,
            build_zip,
            fetch_image_bytes,
            validate_preview_url_ownership,
            validate_urls_ownership,
            PNG_FILENAME,
        )
    except ImportError:
        raise ImportError(
            "Copy export_service.py to backend/services/ and ensure it is on Python path"
        )

export_bp = Blueprint("export", __name__, url_prefix="/export")


def _get_tenant_id():
    """
    Get tenant_id from request context. Integrator must set g.tenant_id
    (or request.tenant_id) in auth middleware after validating API key.
    """
    from flask import g
    return getattr(g, "tenant_id", None) or getattr(request, "tenant_id", None)


def _get_validator():
    """
    Get optional validator(url, tenant_id) for preview URL ownership.
    Set g.export_validator in app before_request if using DB lookup.
    """
    from flask import g
    return getattr(g, "export_validator", None)


@export_bp.route("/png", methods=["GET"])
def export_png():
    """
    GET /api/demo-v2/export/png?url={encoded_preview_url}
    Validates ownership; streams PNG with attachment headers.
    """
    tenant_id = _get_tenant_id()
    if not tenant_id:
        abort(401, "Authentication required")
    raw_url = request.args.get("url")
    if not raw_url:
        abort(400, "Missing url parameter")
    url = unquote(raw_url)
    if not validate_preview_url_ownership(url, tenant_id, _get_validator()):
        abort(403, "URL not owned by tenant")
    try:
        data = fetch_image_bytes(url)
    except Exception as e:
        abort(404, f"Preview not found: {e}")
    return send_file(
        io.BytesIO(data),
        mimetype="image/png",
        as_attachment=True,
        download_name=PNG_FILENAME,
    )


@export_bp.route("/pdf", methods=["POST"])
def export_pdf():
    """
    POST /api/demo-v2/export/pdf
    Body: {"preview_urls": ["url1", "url2"], "filename": "previews.pdf"}
    """
    tenant_id = _get_tenant_id()
    if not tenant_id:
        abort(401, "Authentication required")
    body = request.get_json() or {}
    urls = body.get("preview_urls", [])
    filename = body.get("filename", "mymetaview-previews.pdf")
    ok, err = validate_urls_ownership(urls, tenant_id, _get_validator())
    if not ok:
        abort(400, err)
    try:
        pdf_bytes, fname = build_pdf(urls, filename=filename)
    except Exception as e:
        abort(500, str(e))
    return send_file(
        io.BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=fname,
    )


@export_bp.route("/zip", methods=["POST"])
def export_zip():
    """
    POST /api/demo-v2/export/zip
    Body: {"preview_urls": ["url1", "url2"], "filename": "previews.zip"}
    """
    tenant_id = _get_tenant_id()
    if not tenant_id:
        abort(401, "Authentication required")
    body = request.get_json() or {}
    urls = body.get("preview_urls", [])
    filename = body.get("filename", "mymetaview-previews.zip")
    ok, err = validate_urls_ownership(urls, tenant_id, _get_validator())
    if not ok:
        abort(400, err)
    try:
        zip_bytes, fname = build_zip(urls, filename=filename)
    except Exception as e:
        abort(500, str(e))
    return send_file(
        io.BytesIO(zip_bytes),
        mimetype="application/zip",
        as_attachment=True,
        download_name=fname,
    )
