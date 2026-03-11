# QA Quality Gates Spec — MyMetaView 4.0

**Issue:** AIL-120 (Quality gates at scale)  
**Parent:** AIL-114 (MyMetaView 4.0 Final Implementation Plan)  
**Owner:** QA Automation Engineer  
**Date:** 2026-03-10  
**Status:** Spec complete — **blocked on P3 (AIL-118), P4 (AIL-119)**

---

## 1. Dependency Status

| Phase | Issue | Title | Status | Blocker |
|-------|-------|-------|--------|---------|
| P3 | AIL-118 | Batch & bulk generation API | in_progress | Yes |
| P4 | AIL-119 | Production reliability (retries, timeouts, SLAs) | todo | Yes |

**P5 (Quality gates) depends on P3 and P4.** This spec is ready for execution once the batch API and reliability layer are deployed.

---

## 2. Batch API Test Plan

Per `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md` §3.2.

### 2.1 Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/demo-v2/batch` | POST | Submit multi-URL job; returns job_id |
| `GET /api/demo-v2/batch/{job_id}` | GET | Poll status: queued, running, completed, failed |
| `GET /api/demo-v2/batch/{job_id}/results` | GET | Retrieve generated preview URLs/images |

### 2.2 Test Cases

#### Submit (`POST /api/demo-v2/batch`)

| ID | Case | Expected |
|----|------|----------|
| B1 | Valid request: 1 URL, quality_mode balanced | 201, `{job_id: uuid}` |
| B2 | Valid request: 3 URLs, quality_mode fast | 201, `{job_id: uuid}` |
| B3 | Empty urls array | 400 |
| B4 | Invalid URL (file://, javascript:) | 400 |
| B5 | Missing urls | 400 |
| B6 | quality_mode: fast, balanced, ultra | 201 for each |
| B7 | quality_mode invalid | 400 |

#### Status (`GET /api/demo-v2/batch/{job_id}`)

| ID | Case | Expected |
|----|------|----------|
| S1 | Valid job_id, queued | `{job_id, status: "queued", total, completed, failed}` |
| S2 | Valid job_id, running | `status: "running"` |
| S3 | Valid job_id, completed | `status: "completed"` |
| S4 | Valid job_id, failed | `status: "failed"` |
| S5 | Invalid job_id (404) | 404 |
| S6 | Poll until completion | Status transitions: queued → running → completed |

#### Results (`GET /api/demo-v2/batch/{job_id}/results`)

| ID | Case | Expected |
|----|------|----------|
| R1 | Completed job | `{result_urls: [...], failed_urls?: [...]}` |
| R2 | Partial success (P4) | completed + failed arrays present |
| R3 | Job not completed | 409 or appropriate error |
| R4 | Invalid job_id | 404 |

### 2.3 Reliability (P4) Test Cases

| ID | Case | Expected |
|----|------|----------|
| P4-1 | Transient failure → retry | Job completes after retry (max 3) |
| P4-2 | Per-URL timeout (60s) | URL marked failed; job continues |
| P4-3 | Job-level timeout (30min) | Job marked failed |
| P4-4 | Partial success | `completed` + `failed` in results |
| P4-5 | Idempotent retry | Same job_id on resubmit or no duplicate work |

---

## 3. Regression Suite Structure

```
backend/tests/
├── test_demo_flow.py          # Existing: single-URL demo, schema, quality modes
├── test_demo_quality_profiles.py   # Existing: 3.5 quality profiles
├── test_preview_cache_quality_policy.py  # Existing: cache policy
├── test_batch_api.py          # NEW: batch submit, status, results (B1–R4)
└── test_batch_reliability.py  # NEW: P4 retry, timeout, partial success (P4-1–P4-5)
```

### 3.1 Integration with Existing Gates

- **Gate 1:** Schema contracts (unchanged)
- **Gate 2:** Regression tests — add `test_batch_api`, `test_batch_reliability` to `run_quality_gates.py`
- **Gate 3 (new):** Batch API smoke — `POST /batch` with 1 URL, poll until completed, verify results

---

## 4. Quality Thresholds

| Metric | Threshold | Action |
|--------|-----------|--------|
| Batch API test pass rate | 100% | NO-GO if any fail |
| Regression suite (all tests) | 100% | NO-GO if any fail |
| Job completion rate (SLA) | ≥95% within 2× estimated time | Monitor; alert if below |
| Partial success handling | Must return completed + failed | NO-GO if missing |

---

## 5. Execution Checklist (When P3/P4 Complete)

1. **Founding Engineer:** Confirm batch API deployed; share base URL if different from demo-v2.
2. **QA:** Add `test_batch_api.py`, `test_batch_reliability.py` to preview repo.
3. **QA:** Update `run_quality_gates.py` to include batch tests.
4. **QA:** Run gates; document GO/NO-GO.
5. **Handoff:** AIL-133 (QA validation & release gates) — full regression before P18 deploy.

---

## 6. References

- `agents/coo/EXECUTION_PLAN_MYMETAVIEW_4.0.md` §3
- `doc/plans/mymetaview-4.0-plan.md` P5
- `agents/qa-automation-engineer/QA_REPORT_AIL104.md` (3.5 gates pattern)
