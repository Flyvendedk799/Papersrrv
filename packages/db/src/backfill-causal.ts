/**
 * One-shot backfill for the Dossier causal-linkage columns
 * (migration 0038). Existing rows have NULL for triggeredByCommentId
 * / createdFromCommentId / createdFromRunId / requestedByCommentId /
 * replyToCommentId / etc — this script infers conservative values
 * so the Dossier DAG shows real edges on historic data instead of
 * falling back to the comments-as-parents heuristic.
 *
 * Rules (all conservative, temporal-proximity based):
 *
 *   - heartbeat_runs.triggered_by_comment_id:
 *       NULL runs whose created_at is within ≤ 15 min after the most
 *       recent issue_comment on any issue they're linked to via
 *       activity_log (entity_type=issue, run_id=run.id).
 *
 *   - issues.created_from_run_id:
 *       sub-issues (parent_id IS NOT NULL) whose created_at is
 *       within ≤ 10 min after a heartbeat_run finished (matched by
 *       created_by_agent_id = run.agent_id).
 *
 *   - issues.created_from_comment_id:
 *       sub-issues whose created_at is ≤ 10 min after an
 *       issue_comment on the parent issue, when no run match was
 *       found in the previous step.
 *
 *   - approvals.requested_by_run_id:
 *       approvals whose created_at is ≤ 10 min after a heartbeat_run
 *       finished by the same requester agent.
 *
 *   - approvals.requested_by_comment_id:
 *       approvals whose created_at is ≤ 10 min after a comment on
 *       any linked issue, when no run match.
 *
 * Only rows where the target column is currently NULL are touched —
 * the writer-populated values from live traffic are never
 * overwritten.
 *
 * Run with:
 *   DATABASE_URL=postgres://... pnpm --filter @paperclipai/db exec \
 *     tsx src/backfill-causal.ts
 *
 * Idempotent: re-running finds 0 candidates once populated.
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required");
}

const sql = postgres(url);

const WINDOW_RUN_MIN = 15;
const WINDOW_SUB_MIN = 10;
const WINDOW_APPROVAL_MIN = 10;

async function main() {
  console.log("→ Backfilling Dossier causal-linkage columns\n");

  // ── 1. heartbeat_runs.triggered_by_comment_id ──────────────
  //
  // For each run R linked to an issue via activity_log, find the
  // most recent issue_comment on that issue with created_at ≤
  // R.created_at that falls within the window. Assign R's
  // triggered_by_comment_id = that comment.
  //
  // Many runs are linked to the same issue via multiple activity_log
  // rows — DISTINCT ON keeps the best match per run.
  const runs = await sql`
    WITH run_issues AS (
      SELECT DISTINCT
        hr.id AS run_id,
        hr.created_at AS run_created_at,
        al.entity_id::uuid AS issue_id
      FROM heartbeat_runs hr
      JOIN activity_log al ON al.run_id = hr.id AND al.entity_type = 'issue'
      WHERE hr.triggered_by_comment_id IS NULL
    ),
    match AS (
      SELECT DISTINCT ON (ri.run_id)
        ri.run_id,
        ic.id AS comment_id,
        EXTRACT(EPOCH FROM (ri.run_created_at - ic.created_at)) AS gap_s
      FROM run_issues ri
      JOIN issue_comments ic
        ON ic.issue_id = ri.issue_id
        AND ic.created_at <= ri.run_created_at
      ORDER BY ri.run_id, ic.created_at DESC
    )
    UPDATE heartbeat_runs hr
    SET triggered_by_comment_id = m.comment_id
    FROM match m
    WHERE hr.id = m.run_id
      AND m.gap_s <= ${WINDOW_RUN_MIN * 60}
    RETURNING hr.id
  `;
  console.log(`  ✓ heartbeat_runs.triggered_by_comment_id populated: ${runs.length}`);

  // ── 2. issues.created_from_run_id ──────────────────────────
  //
  // Sub-issues (parent_id IS NOT NULL) created within the window
  // after a heartbeat_run by the same agent (the likely spawner).
  const subsFromRun = await sql`
    WITH match AS (
      SELECT DISTINCT ON (i.id)
        i.id AS sub_id,
        hr.id AS run_id,
        EXTRACT(EPOCH FROM (i.created_at - hr.finished_at)) AS gap_s
      FROM issues i
      JOIN heartbeat_runs hr
        ON hr.agent_id = i.created_by_agent_id
        AND hr.finished_at IS NOT NULL
        AND hr.finished_at <= i.created_at
      WHERE i.parent_id IS NOT NULL
        AND i.created_from_run_id IS NULL
        AND i.created_by_agent_id IS NOT NULL
      ORDER BY i.id, hr.finished_at DESC
    )
    UPDATE issues i
    SET created_from_run_id = m.run_id
    FROM match m
    WHERE i.id = m.sub_id
      AND m.gap_s <= ${WINDOW_SUB_MIN * 60}
    RETURNING i.id
  `;
  console.log(`  ✓ issues.created_from_run_id populated: ${subsFromRun.length}`);

  // ── 3. issues.created_from_comment_id ──────────────────────
  //
  // Sub-issues where the run match didn't fire, attributed to the
  // most recent comment on the parent issue within the window.
  const subsFromComment = await sql`
    WITH match AS (
      SELECT DISTINCT ON (i.id)
        i.id AS sub_id,
        ic.id AS comment_id,
        EXTRACT(EPOCH FROM (i.created_at - ic.created_at)) AS gap_s
      FROM issues i
      JOIN issue_comments ic
        ON ic.issue_id = i.parent_id
        AND ic.created_at <= i.created_at
      WHERE i.parent_id IS NOT NULL
        AND i.created_from_comment_id IS NULL
        AND i.created_from_run_id IS NULL
      ORDER BY i.id, ic.created_at DESC
    )
    UPDATE issues i
    SET created_from_comment_id = m.comment_id
    FROM match m
    WHERE i.id = m.sub_id
      AND m.gap_s <= ${WINDOW_SUB_MIN * 60}
    RETURNING i.id
  `;
  console.log(`  ✓ issues.created_from_comment_id populated: ${subsFromComment.length}`);

  // ── 4. approvals.requested_by_run_id ───────────────────────
  //
  // Approvals raised within the window after a run by the same
  // requesting agent.
  const approvalsFromRun = await sql`
    WITH match AS (
      SELECT DISTINCT ON (a.id)
        a.id AS approval_id,
        hr.id AS run_id,
        EXTRACT(EPOCH FROM (a.created_at - hr.finished_at)) AS gap_s
      FROM approvals a
      JOIN heartbeat_runs hr
        ON hr.agent_id = a.requested_by_agent_id
        AND hr.finished_at IS NOT NULL
        AND hr.finished_at <= a.created_at
      WHERE a.requested_by_run_id IS NULL
        AND a.requested_by_agent_id IS NOT NULL
      ORDER BY a.id, hr.finished_at DESC
    )
    UPDATE approvals a
    SET requested_by_run_id = m.run_id
    FROM match m
    WHERE a.id = m.approval_id
      AND m.gap_s <= ${WINDOW_APPROVAL_MIN * 60}
    RETURNING a.id
  `;
  console.log(`  ✓ approvals.requested_by_run_id populated: ${approvalsFromRun.length}`);

  // ── 5. approvals.requested_by_comment_id ──────────────────
  //
  // Approvals linked via issue_approvals to one or more issues,
  // attributed to the most recent comment on any linked issue
  // within the window.
  const approvalsFromComment = await sql`
    WITH match AS (
      SELECT DISTINCT ON (a.id)
        a.id AS approval_id,
        ic.id AS comment_id,
        EXTRACT(EPOCH FROM (a.created_at - ic.created_at)) AS gap_s
      FROM approvals a
      JOIN issue_approvals ia ON ia.approval_id = a.id
      JOIN issue_comments ic
        ON ic.issue_id = ia.issue_id
        AND ic.created_at <= a.created_at
      WHERE a.requested_by_comment_id IS NULL
        AND a.requested_by_run_id IS NULL
      ORDER BY a.id, ic.created_at DESC
    )
    UPDATE approvals a
    SET requested_by_comment_id = m.comment_id
    FROM match m
    WHERE a.id = m.approval_id
      AND m.gap_s <= ${WINDOW_APPROVAL_MIN * 60}
    RETURNING a.id
  `;
  console.log(`  ✓ approvals.requested_by_comment_id populated: ${approvalsFromComment.length}`);

  const total =
    runs.length + subsFromRun.length + subsFromComment.length +
    approvalsFromRun.length + approvalsFromComment.length;
  console.log(`\nDone. ${total} rows backfilled.`);
}

await main().finally(() => sql.end());
