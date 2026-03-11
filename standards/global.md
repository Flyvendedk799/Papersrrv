# Global Standards

**Scope:** All agents  
**Source:** [AIL-52](/AIL/issues/AIL-52) — Phase 4 via [AIL-61](/AIL/issues/AIL-61)  
**References:** [STRUCTURE.md](STRUCTURE.md), [hiring.md](hiring.md) (delegation), `doc/DEVELOPING.md` and AGENTS.md §5–7 (PR conventions when proposing code work)

---

## 1. Task Proposal Conventions

When proposing work — creating issues, delegating subtasks, or breaking down goals — follow these conventions. They ensure traceability, correct attribution, and alignment with company goals.

### 1.1 Parent/Child Hierarchy

**Rule:** Every subtask MUST have a `parentId` pointing to its parent issue.

- **Why:** Breaks traceability if omitted. Work becomes untraceable; managers cannot see the full breakdown.
- **API:** `POST /api/companies/{companyId}/issues` — always include `parentId` when creating a subtask.
- **Inheritance:** If `parentId` is set, the issue inherits `projectId` from the parent unless explicitly overridden.

**Example:**

```json
POST /api/companies/{companyId}/issues
{
  "title": "Implement caching layer",
  "assigneeAgentId": "{agentId}",
  "parentId": "{parentIssueId}",
  "goalId": "{goalId}",
  "status": "todo",
  "priority": "high"
}
```

**Exception:** CEO or board creating top-level work (no parent) may omit `parentId`. All delegated work must have a parent.

---

### 1.2 Goal Linkage

**Rule:** Set `goalId` on subtasks when the parent or company has an active goal.

- **Why:** Links work to strategic objectives; enables goal-level reporting and prioritization.
- **When:** If the parent issue has a `goalId`, carry it forward to subtasks. If you are creating work under a goal, set `goalId` explicitly.
- **Exception:** CEO/manager creating top-level work may create goals first; then set `goalId` on the root issue. Subtasks inherit or receive the same `goalId`.

**Example:** Parent issue AIL-52 has `goalId: "goal-1"`. All subtasks (AIL-54, AIL-55, …) should have `goalId: "goal-1"`.

---

### 1.3 Billing Codes

**Rule:** Set `billingCode` when work crosses teams or requires cost attribution.

- **Why:** Enables cost tracking by project, client, or initiative. Cross-team work often needs a billing code for reporting.
- **When:** Use when company policy or the parent task specifies a billing code; or when work spans multiple teams/departments.
- **Format:** Company-defined (e.g. `"PROJ-X"`, `"CLIENT-ACME"`). Omit when not required.

**Example:**

```json
{
  "title": "Design API for Auth team",
  "parentId": "{parentId}",
  "goalId": "{goalId}",
  "billingCode": "PROJ-AUTH",
  "assigneeAgentId": "{designAgentId}"
}
```

---

### 1.4 Create-Issue Checklist

Before `POST /api/companies/{companyId}/issues`:

| Field | Required for subtasks? | Notes |
|-------|------------------------|-------|
| `title` | Yes | Clear, actionable |
| `parentId` | Yes (if subtask) | Link to parent |
| `goalId` | Yes (unless CEO top-level) | Carry from parent or set explicitly |
| `assigneeAgentId` | Recommended | Assign to the right person |
| `status` | Optional | Defaults to `todo` |
| `priority` | Optional | `critical`, `high`, `medium`, `low` |
| `billingCode` | When cross-team | Per company policy |
| `projectId` | Optional | Inherited from parent if omitted |

---

### 1.5 Cross-Reference: PR Conventions

When the proposed work results in code changes (e.g. subtasks for implementation, review, or deployment):

- **PR conventions** apply to the resulting pull requests. See `doc/DEVELOPING.md` (dependency lockfile, verification) and AGENTS.md §5–7 (contract sync, verification, definition of done).
- **Definition of done** (AGENTS.md §10): typecheck, tests, build pass; contracts synced.
- Task proposal conventions govern *how* you create and link issues; PR conventions govern *how* engineers deliver the code.

---

## 2. Control-Plane Invariants (Summary)

These apply to all agents; details are in the Paperclip skill and `doc/SPEC-implementation.md`.

- **Single assignee** — One agent per task.
- **Checkout before work** — `POST /api/issues/{id}/checkout`; never start without it.
- **Never retry 409** — Task belongs to someone else.
- **X-Paperclip-Run-Id** — Include on all mutating API calls.
- **Comment style** — Status line + bullets + company-prefixed links (e.g. `/AIL/issues/AIL-61`).
- **Never look for unassigned work** — Only work on assigned tasks.
- **Escalate via chainOfCommand** — When stuck.

---

*End of global standards. See [STRUCTURE.md](STRUCTURE.md) for file layout and cross-reference rules.*
