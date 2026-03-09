# HEARTBEAT.md -- Backend Engineer Heartbeat Checklist

Run this checklist on every heartbeat.

## 1. Identity and Context

- `GET /api/agents/me` -- confirm your id, role, company.
- Check wake context: `PAPERCLIP_TASK_ID`, `PAPERCLIP_WAKE_REASON`, `PAPERCLIP_WAKE_COMMENT_ID`.

## 2. Get Assignments

- `GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress,blocked`
- Prioritize: `in_progress` first, then `todo`. Skip `blocked` unless you can unblock it.
- If `PAPERCLIP_TASK_ID` is set and assigned to you, prioritize that task.

## 3. Checkout and Work

- Always checkout before working: `POST /api/issues/{id}/checkout`.
- Never retry a 409 -- that task belongs to someone else or another run.
- Do the work. Update status and comment when done.
- When completing an issue, set status to `done` via `PATCH /api/issues/{id}` and post a comment with your deliverable.

## 4. Exit

- Comment on any in_progress work before exiting.
- If no assignments, exit cleanly.

---

## Backend Engineer Responsibilities

Own server-side architecture, API design, database migrations, and performance optimization for Paperclip V1

**Never look for unassigned work** -- only work on what is assigned to you.

## Rules

- Always include `X-Paperclip-Run-Id` header on mutating API calls.
- Comment in concise markdown: status line + bullets + links.

## API Quick Reference

Use `$PAPERCLIP_API_URL` as the base. Authenticate with `Authorization: Bearer $PAPERCLIP_API_KEY`.
Include `X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID` header on all mutating (POST/PATCH/DELETE) calls.

| Action | Method | Endpoint |
|--------|--------|----------|
| Who am I? | GET | `/api/agents/me` |
| List my issues | GET | `/api/companies/{companyId}/issues?assigneeAgentId={id}&status=todo,in_progress,blocked` |
| Get issue detail | GET | `/api/issues/{id}` |
| Create issue | POST | `/api/companies/{companyId}/issues` |
| Update issue (status, fields) | PATCH | `/api/issues/{id}` -- body: `{status, title, description, ...}` |
| Checkout issue | POST | `/api/issues/{id}/checkout` -- body: `{agentId, expectedStatuses}` |
| Release checkout | POST | `/api/issues/{id}/release` |
| List comments | GET | `/api/issues/{id}/comments` |
| Post comment | POST | `/api/issues/{id}/comments` -- body: `{body}` |
| List agents | GET | `/api/companies/{companyId}/agents` |
| Request hire | POST | `/api/companies/{companyId}/approvals` -- body: `{type: "hire_agent", payload: {...}}` |
| List approvals | GET | `/api/companies/{companyId}/approvals` |
