# Hiring Rules and Approval Flow

**Scope:** HR Manager, CEO, board  
**Source:** [AIL-60](/AIL/issues/AIL-60) — Phase 3 of [AIL-52](/AIL/issues/AIL-52)  
**References:** [secrets.md](secrets.md) (credentials during agent setup), [STRUCTURE.md](STRUCTURE.md)

---

## 1. When to Initiate Hires

HR Manager initiates hires when:

- **Delegated by CEO or COO** — A task explicitly requests a hire (e.g. "hire N engineers", "hire Standards & Routines Owner").
- **Board-approved plan** — A plan under [AIL-52](/AIL/issues/AIL-52) or similar includes hire milestones.
- **Explicit hire request task** — An issue assigned to HR Manager with hire as the deliverable.

**Do NOT** initiate hires unless you have one of the above. IC agents should ask their manager; HR Manager does not proactively hire without delegation or plan.

---

## 2. Approval Gates

### Company setting

- `requireBoardApprovalForNewAgents` — default `true`. Editable in company advanced settings.
- When `true`: every new hire creates a `hire_agent` approval; board must approve before the agent becomes active.
- When `false`: agent is created as `idle` immediately; no approval record.

### Approval flow

1. **Submit hire:** `POST /api/companies/{companyId}/agent-hires` with full agent payload.
2. **If approval required:** Agent is created as `status=pending_approval`; a linked `hire_agent` approval is created automatically.
3. **Board reviews** — Approve or reject in the approvals queue.
4. **On approve:** Agent transitions `pending_approval → idle`; agent can run and receive assignments.
5. **On reject:** Agent remains non-active; may be terminated or purged later.

### Board responsibility

- Board owns the approval gate. No agent can bypass it when the company setting is enabled.
- Board may request revision (`POST /api/approvals/{id}/request-revision`) or resubmit (`POST /api/approvals/{id}/resubmit`).

---

## 3. Org-Structure Constraints

### Strict tree

- **Single manager per agent.** `reportsTo` is nullable only for the root (CEO). No multi-manager reporting.
- Every new hire must have `reportsTo` set to the appropriate manager agent ID (except CEO, who reports to no one).

### Permission to hire

- **`can_create_agents`** — Required to call `POST /api/companies/{companyId}/agent-hires`.
- Default: CEO `true`, everyone else `false`.
- Board always passes. Agents with `can_create_agents` may hire subordinates in the same company.
- **Do NOT** request hires unless you are a manager or CEO. IC agents must ask their manager.

### Chain of command

- New agents must fit the org tree. `reportsTo` must reference an existing agent in the same company.
- CEO, COO, and department heads (e.g. Chief of Sales, Founding Engineer) are typical managers for new hires.

---

## 4. Hire Request API

### Endpoint

```
POST /api/companies/{companyId}/agent-hires
```

### Required checklist

Before submitting, read `agents/hr-manager/HIRING_CHECKLIST.md`. All new agents MUST include:

- `name`, `role`, `adapterType`, `adapterConfig`, `runtimeConfig`
- `capabilities` (one-line description)
- `reportsTo` (manager agent ID)
- `budgetMonthlyCents` (0 for unbudgeted)

**adapterType** must always be `"cursor"`. No exceptions.

**instructionsFilePath** must point to the agent's AGENTS.md: `/app/agents/<url-key>/AGENTS.md`.

---

## 5. Approval Follow-Up

When board resolves your approval, you may be woken with:

- `PAPERCLIP_APPROVAL_ID`
- `PAPERCLIP_APPROVAL_STATUS`
- `PAPERCLIP_LINKED_ISSUE_IDS`

**Actions:**

1. `GET /api/approvals/{approvalId}` — confirm status.
2. `GET /api/approvals/{approvalId}/issues` — list linked issues.
3. For each linked issue: close (`PATCH` status to `done`) if the approval fully resolves it, or comment with next steps.
4. Always include links to the approval and issue in comments.

---

## 6. Delegation

HR Manager delegates execution to HR Partners when appropriate:

- Create subtasks with `POST /api/companies/{companyId}/issues`. Always set `parentId`.
- Assign hire execution tasks to HR Partners.
- Maintain quality and speed; HR Manager owns hiring operations end-to-end.

---

*End of hiring rules. See [STRUCTURE.md](STRUCTURE.md) for cross-reference rules.*
