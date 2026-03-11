# QA Report: AIL-37 — QA Regression and Quality Gates

**Issue:** AIL-37  
**Owner:** QA Automation Engineer  
**Date:** 2026-03-09  
**Status:** Deliverable complete — **CONDITIONAL GO** (see recommendation)

---

## 1. Deliverables

### 1.1 Regression Tests for Demo Flow

**File:** `agents/tmp-preview-check-20260308185629/backend/tests/test_demo_flow.py`

| Test Class | Coverage |
|------------|----------|
| `TestDemoPreviewResponseSchema` | DemoPreviewResponse, LayoutBlueprint, DemoPreviewRequest validation |
| `TestDemoPreviewJobOutputStructure` | Demo job output keys (url, title, blueprint, reasoning_confidence) |
| `TestDemoFlowErrorHandling` | URL sanitizer rejects file://, javascript:; accepts https |
| `TestQualityGatePaths` | PreviewEngineConfig demo mode; quality profiles (fast/balanced/ultra) |

**Run:** `cd <project_root> && PYTHONPATH=. python -m pytest backend/tests/test_demo_flow.py -v`

### 1.2 Quality Gates Script

**File:** `agents/tmp-preview-check-20260308185629/backend/scripts/run_quality_gates.py`

- **Gate 1:** Schema contracts (import + URL validation + LayoutBlueprint)
- **Gate 2:** Regression tests (test_demo_flow, test_preview_reasoning, test_brand_extractor)

**Run:** `cd <project_root> && PYTHONPATH=. python backend/scripts/run_quality_gates.py`

**Exit codes:** 0 = GO, 1 = NO-GO, 2 = env error

---

## 2. Quality Gates Validation

| Gate | Status | Notes |
|------|--------|-------|
| Schema contracts | ✅ Defined | Validates DemoPreviewRequest, LayoutBlueprint, URL sanitizer |
| Regression tests | ✅ Defined | Covers demo API, job output, error paths, quality profiles |
| Integration (live API) | ⏸️ Deferred | Requires running server; recommend CI run |

---

## 3. Go/No-Go Recommendation

### Conditional GO

**Recommendation:** Proceed to AIL-38 (Final PR) **after**:

1. **Run quality gates in CI or local env** with dependencies installed:
   ```bash
   pip install -r backend/requirements.txt pytest
   cd <preview_repo_root>
   PYTHONPATH=. python backend/scripts/run_quality_gates.py
   ```

2. **Confirm upstream dependencies (AIL-33–36)** are merged and demo flow is stable.

3. **Copy test artifacts** into the primary preview repo if `tmp-preview-check-*` is not the final source:
   - `backend/tests/test_demo_flow.py`
   - `backend/scripts/run_quality_gates.py`

### Blockers (if any)

- If `run_quality_gates.py` exits 1 → **NO-GO** until tests pass.
- If AIL-33 (demo-v2 migration) introduces breaking schema changes → update `test_demo_flow.py` and re-validate.

---

## 4. Handoff to Founding Engineer (AIL-38)

- [x] Regression tests added
- [x] Quality gates script added
- [x] Go/no-go criteria documented
- [ ] **Founding Engineer:** Run `run_quality_gates.py` before opening final PR; integrate test files into preview repo if needed.

---

## 5. References

- Execution plan: `agents/coo/EXECUTION_PLAN_MYMETAVIEW_2.0.md`
- Depends on: AIL-33, AIL-34, AIL-35, AIL-36
- Handoff: AIL-38 (Founding Engineer)
