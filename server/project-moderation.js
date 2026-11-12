import { randomUUID } from "node:crypto";
import { AppError, id } from "./content.js";
import { REPORT_REASONS } from "../shared/project-reports.js";
const ready = new WeakMap();
export async function ensureProjectModeration(db) {
  if (!ready.has(db))
    ready.set(
      db,
      (async () => {
        for (const sql of [
          "ALTER TABLE con.projects ADD COLUMN IF NOT EXISTS homepage_pinned boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS homepage_hidden boolean NOT NULL DEFAULT false",
          `CREATE TABLE IF NOT EXISTS con.project_reports(id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES con.projects(id) ON DELETE CASCADE,project_title text NOT NULL,reporter_id text NOT NULL,reporter_name text NOT NULL,reason text NOT NULL,details text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','dismissed','removed')),review_note text NOT NULL DEFAULT '',reviewed_by text,created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz)`,
          "CREATE UNIQUE INDEX IF NOT EXISTS con_project_report_open ON con.project_reports(project_id,reporter_id) WHERE status='open'",
          "CREATE INDEX IF NOT EXISTS con_project_reports_status ON con.project_reports(status,created_at DESC)",
          "ALTER TABLE con.project_reports ENABLE ROW LEVEL SECURITY",
          "REVOKE ALL ON con.project_reports FROM PUBLIC",
        ])
          await db.query(sql);
      })().catch((e) => {
        ready.delete(db);
        throw e;
      }),
    );
  await ready.get(db);
}
export function reportInput(body) {
  if (!REPORT_REASONS.some(([reason]) => reason === body.reason))
    throw new AppError(400, "Choose a report reason.");
  if (typeof body.details !== "string" || body.details.length > 2000)
    throw new AppError(400, "Details must be at most 2,000 characters.");
  if (body.reason === "other" && !body.details.trim())
    throw new AppError(400, "Tell us why you are reporting this project.");
  return { reason: body.reason, details: body.details.trim() };
}
export async function reportProject(db, body, user) {
  const input = reportInput(body),
    projectId = id(body.id);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "project-report:" + user.id,
    ]);
    const project = (
      await client.query(
        "SELECT published FROM con.projects WHERE id=$1 AND published IS NOT NULL FOR SHARE",
        [projectId],
      )
    ).rows[0];
    if (!project) throw new AppError(404, "Project not found.");
    const recent = await client.query(
      "SELECT 1 FROM con.project_reports WHERE reporter_id=$1 AND created_at>now()-interval '30 seconds' LIMIT 1",
      [user.id],
    );
    if (recent.rowCount)
      throw new AppError(
        429,
        "Wait a moment before submitting another report.",
      );
    const result = await client.query(
      "INSERT INTO con.project_reports(id,project_id,project_title,reporter_id,reporter_name,reason,details)VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(project_id,reporter_id) WHERE status='open' DO NOTHING RETURNING id",
      [
        randomUUID(),
        projectId,
        project.published.title,
        user.id,
        user.name,
        input.reason,
        input.details,
      ],
    );
    if (!result.rowCount)
      throw new AppError(
        409,
        "You already have an open report for this project.",
      );
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function moderateProject(db, body, actorId) {
  const projectId = id(body.id);
  if (!["pin", "unpin", "hide", "restore"].includes(body.operation))
    throw new AppError(400, "Choose a valid project action.");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('con-homepage-pins'))",
    );
    if (body.operation === "pin") {
      const count = (
        await client.query(
          "SELECT count(*)::int AS n FROM con.projects WHERE homepage_pinned AND NOT homepage_hidden AND published IS NOT NULL AND id<>$1",
          [projectId],
        )
      ).rows[0].n;
      if (count >= 5)
        throw new AppError(
          409,
          "Five wide cards fill the front-page grid. Unpin a card before pinning another.",
        );
    }
    const result = await client.query(
      `UPDATE con.projects SET homepage_pinned=CASE WHEN $2='pin' THEN true WHEN $2 IN ('unpin','hide') THEN false ELSE homepage_pinned END,homepage_hidden=CASE WHEN $2='hide' THEN true WHEN $2 IN ('restore','pin') THEN false ELSE homepage_hidden END,updated_at=now() WHERE id=$1 AND published IS NOT NULL RETURNING id,homepage_pinned,homepage_hidden`,
      [projectId, body.operation],
    );
    if (!result.rowCount)
      throw new AppError(404, "Published project not found.");
    await client.query("COMMIT");
    return { ok: true, project: result.rows[0] };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function reviewProjectReport(db, body, actorId) {
  const reportId = id(body.report_id);
  if (
    !["dismiss", "remove"].includes(body.decision) ||
    typeof body.note !== "string" ||
    body.note.length > 1000
  )
    throw new AppError(
      400,
      "Choose an action and use up to 1,000 characters for the note.",
    );
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const report = (
      await client.query(
        "SELECT * FROM con.project_reports WHERE id=$1 AND status='open' FOR UPDATE",
        [reportId],
      )
    ).rows[0];
    if (!report)
      throw new AppError(
        409,
        "This report has already been reviewed. Refresh the queue.",
      );
    if (body.decision === "remove")
      await client.query(
        "UPDATE con.projects SET homepage_hidden=true,homepage_pinned=false WHERE id=$1",
        [report.project_id],
      );
    await client.query(
      "UPDATE con.project_reports SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=now() WHERE id=$1",
      [
        reportId,
        body.decision === "remove" ? "removed" : "dismissed",
        body.note.trim(),
        actorId,
      ],
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
