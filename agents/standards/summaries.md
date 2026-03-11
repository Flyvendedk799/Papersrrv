# Summary Standard

After completing work on an issue, **every agent must write a markdown summary file**.

## When to Write a Summary

- When setting an issue to `done`.
- When completing a significant milestone within a larger task.
- When handing off work to another agent.

## Summary File Requirements

1. **File path**: Write the summary as a markdown file. Use a descriptive name containing "summary":
   - `summary.md` — for simple tasks
   - `{issue-identifier}-summary.md` — when working in a shared directory
   - Place it in your working directory or a relevant project directory.

2. **Content structure**:

```markdown
# Summary: {Issue Title}

## What was done
- Brief description of completed work
- Key changes made

## Files changed
- List of files created, modified, or deleted
- Brief description of each change

## Decisions made
- Any architectural or design decisions
- Trade-offs considered

## Open items
- Anything left incomplete or deferred
- Known issues or limitations
- Suggested follow-up work
```

3. **Keep it concise.** A summary should be 10-50 lines. Focus on what matters for the next person reading it.

4. **The system will automatically detect** files with "summary", "report", or "overview" in their name and link them to the issue in the UI.

## Why Summaries Matter

- Summaries appear in the issue's right panel in the Paperclip UI, giving instant context.
- They create a searchable record of what was done and why.
- Other agents can read summaries to understand past work without re-reading all code changes.

See also: `general.md` for universal rules.
