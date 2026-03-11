"""
MyMetaView 5.0 — New batch API routes (AIL-150)

Adds /pages, /retry-url, and /retry-failed endpoints for 5.0 demo UI.
Copy to: backend/routes/batch_demo_v5_routes.py (or merge into existing batch routes)

Requires: Access to job store (get_job, update_job_result), queue (enqueue_url_work).
Wire: app.register_blueprint(batch_v5_bp, url_prefix="/api/demo-v2/batch")

Reference: agents/junior-dev-backend-3/MYMETAVIEW_5.0_BACKEND_DATA_IMPLEMENTATION_SPEC.md
"""
from flask import Blueprint, request, jsonify, abort

# Integrator: replace with actual imports from your batch service
# from services.batch_service import get_job, update_job_result, enqueue_url_work, validate_tenant_access

batch_v5_bp = Blueprint("batch_v5", __name__)


def _get_tenant_id():
    """Get tenant_id from request context (auth middleware)."""
    from flask import g
    return getattr(g, "tenant_id", None) or getattr(request, "tenant_id", None)


def _get_job(job_id: str, tenant_id: str):
    """
    Load job and validate tenant access. Abort 404/403 if invalid.
    Returns job dict with: id, status, urls, result_urls, tenant_id, quality_mode, created_at, etc.
    """
    # PLACEHOLDER: Replace with actual get_job(job_id) + tenant check
    raise NotImplementedError(
        "Integrate: get_job(job_id), validate job.tenant_id == tenant_id, return job"
    )


def _enqueue_url_work(job_id: str, url: str, tenant_id: str) -> None:
    """Enqueue per-URL work for retry. Updates result_urls when worker completes."""
    # PLACEHOLDER: Replace with actual queue integration
    raise NotImplementedError(
        "Integrate: enqueue_url_work(job_id, url) — worker processes URL, updates result_urls"
    )


def _update_result_for_url(job_id: str, url: str, status: str, preview_url: str | None = None, error: str | None = None) -> None:
    """Update a single result_urls entry. Concurrency-safe."""
    # PLACEHOLDER: Replace with actual update
    raise NotImplementedError(
        "Integrate: atomic update of result_urls entry for given url"
    )


# --- /pages endpoint ---

@batch_v5_bp.route("/<job_id>/pages", methods=["GET"])
def get_batch_pages(job_id: str):
    """
    GET /api/demo-v2/batch/{job_id}/pages

    Returns per-URL status in DemoPage format for 5.0 UI per-card rows.
    Thin wrapper over result_urls; no new persistence required.
    """
    tenant_id = _get_tenant_id()
    if not tenant_id:
        abort(401, "Authentication required")

    job = _get_job(job_id, tenant_id)

    pages = []
    for r in job.get("result_urls", []):
        pages.append({
            "url": r["url"],
            "status": r.get("status", "queued"),
            "preview_url": r.get("preview_url"),
            "error": r.get("error"),
        })

    return jsonify({
        "job_id": job_id,
        "status": job["status"],
        "pages": pages,
    })


# --- /retry-url endpoint ---

@batch_v5_bp.route("/<job_id>/retry-url", methods=["POST"])
def retry_url(job_id: str):
    """
    POST /api/demo-v2/batch/{job_id}/retry-url
    Body: {"url": "https://example.com/page2"}

    Re-queues a single failed URL. Valid when job status is running or completed.
    On success: result_urls entry updated to completed with new preview_url.
    On failure: status stays failed, error updated.
    """
    tenant_id = _get_tenant_id()
    if not tenant_id:
        abort(401, "Authentication required")

    job = _get_job(job_id, tenant_id)
    status = job.get("status", "")
    if status not in ("running", "completed"):
        abort(400, f"Cannot retry: job status is {status}")

    body = request.get_json() or {}
    url = body.get("url")
    if not url or not isinstance(url, str):
        abort(400, "Missing or invalid url in request body")

    result_urls = job.get("result_urls", [])
    found = any(r["url"] == url for r in result_urls)
    if not found:
        abort(404, f"URL not found in job: {url}")

    # Check if already completed (optional: allow re-gen?)
    entry = next((r for r in result_urls if r["url"] == url), None)
    if entry and entry.get("status") == "completed":
        return jsonify({
            "job_id": job_id,
            "url": url,
            "status": "already_completed",
            "message": "URL already succeeded; no retry needed",
        })

    _enqueue_url_work(job_id, url, tenant_id)

    return jsonify({
        "job_id": job_id,
        "url": url,
        "status": "queued",
        "message": "Retry queued",
    })


# --- /retry-failed endpoint ---

@batch_v5_bp.route("/<job_id>/retry-failed", methods=["POST"])
def retry_failed(job_id: str):
    """
    POST /api/demo-v2/batch/{job_id}/retry-failed

    Re-queues all failed URLs in the job. No body required.
    Returns summary of how many URLs were re-queued.
    """
    tenant_id = _get_tenant_id()
    if not tenant_id:
        abort(401, "Authentication required")

    job = _get_job(job_id, tenant_id)
    status = job.get("status", "")
    if status not in ("running", "completed"):
        abort(400, f"Cannot retry: job status is {status}")

    result_urls = job.get("result_urls", [])
    failed_urls = [r["url"] for r in result_urls if r.get("status") == "failed"]

    for url in failed_urls:
        _enqueue_url_work(job_id, url, tenant_id)

    return jsonify({
        "job_id": job_id,
        "retried_count": len(failed_urls),
        "urls": failed_urls,
    })
