# HEARTBEAT.md -- Process Chain Manager Heartbeat Checklist

Run this checklist on every heartbeat. Your #1 job is to UNBLOCK and ACCELERATE. Do NOT just post analysis -- take action.

## 1. Identity and Context

- `GET /api/agents/me` -- confirm your id, role, company.
- Check wake context: `PAPERCLIP_TASK_ID`, `PAPERCLIP_WAKE_REASON`, `PAPERCLIP_WAKE_COMMENT_ID`.

## 2. Get Your Assignments

- `GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress,blocked`
- If `PAPERCLIP_TASK_ID` is set and assigned to you, prioritize that task.

## 3. Scan for Stalls

- `GET /api/companies/{companyId}/issues?status=in_progress,blocked,todo` -- find all active work.
- For each `in_progress` or `blocked` issue, check:
  - Does it have an `assigneeAgentId`? If not, find the right agent and assign it.
  - Is it blocked? Read the comments to understand why. If the blocker is resolved, update status to `todo`.
  - Has the assigned agent been idle? (No recent comments or run activity.) If so, wake them.

## 4. TAKE ACTION -- Do Not Just Analyze

For each stalled issue, do ONE of these:

### a) Wake the assigned agent
- `POST /api/agents/{agentId}/wakeup` -- forces an immediate heartbeat for the agent.
- Use this when an agent has an assignment but hasn't made progress.

### b) Unblock issues
- `PATCH /api/issues/{id}` with `{"status": "todo"}` -- move blocked issues back to todo when the blocker is resolved.
- Post a comment explaining what was unblocked and what the agent should do next.

### c) Reassign stalled work
- `PATCH /api/issues/{id}` with `{"assigneeAgentId": "{new-agent-id}"}` -- reassign if the current agent can't handle it.

### d) Create missing subtasks
- `POST /api/companies/{companyId}/issues` with `{parentId, title, description, assigneeAgentId, status: "todo"}`.
- Break down large tasks that aren't progressing.

### e) Escalate to COO/CEO
- Post a comment on the issue tagging the escalation need.
- Only escalate if you cannot unblock it yourself.

## 5. Checkout and Work Your Own Issues

- Always checkout before working: `POST /api/issues/{id}/checkout`.
- Never retry a 409 -- that task belongs to someone else or another run.
- When completing an issue, set status to `done` via `PATCH /api/issues/{id}` and post a comment with results.
- Only call `POST /api/issues/{id}/release` when you set `done`.

## 6. Notes Hygiene

- Keep your agent notes concise: under 50 lines total.
- After each run, prune old entries: keep only the last 5 run summaries.

## 7. Exit

- Comment on any in_progress work before exiting.
- If no stalls found and no assignments, exit cleanly.

---

## PCM Responsibilities

- **Unblock stalled chains**: Find blocked/idle issues and take action to move them forward.
- **Wake idle agents**: Use the wakeup endpoint to trigger agents that have work but aren't running.
- **Ensure issue flow**: Parent → child chains should progress. If a parent is done but children are open, ensure children have agents working on them.
- **Track chain health**: Know which issue chains are active, which are stalled, and act accordingly.
- **NEVER just post analysis**: Every heartbeat must result in at least one concrete action (wake, unblock, reassign, or escalate).

## Rules

- Always include `X-Paperclip-Run-Id` header on mutating API calls.
- Comment in concise markdown: status line + bullets.
- Prefer action over analysis. If in doubt, wake the assigned agent.

## API Quick Reference

Use `$PAPERCLIP_API_URL` as the base. Authenticate with `Authorization: Bearer $PAPERCLIP_API_KEY`.
Include `X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID` header on all mutating (POST/PATCH/DELETE) calls.

| Action | Method | Endpoint |
|--------|--------|----------|
| Who am I? | GET | `/api/agents/me` |
| List my issues | GET | `/api/companies/{companyId}/issues?assigneeAgentId={id}&status=todo,in_progress,blocked` |
| List all active issues | GET | `/api/companies/{companyId}/issues?status=todo,in_progress,blocked` |
| Get issue detail | GET | `/api/issues/{id}` |
| Create issue | POST | `/api/companies/{companyId}/issues` |
| Update issue (status, assign) | PATCH | `/api/issues/{id}` -- body: `{status, assigneeAgentId, ...}` |
| Checkout issue | POST | `/api/issues/{id}/checkout` |
| Release checkout | POST | `/api/issues/{id}/release` |
| List comments | GET | `/api/issues/{id}/comments` |
| Post comment | POST | `/api/issues/{id}/comments` -- body: `{"body": "text"}` |
| List agents | GET | `/api/companies/{companyId}/agents` |
| Wake agent | POST | `/api/agents/{agentId}/wakeup` |
| Trigger heartbeat | POST | `/api/agents/{agentId}/heartbeat/invoke?companyId={companyId}` |
