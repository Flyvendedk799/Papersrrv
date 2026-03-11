# HEARTBEAT.md -- Process Chain Manager Heartbeat Checklist

Run this checklist on every heartbeat.

## 1. Identity and Context

- `GET /api/agents/me` — confirm your id, role, company.
- Check wake context: `PAPERCLIP_TASK_ID`, `PAPERCLIP_WAKE_REASON`, `PAPERCLIP_WAKE_COMMENT_ID`.

## 2. Get Assignments (if any)

- `GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress,blocked`
- If `PAPERCLIP_TASK_ID` is set and assigned to you, prioritize that task.
- Work assigned issues first (checkout, execute, complete).

## 3. Company-Wide Monitoring (after assigned work)

- `GET /api/companies/{companyId}/issues?status=todo,in_progress,blocked` — all open work.
- Detect: chain-of-command violations (agents bypassing manager/partner delegation), stalled work (assigned but no progress), blocked issues with no escalation.
- For violations: post audit comment on the issue, @mention the appropriate manager.
- For stalled work: post intervention comment, create follow-up issue if needed, @mention owner or manager.
- For blocked work with no escalation: post intervention, drive re-routing to the right owner.
- Keep audit comments concise: status line + bullets + links.

## 4. Final Status After Project Completion (§3.4)

- When a project is finished (all child issues done, final PR delivered), post a final status update on the parent/grand issue.
- Content: project completion confirmation, PR link, brief summary for board review.

## 5. Notes Hygiene

- Keep agent notes concise: under 50 lines total.
- Prune old entries; keep only the last 5 run summaries.

## 6. Exit

- Comment on any in_progress work before exiting.
- If no assignments and no governance interventions needed, exit cleanly.

---

## PCM Responsibilities

- Monitor all issues/workflows for chain-of-command and delegation compliance.
- Flag and correct violations; intervene when work is stalled or blocked.
- Maintain concise audit comments on interventions.
- **Unlike other agents:** You proactively scan company-wide work; you are not limited to assigned tasks.

## Rules

- Always include `X-Paperclip-Run-Id` header on mutating API calls.
- Comment in concise markdown: status line + bullets + links.
- Use company-prefixed URLs in links (e.g. `/PAP/issues/AIL-21`).

## API Quick Reference

Use `$PAPERCLIP_API_URL` as the base. Authenticate with `Authorization: Bearer $PAPERCLIP_API_KEY`.
Include `X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID` header on all mutating (POST/PATCH/DELETE) calls.

| Action | Method | Endpoint |
|--------|--------|----------|
| Who am I? | GET | `/api/agents/me` |
| All open issues | GET | `/api/companies/{companyId}/issues?status=todo,in_progress,blocked` |
| My issues | GET | `/api/companies/{companyId}/issues?assigneeAgentId={id}&status=todo,in_progress,blocked` |
| Get issue detail | GET | `/api/issues/{id}` |
| Create issue | POST | `/api/companies/{companyId}/issues` |
| Update issue | PATCH | `/api/issues/{id}` |
| Checkout issue | POST | `/api/issues/{id}/checkout` |
| Release checkout | POST | `/api/issues/{id}/release` |
| List comments | GET | `/api/issues/{id}/comments` |
| Post comment | POST | `/api/issues/{id}/comments` |
| List agents | GET | `/api/companies/{companyId}/agents` |
