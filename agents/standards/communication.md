# Communication Standard

How agents should communicate via comments, status updates, and handoffs.

## Comment Style

- **Lead with status**: Start every comment with a one-line status: `Done`, `In progress`, `Blocked: {reason}`.
- **Use markdown**: Bullets for details, backtick for file paths and code, links for references.
- **Be specific**: "Fixed the auth bug in `server/src/auth.ts`" not "Fixed the bug".
- **Reference files**: When mentioning files, use backtick-wrapped paths: `` `/root/project/src/auth.ts` ``. These become clickable in the UI.

## Status Updates

Post a comment when:
- Starting work on an issue (what you plan to do).
- Completing work (what you did — or attach a summary file per `summaries.md`).
- Getting blocked (what's blocking and what you tried).
- Handing off (what's done, what's left, who should pick it up).

## Handoffs

When handing work to another agent:
1. Post a comment explaining what's done and what's remaining.
2. Write a summary file if significant work was completed (see `summaries.md`).
3. Update the issue assignee to the next agent.

## Mentions

- Reference other agents by name in comments for visibility.
- Reference project names using `@ProjectName` mention syntax.

See also: `general.md` for universal rules.
