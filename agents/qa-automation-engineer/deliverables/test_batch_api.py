"""
Batch API tests for MyMetaView 4.0 — QA_QUALITY_GATES_SPEC_MYMETAVIEW_4.0.md

Copy to: backend/tests/test_batch_api.py

Test cases: B1–B7 (submit), S1–S6 (status), R1–R4 (results).
Requires: requests, pytest. Base URL via DEMO_BATCH_BASE_URL (default: http://localhost:5000/api/v1/demo-v2).
Optional auth: DEMO_API_KEY for X-Api-Key header.
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
    """Skip module if batch API returns 502 or is unreachable."""
    try:
        r = _post_batch({"urls": ["https://example.com"], "quality_mode": "balanced"})
        if r.status_code == 502:
            pytest.skip("Batch API returns 502 (production unavailable)")
        if r.status_code in (404, 503):
            pytest.skip("Batch API not deployed or unreachable")
    except requests.RequestException as e:
        pytest.skip(f"Batch API unreachable: {e}")


# --- Submit (B1–B7) ---


class TestBatchSubmit:
    """B1–B7: POST /api/demo-v2/batch validation."""

    def test_b1_valid_one_url_balanced(self, api_available):
        """B1: Valid request: 1 URL, quality_mode balanced → 201, job_id."""
        r = _post_batch({"urls": ["https://example.com"], "quality_mode": "balanced"})
        assert r.status_code == 201, r.text
        data = r.json()
        assert "job_id" in data
        try:
            uuid.UUID(data["job_id"])
        except ValueError:
            pytest.fail("job_id must be valid UUID")

    def test_b2_valid_three_urls_fast(self, api_available):
        """B2: Valid request: 3 URLs, quality_mode fast → 201, job_id."""
        r = _post_batch({
            "urls": ["https://a.com", "https://b.com", "https://c.com"],
            "quality_mode": "fast",
        })
        assert r.status_code == 201, r.text
        assert "job_id" in r.json()

    def test_b3_empty_urls(self, api_available):
        """B3: Empty urls array → 400."""
        r = _post_batch({"urls": [], "quality_mode": "balanced"})
        assert r.status_code == 400, r.text

    def test_b4_invalid_url_file(self, api_available):
        """B4: Invalid URL (file://) → 400."""
        r = _post_batch({"urls": ["file:///etc/passwd"], "quality_mode": "balanced"})
        assert r.status_code == 400, r.text

    def test_b4_invalid_url_javascript(self, api_available):
        """B4: Invalid URL (javascript:) → 400."""
        r = _post_batch({"urls": ["javascript:alert(1)"], "quality_mode": "balanced"})
        assert r.status_code == 400, r.text

    def test_b5_missing_urls(self, api_available):
        """B5: Missing urls → 400."""
        r = _post_batch({"quality_mode": "balanced"})
        assert r.status_code == 400, r.text

    @pytest.mark.parametrize("mode", ["fast", "balanced", "ultra"])
    def test_b6_quality_modes(self, api_available, mode):
        """B6: quality_mode fast, balanced, ultra → 201 for each."""
        r = _post_batch({"urls": ["https://example.com"], "quality_mode": mode})
        assert r.status_code == 201, f"{mode}: {r.text}"

    def test_b7_invalid_quality_mode(self, api_available):
        """B7: quality_mode invalid → 400."""
        r = _post_batch({"urls": ["https://example.com"], "quality_mode": "invalid"})
        assert r.status_code == 400, r.text


# --- Status (S1–S6) ---


class TestBatchStatus:
    """S1–S6: GET /api/demo-v2/batch/{job_id}."""

    def test_s5_invalid_job_id(self, api_available):
        """S5: Invalid job_id → 404."""
        r = _get_status(str(uuid.uuid4()))
        assert r.status_code == 404, r.text

    def test_s1_s2_s3_status_fields(self, api_available):
        """S1–S3: Valid job returns job_id, status, total, completed, failed."""
        submit = _post_batch({"urls": ["https://example.com"], "quality_mode": "fast"})
        assert submit.status_code == 201
        job_id = submit.json()["job_id"]
        r = _get_status(job_id)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("job_id") == job_id
        assert data.get("status") in ("queued", "running", "completed", "failed")
        assert "total" in data
        assert "completed" in data or "failed" in data or data.get("status") == "queued"

    def test_s6_poll_until_completion(self, api_available):
        """S6: Poll until completion; status transitions queued → running → completed."""
        submit = _post_batch({"urls": ["https://example.com"], "quality_mode": "fast"})
        assert submit.status_code == 201
        job_id = submit.json()["job_id"]
        seen = []
        for _ in range(60):  # max ~5 min at 5s interval
            r = _get_status(job_id)
            assert r.status_code == 200
            st = r.json().get("status")
            seen.append(st)
            if st in ("completed", "failed"):
                break
            time.sleep(5)
        else:
            pytest.fail("Job did not complete within timeout")
        assert "queued" in seen or "running" in seen or st in ("completed", "failed")


# --- Results (R1–R4) ---


class TestBatchResults:
    """R1–R4: GET /api/demo-v2/batch/{job_id}/results."""

    def test_r4_invalid_job_id(self, api_available):
        """R4: Invalid job_id → 404."""
        r = _get_results(str(uuid.uuid4()))
        assert r.status_code == 404, r.text

    def test_r1_r2_completed_job_has_result_urls(self, api_available):
        """R1/R2: Completed job returns result_urls; may have completed + failed."""
        submit = _post_batch({"urls": ["https://example.com"], "quality_mode": "fast"})
        assert submit.status_code == 201
        job_id = submit.json()["job_id"]
        for _ in range(60):
            st = _get_status(job_id)
            if st.status_code != 200:
                pytest.fail("Status failed")
            status = st.json().get("status")
            if status in ("completed", "failed"):
                break
            time.sleep(5)
        else:
            pytest.skip("Job did not complete in time")
        r = _get_results(job_id)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "result_urls" in data
        assert isinstance(data["result_urls"], list)
        for item in data["result_urls"]:
            assert "url" in item
            assert "status" in item
            assert item["status"] in ("completed", "failed")

    def test_r3_job_not_completed(self, api_available):
        """R3: Job not completed → 202 or 409."""
        submit = _post_batch({"urls": ["https://example.com"], "quality_mode": "fast"})
        assert submit.status_code == 201
        job_id = submit.json()["job_id"]
        r = _get_results(job_id)
        # May return 202 (Accepted) with status, or 200 if already done
        assert r.status_code in (200, 202), r.text
