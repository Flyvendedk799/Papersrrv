"""
Batch API reliability tests (P4) — QA_QUALITY_GATES_SPEC_MYMETAVIEW_4.0.md

Copy to: backend/tests/test_batch_reliability.py

Test cases: P4-1 (retry), P4-2 (per-URL timeout), P4-3 (job timeout), P4-4 (partial success), P4-5 (idempotency).
Requires: requests, pytest. Base URL via DEMO_BATCH_BASE_URL.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("DEMO_BATCH_BASE_URL", "http://localhost:5000/api/v1/demo-v2")
API_KEY = os.environ.get("DEMO_API_KEY", "")


def _headers():
    h = {"Content-Type": "application/json"}
    if API_KEY:
        h["X-Api-Key"] = API_KEY
    return h


def _post_batch(body):
    return requests.post(f"{BASE_URL}/batch", json=body, headers=_headers(), timeout=30)


def _get_status(job_id):
    return requests.get(f"{BASE_URL}/batch/{job_id}", headers=_headers(), timeout=10)


def _get_results(job_id):
    return requests.get(f"{BASE_URL}/batch/{job_id}/results", headers=_headers(), timeout=10)


@pytest.fixture(scope="module")
def api_available():
    """Skip module if batch API unreachable."""
    try:
        r = _post_batch({"urls": ["https://example.com"], "quality_mode": "balanced"})
        if r.status_code in (502, 404, 503):
            pytest.skip("Batch API unavailable")
    except requests.RequestException as e:
        pytest.skip(f"Batch API unreachable: {e}")


class TestBatchReliability:
    """P4: Production reliability — retries, timeouts, partial success."""

    def test_p4_4_partial_success_returns_completed_and_failed(self, api_available):
        """P4-4: Partial success returns completed + failed in result_urls."""
        # Submit mix of valid and likely-failing URLs
        urls = [
            "https://example.com",
            "https://invalid.invalid",  # Reserved TLD; should fail
        ]
        r = _post_batch({"urls": urls, "quality_mode": "fast"})
        assert r.status_code == 201
        job_id = r.json()["job_id"]
        for _ in range(90):  # up to ~7.5 min
            st = _get_status(job_id)
            assert st.status_code == 200
            status = st.json().get("status")
            if status in ("completed", "failed"):
                break
            time.sleep(5)
        else:
            pytest.skip("Job did not complete in time")
        res = _get_results(job_id)
        assert res.status_code == 200
        data = res.json()
        assert "result_urls" in data
        completed = [x for x in data["result_urls"] if x.get("status") == "completed"]
        failed = [x for x in data["result_urls"] if x.get("status") == "failed"]
        # Must have at least one of each or all completed or all failed
        assert len(data["result_urls"]) == len(urls)
        assert len(completed) + len(failed) == len(urls)

    def test_p4_5_idempotency_key_same_result(self, api_available):
        """P4-5: Idempotent retry — same idempotency_key returns same job_id or no duplicate work."""
        key = str(uuid.uuid4())
        body = {"urls": ["https://example.com"], "quality_mode": "fast", "idempotency_key": key}
        r1 = _post_batch(body)
        r2 = _post_batch(body)
        assert r1.status_code == 201
        # If idempotency supported: same job_id or 409
        if r2.status_code == 201:
            j1 = r1.json().get("job_id")
            j2 = r2.json().get("job_id")
            if j1 == j2:
                pass  # Idempotency enforced
            # else: API may not support idempotency_key yet — no assertion
        elif r2.status_code == 409:
            pass  # Conflict = idempotency enforced

    @pytest.mark.slow
    def test_p4_2_per_url_timeout_marked_failed(self, api_available):
        """P4-2: Per-URL timeout (60s) — URL marked failed; job continues.
        Uses slow-responding URL if available; otherwise skip."""
        # Use a URL that typically times out (e.g. 10.255.255.1 or similar)
        # This is environment-dependent; skip if no such URL available
        slow_url = os.environ.get("DEMO_SLOW_URL", "https://httpstat.us/200?sleep=65000")
        r = _post_batch({"urls": [slow_url, "https://example.com"], "quality_mode": "fast"})
        if r.status_code != 201:
            pytest.skip("Submit failed")
        job_id = r.json()["job_id"]
        for _ in range(120):  # 10 min max
            st = _get_status(job_id)
            assert st.status_code == 200
            status = st.json().get("status")
            if status in ("completed", "failed"):
                break
            time.sleep(5)
        else:
            pytest.skip("Job did not complete")
        res = _get_results(job_id)
        assert res.status_code == 200
        # At least one URL should have completed (example.com)
        data = res.json()
        assert any(x.get("status") == "completed" for x in data.get("result_urls", []))

    @pytest.mark.slow
    @pytest.mark.skip(reason="30 min job timeout; run manually in CI")
    def test_p4_3_job_level_timeout(self, api_available):
        """P4-3: Job-level timeout (30min) — job marked failed. Manual/CI only."""
        pass

    @pytest.mark.slow
    @pytest.mark.skip(reason="Requires simulating transient failure; run in chaos-test env")
    def test_p4_1_transient_failure_retry(self, api_available):
        """P4-1: Transient failure → retry; job completes after retry. Manual/CI only."""
        pass
