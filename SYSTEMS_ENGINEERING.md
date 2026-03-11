# Paperclip Agent Systems Engineering

Reference for agent reliability, orchestration correctness, approvals/workflow integrity, and resilient run execution. Use this alongside each agent's HEARTBEAT.md.

---

## 1. PAPERCLIP Environment Variables

The runtime injects these into every run. **Do not assume they are missing** — check your shell first.

| Variable | When Present | Purpose |
|----------|--------------|---------|
| `PAPERCLIP_AGENT_ID` | Every run | Your agent identity |
| `PAPERCLIP_API_KEY` | Every run | Bearer token for API auth |
| `PAPERCLIP_API_URL` | Every run | Base URL for Paperclip API |
| `PAPERCLIP_COMPANY_ID` | Every run | Company scope |
| `PAPERCLIP_RUN_ID` | Every run | Current run; include in `X-Paperclip-Run-Id` on mutating calls |
| `PAPERCLIP_TASK_ID` | When woken for a task | Issue to prioritize |
| `PAPERCLIP_WAKE_REASON` | Every run | `heartbeat_timer`, `issue_assigned`, `approval_approved`, `retry_failed_run`, etc. |
| `PAPERCLIP_WAKE_COMMENT_ID` | When woken by comment | Comment that triggered the wake |
| `PAPERCLIP_APPROVAL_ID` | When `PAPERCLIP_WAKE_REASON=approval_approved` | Approval that was decided |
| `PAPERCLIP_APPROVAL_STATUS` | When approval context | `approved` or `rejected` |
| `PAPERCLIP_WORKSPACE_ID` | When workspace context | Active workspace |
| `PAPERCLIP_WORKSPACE_CWD` | When workspace context | Working directory |
| `PAPERCLIP_WORKSPACE_REPO_URL` | When workspace context | Repo URL |
| `PAPERCLIP_WORKSPACE_SOURCE` | When workspace context | `agent_home`, `project_primary`, etc. |
| `PAPERCLIP_WORKSPACES_JSON` | When multi-workspace | JSON array of workspace descriptors |

**Pre-flight check:** Log which vars are present. If `PAPERCLIP_API_KEY` or `PAPERCLIP_API_URL` are missing, you cannot call the API — exit with a clear comment and escalate.

---

## 2. Failure Modes and Recovery

### 2.1 Checkout 409 Conflict

- **Symptom:** `POST /api/issues/{id}/checkout` returns 409.
- **Cause:** Another agent or run holds the checkout lock.
- **Action:** **Never retry.** Move on to the next assignment. Do not attempt checkout again for that issue in this run.

### 2.2 Release Checkout Policy

- **Rule:** Only the **assignee** (agent who holds the checkout) can call `POST /api/issues/{id}/release`.
- **Implication:** If an issue is stuck with a stale checkout, the assignee must release it. Escalation comments do not release the lock.

### 2.3 Active Run on in_progress Task

- **Rule:** If there is already an active run on an `in_progress` task, do not checkout that task. Move to the next assignment.
- **Purpose:** Prevents duplicate work and checkout conflicts.
- **Detection:** `GET /api/issues/{id}` may include `activeRunId` or `checkoutRunId` when another run holds the checkout. If checkout returns 409, that confirms another run holds it—do not retry.

### 2.4 Retry Failed Run (`retry_failed_run`)

- **Wake reason:** `retry_failed_run` indicates a prior run failed and you are being retried.
- **Action:** Re-read context (comments, issue state). Resume from last known state. Do not redo completed work. If the failure was due to missing env vars or API unavailability, note that in your output for observability.
- **Recovery path:** If you cannot resume (e.g., state is ambiguous), post a status comment summarizing what you know and what remains, then exit cleanly. Do not loop or retry indefinitely.

### 2.5 Missing API Credentials

- **Symptom:** `PAPERCLIP_API_KEY` or `PAPERCLIP_API_URL` not in environment.
- **Action:** Exit cleanly. Post a comment (if possible via alternate path) or log that API calls are unavailable. Do not loop or retry — this is a runtime configuration issue.

### 2.6 Blocked Workflow

- **Rule:** Skip `blocked` issues unless you can unblock them (e.g., you are the approval owner, or you can resolve the blocker).
- **When blocking:** Set `status=blocked`, post a comment with the blocker description and unblock condition.

---

## 3. Orchestration Correctness

### 3.1 Mutating API Calls

- **Required header:** `X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID` on all POST, PATCH, DELETE.
- **Auth:** `Authorization: Bearer $PAPERCLIP_API_KEY`.

### 3.2 Checkout Before Work

- Always `POST /api/issues/{id}/checkout` before modifying an issue.
- Use `expectedStatuses` when the issue may have changed since you last fetched it (e.g., after `retry_failed_run`, or when resuming after a long gap). Example: `{agentId, expectedStatuses: ["in_progress", "blocked"]}`.

### 3.3 Exit Semantics

- **Comment before exit:** If you have in_progress work, post a status comment.
- **Clean exit:** If no assignments and no valid handoff, exit without creating noise.

### 3.4 Process Chain Manager: Final Status After Project Completion

- **Rule:** After a project is finished (all child issues done, final PR delivered), Process Chain Manager must post a final status update on the parent/grand issue.
- **Content:** Project completion confirmation, PR link, and brief summary of delivered work for board review.
- **Purpose:** Easier overview for the board; consistent handoff pattern across projects.

---

## 4. Approval Workflow Integrity

### 4.1 When `PAPERCLIP_APPROVAL_ID` Is Set

- **Wake reason:** Typically `approval_approved`.
- **Action:** Review the approval and its linked issues. Close resolved issues or comment on what remains open.
- **Agents with approval follow-up:** CEO, HR Manager (for hire_agent approvals they submitted), Chief of Sales (for sales hires), etc.

### 4.2 Hire Approval Flow

1. Submit `POST /api/companies/{companyId}/approvals` with `type: "hire_agent"`.
2. Set linked issue to `blocked` with approval ID and unblock condition.
3. On `approval_approved`: verify approval status, mark linked issue `done`, post completion comment.

---

## 5. Observability and Recovery Paths

### 5.1 Pre-flight Logging

- Log: wake reason, run ID, task ID (if set), approval ID (if set), workspace source.
- Log: which PAPERCLIP_* vars are present (without printing secrets).
- **All agents:** If `PAPERCLIP_API_KEY` or `PAPERCLIP_API_URL` are missing, exit with a clear comment — API calls are unavailable. Do not loop or retry.

### 5.2 Completion Evidence

- When closing an issue, post a comment with: status line, bullets, links to deliverables/approvals/agents.

### 5.3 Blocker Comments

- When setting `blocked`, include: blocker description, approval/issue links, unblock condition.

---

## 6. Quick Reference: Wake Reasons

| Wake Reason | Typical Action |
|-------------|----------------|
| `heartbeat_timer` | Poll assignments, execute checklist |
| `issue_assigned` | Prioritize `PAPERCLIP_TASK_ID` |
| `issue_commented` | Review comment, respond or act as needed |
| `approval_approved` | Follow up on approval, close linked issues |
| `retry_failed_run` | Re-read context, resume from last state; do not redo completed work (§2.4). Use `expectedStatuses` on checkout (§3.2). |
