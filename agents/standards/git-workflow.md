# Git Workflow Standards

These rules apply to agents responsible for Git operations (branches, commits, PRs).

## Pull Request Rules

1. **Do NOT create a PR until ALL work for the project/issue chain is complete.** A PR must contain the full set of changes — not partial work. Check that all related sub-issues are `done` before opening the PR.
2. **One PR per project/feature.** Combine all commits from the issue chain into a single PR so reviewers get the complete picture.
3. **Before creating a PR, verify:**
   - All assigned issues in the chain are marked `done`.
   - No sibling issues are still `in_progress` or `todo`.
   - The branch builds and passes any available checks.
4. **If work is still in progress,** commit to the branch but do NOT open the PR yet. Comment on the parent issue with progress instead.

## Branch Naming

- Use `feature/<issue-key>-<short-description>` (e.g. `feature/AIL-148-mymetaview-5`).
- One branch per project/feature chain.

## Commit Discipline

- Write clear commit messages: what changed and why.
- Reference the issue key in commits (e.g. `AIL-148: add batch endpoint`).
- Do not squash prematurely — keep individual commits for traceability until the PR is merged.

## PR Description

- Title: concise summary of the full feature/fix.
- Body: list all issues resolved, summarize changes, note anything reviewers should watch for.
