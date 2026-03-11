"""
MyMetaView 5.0 — DemoRun/DemoPage view helpers and limits (AIL-150)

Provides DemoRun-compatible response shaping and MAX_DEMO_URLS guard.
Copy to: backend/services/demo_run_views.py

Reference: agents/junior-dev-backend-3/MYMETAVIEW_5.0_BACKEND_DATA_IMPLEMENTATION_SPEC.md §3, §5
"""
import os

# Configurable limit for demo environments (spec: default 10, hard cap 20)
MAX_DEMO_URLS = int(os.environ.get("MAX_DEMO_URLS", "20"))


def validate_url_count(urls: list) -> tuple[bool, str | None]:
    """
    Validate URL count for demo runs. Returns (ok, error_message).
    Use in POST /api/demo-v2/batch before enqueueing.
    """
    if not urls:
        return False, "At least one URL is required"
    if len(urls) > MAX_DEMO_URLS:
        return False, (
            f"Too many URLs. Maximum is {MAX_DEMO_URLS} per run. "
            "Please reduce the number of URLs and try again."
        )
    return True, None


def job_to_demo_run(job: dict) -> dict:
    """
    Shape a job dict into DemoRun-compatible view for 5.0 UI.

    Input job: id, status, urls, result_urls, quality_mode, created_at, ...
    Output: job_id, status, total_urls, completed_count, failed_count, quality_mode, effective_quality_mode?
    """
    result_urls = job.get("result_urls", [])
    urls = job.get("urls", [])
    total = len(urls) if urls else len(result_urls)

    completed_count = sum(1 for r in result_urls if r.get("status") == "completed")
    failed_count = sum(1 for r in result_urls if r.get("status") == "failed")

    out = {
        "job_id": job.get("id") or job.get("job_id"),
        "created_at": job.get("created_at"),
        "status": job.get("status", "queued"),
        "total_urls": total,
        "completed_count": completed_count,
        "failed_count": failed_count,
        "quality_mode": job.get("quality_mode", "balanced"),
    }

    if job.get("effective_quality_mode"):
        out["effective_quality_mode"] = job["effective_quality_mode"]

    return out


def result_urls_to_pages(result_urls: list) -> list[dict]:
    """
    Convert result_urls to DemoPage format for /pages endpoint.

    Each page: url, status, preview_url, error, started_at?, completed_at?
    """
    pages = []
    for r in result_urls:
        p = {
            "url": r["url"],
            "status": r.get("status", "queued"),
            "preview_url": r.get("preview_url"),
            "error": r.get("error"),
        }
        if r.get("started_at"):
            p["started_at"] = r["started_at"]
        if r.get("completed_at"):
            p["completed_at"] = r["completed_at"]
        pages.append(p)
    return pages
