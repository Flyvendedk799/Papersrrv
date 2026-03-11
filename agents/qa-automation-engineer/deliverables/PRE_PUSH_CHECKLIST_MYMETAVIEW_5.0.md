# MyMetaView 5.0 Pre-Push Completeness Checklist

**Issue:** AIL-146 (Pre-push completeness review)  
**Parent:** [AIL-142](/AIL/issues/AIL-142) (MyMetaView 5.0 execution delegation)  
**Owner:** QA Automation Engineer  
**Date:** 2026-03-11  
**Reference:** AIL-141 (MyMetaView 5.0), AIL-144 (delegation tree)

---

## 1. Board-Defined Workflow Phases

Per AIL-141 and AIL-142, the workflow must include:

| Phase | Workstream | Owner | Evidence |
|-------|------------|-------|----------|
| **W1** | Demo generation upgrades | [AIL-145](/AIL/issues/AIL-145) — Senior Product Engineer | Supporting issues created/assigned; employee involvement table |
| **W2** | Pre-push completeness review | [AIL-146](/AIL/issues/AIL-146) — QA Automation Engineer | This checklist signed off |
| **W3** | Final PR authored by Junior Dev (Git) | [AIL-147](/AIL/issues/AIL-147) — Junior Dev Git | PR link; author = Junior Dev Git |

**Board requirements (AIL-141):**
- Materially enhance demo generations
- Involve all employees where relevant
- Final PR authored by Junior Dev (Git)
- No skipped workflow steps before push
- >= 5000 net new lines across implementation scope

---

## 2. Pre-Push Sign-Off (Run Before Every Push)

Complete **before** any push to origin. Do not allow push without evidence.

| # | Check | Status | Evidence / Notes |
|---|-------|--------|------------------|
| 1 | W1 (demo workstream) complete | ☐ | AIL-145 in progress; AIL-150, AIL-153 still open |
| 2 | Employee involvement verified | ☐ | Running table in AIL-145 or PCM tracker |
| 3 | Net new lines target met | ☐ | >= 5000 lines tracked in PR description |
| 4 | Junior Dev (Git) lined up for PR | ☑ | AIL-147 assigned; PR author confirmed |
| 5 | No workflow steps skipped | ☐ | All phases W1–W3 executed per AIL-142 |
| 6 | PCM breadcrumbs captured | ☐ | Reference artifacts in AIL-144 or PCM audit |

**Sign-off:** QA Automation Engineer confirms all checks pass before push.

---

## 3. Blocker Log

Per AIL-142: keep a log of blockers with owner and escalation path. Report in parent issue.

| Date | Blocker | Owner | Escalation |
|------|---------|-------|-------------|
| — | *(none yet)* | — | COO → CEO |

---

## 4. PCM Pairing

- **Process Chain Manager** ([AIL-144](/AIL/issues/AIL-144), [AIL-143](/AIL/issues/AIL-143)): Captures breadcrumbs and reference artifacts for each phase.
- QA references PCM delegation tracker for phase completion evidence.
- If any required phase slips or tooling gaps appear: raise blocker comment, tag @COO and @CEO immediately.

---

## 5. Escalation

- **Blocked:** Post comment on AIL-146 with blocker details; tag COO/CEO.
- **Phase slip:** Do not allow push; escalate via AIL-142 parent chain.
