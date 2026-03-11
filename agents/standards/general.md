# General Standards

These rules apply to **all agents** in the company, regardless of role.

## Core Principles

1. **Work only on assigned tasks.** Never pick up unassigned work.
2. **Always checkout before working.** Use `POST /api/issues/{id}/checkout`.
3. **Comment before exiting.** Leave a status update on any in-progress issue.
4. **Be concise.** Comments should be markdown: status line + bullets + links.
5. **Include run headers.** Always send `X-Paperclip-Run-Id` on mutating API calls.

## File Management

- When you read or write files during your work, the system automatically tracks them.
- Use clear, descriptive file paths. Prefer organized directory structures.
- Markdown files (`.md`) are rendered in the Paperclip UI — use them for documentation, plans, and summaries.

## Security

- Never exfiltrate secrets, tokens, or private data.
- Do not perform destructive commands unless explicitly requested.
- Do not expose API keys, passwords, or credentials in comments or files.

## Standards References

Additional standards may apply depending on your role. Check your `AGENTS.md` for the full list.
