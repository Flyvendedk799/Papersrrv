# MyMetaView 2.0 — Execution Plan

**Parent:** AIL-70 (MyMetaView 2.0 not out yet)  
**Project:** MyMetaView (target: 2026-03-11)  
**Status:** Adapted 2026-03-09 for whole-company delivery

---

## 1. Executive Summary

Ship MyMetaView 2.0 to production. AIL-53 and related did not fix Railway deployment; errors remain. This plan uses the **whole company** to diagnose, fix, validate, and deliver a push that deploys fully without errors on Railway.

---

## 2. Current State

- **Repo:** `agents/tmp-preview-check-20260308185629`, branch `feature/mymetaview-2.0-final`
- **Known issues:** Railway healthcheck failing; "1/1 replicas never became healthy"
- **Previous work:** AIL-54 (healthcheck fix), AIL-55 (push) done; AIL-53 in_review; board reports errors persist
- **Requirement:** Push that fixes all previous stated issues, deploys fully and without errors on Railway

---

## 3. Workflows and Agent Assignments (Whole Company)

| Workflow | Owner | Scope | Depends On |
|----------|-------|-------|------------|
| **W1: Railway diagnosis & fix** | Founding Engineer | Root-cause Railway/deployment; fix healthcheck, nginx, Docker; implement fix | — |
| **W2: Push & deploy** | Junior Dev Git | Push to origin; trigger redeploy; verify deployment succeeds | W1 |
| **W3: QA validation** | QA Automation Engineer | Run quality gates; regression tests; go/no-go before merge | W1 |
| **W4: UX flow validation** | UX Manager | End-to-end flow validation; identify UX issues blocking production | — |
| **W5: Documentation** | Documentation Specialist | Deployment runbook; known issues; handoff docs | W2 |
| **W6: Follow-through** | Process Chain Manager | Track AIL-70 to completion; unblock; drive to final delivery | — |

---

## 4. Dependency Graph

```
     W1 (Railway fix)
            |
            v
     W2 (Push) ---- W3 (QA)
            |            |
            v            v
     W5 (Docs)      W6 (PCM follow-through)
```

- **W1** is critical path: Founding Engineer diagnoses and fixes
- **W2** depends on W1; Junior Dev Git pushes and verifies
- **W3** runs in parallel; QA validates before final merge
- **W4** runs in parallel; UX Manager validates flows
- **W5** after W2; Documentation Specialist captures deployment state
- **W6** Process Chain Manager follows AIL-72 to completion

---

## 5. Child Issues (Assignable Work)

| Issue | Title | Assignee | Parent |
|-------|-------|----------|--------|
| AIL-73 | Diagnose and fix Railway deployment for MyMetaView 2.0 | Founding Engineer | AIL-70 |
| AIL-74 | Push fix to origin and verify Railway deployment | Junior Dev Git | AIL-70 |
| AIL-75 | QA validation and quality gates for MyMetaView 2.0 | QA Automation Engineer | AIL-70 |
| AIL-76 | UX flow validation for MyMetaView 2.0 | UX Manager | AIL-70 |
| AIL-77 | Deployment documentation for MyMetaView 2.0 | Documentation Specialist | AIL-70 |

AIL-72 (Process Chain Manager follow-through) already assigned.

---

## 6. Handoffs

- **W1 → W2:** Founding Engineer delivers fix; Junior Dev Git pushes and verifies
- **W1, W2 → W3:** QA runs gates; go/no-go before merge
- **W2 → W5:** Documentation Specialist captures deployment runbook
- **All → W6:** Process Chain Manager tracks to completion

---

## 7. Success Criteria

- [ ] Railway deployment succeeds (healthcheck passes, site live)
- [ ] All previous stated issues fixed
- [ ] Quality gates pass
- [ ] Push deployed without errors on Railway

---

## 8. References

- Repo: https://github.com/Flyvendedk799/preview
- agents/founding-engineer/AIL38_PUSH_INSTRUCTIONS.md
- agents/qa-automation-engineer/QA_REPORT_AIL37.md
- **Deployment docs (AIL-77):**
  - agents/tmp-preview-check-20260308185629/docs/DEPLOYMENT_RUNBOOK_MYMETAVIEW_2.0.md
  - agents/tmp-preview-check-20260308185629/docs/KNOWN_ISSUES.md
  - agents/tmp-preview-check-20260308185629/docs/HANDOFF_MYMETAVIEW_2.0.md
