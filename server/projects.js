import { ensureSocial } from "./social.js";
import { categories, addCategory, normalizeCategory } from "./project-categories.js";
import { authorAvatars } from "./author-avatars.js";
import {
  ensureProjectModeration,
  reportProject,
  moderateProject,
  reviewProjectReport,
} from "./project-moderation.js";
import { seedOwnerProjects } from "./starter-projects.js";
import { randomUUID } from "node:crypto";
import { database } from "./db.js";
import { json, ORIGIN, readSession, accessFor } from "./auth.js";
import { lookupStaff } from "./staff.js";
import { hasPermission } from "../shared/permissions.js";
const fail = (status, message) => {
  throw Object.assign(Error(message), { status });
};
export const canReview = (grant) =>
  Boolean(
    grant?.owner ||
    (grant?.authorized &&
      hasPermission(grant, "projects.publish") &&
      hasPermission(grant, "website.publish")),
  );
export function projectInput(b) {
  b = { ...b, git_url: b.git_url ?? "" };
  const result = {};
  for (const [k, max, required] of [
    ["title", 160, true],
    ["body", 10000, true],
    ["link_url", 2000, false],
    ["image_url", 2000, false],
    ["git_url", 2000, false],
    ["category", 39, true],
  ]) {
    if (
      typeof b[k] !== "string" ||
      b[k].length > max ||
      (required && !b[k].trim())
    )
      fail(400, "Enter a title, description and category within the limits.");
    result[k] = b[k].trim();
  }
  result.category = normalizeCategory(result.category);
  for (const k of ["link_url", "image_url", "git_url"])
    if (result[k]) {
      let u;
      try {
        u = new URL(result[k]);
      } catch {
        fail(400, "Links must be valid HTTPS URLs.");
      }
      if (u.protocol !== "https:" || u.username || u.password)
        fail(400, "Links must use HTTPS without credentials.");
    }
  return result;
}
const idOf = (s) => {
  if (
    typeof s !== "string" ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(s)
  )
    fail(400, "Invalid project ID.");
  return s;
};
export async function publicProjects(db, userId = "", showcase = false) {
  await ensureProjectModeration(db);
  await ensureSocial(db);
  const projects = (
    await db.query(
      `SELECT p.id,p.published,p.published_at,p.owner_id,p.owner_name,COALESCE(NULLIF(pf.public_display_name,''),ms.codename,p.owner_name) AS public_author_name,ms.public_slug AS owner_slug,p.homepage_pinned,p.homepage_hidden,(SELECT count(*)::int FROM con.project_votes v WHERE v.project_id=p.id) AS votes,(SELECT count(*)::int FROM con.project_comments c WHERE c.project_id=p.id) AS comments,EXISTS(SELECT 1 FROM con.project_votes v WHERE v.project_id=p.id AND v.user_id=$1) AS voted FROM con.projects p LEFT JOIN con.memberships ms ON ms.user_id=p.owner_id LEFT JOIN con.profiles pf ON pf.user_id=p.owner_id WHERE p.published IS NOT NULL ${showcase ? "AND NOT p.homepage_hidden" : ""} ORDER BY ${showcase ? "p.homepage_pinned DESC," : ""} votes DESC,p.published_at DESC LIMIT ${showcase ? 15 : 200}`,
      [userId],
    )
  ).rows.map((p) => ({
    id: p.id,
    ...p.published,
    kind: "project",
    author_name: p.public_author_name,
    owner_slug: p.owner_slug,
    owner_id: p.owner_id,
    homepage_pinned: p.homepage_pinned,
    homepage_hidden: p.homepage_hidden,
    published_at: p.published_at,
    votes: p.votes,
    comments: p.comments,
    voted: p.voted,
  }));
  const avatars = await authorAvatars(db, projects.map(p => p.owner_id));
  for (const project of projects) project.avatar_url = avatars.get(project.owner_id) || "";
  if (!showcase) return projects;
  return projects.slice(0,15);
}
export async function projectsHandler(
  req,
  res,
  dbFactory = database,
  accessLookup = accessFor,
) {
  try {
    if (!["GET", "POST", "PUT", "DELETE"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST, PUT, DELETE");
      return json(res, 405, { error: "Method not allowed" });
    }
    const url = new URL(req.url, ORIGIN),
      action = url.searchParams.get("action") || "list";
    if (req.method !== "GET" && req.headers.origin !== ORIGIN)
      fail(403, "Invalid origin.");
    const session = await readSession(req),
      user = session?.user;
    if (req.method !== "GET" && !user) fail(401, "Sign in with Discord first.");
    const db = dbFactory();
    if (req.method !== "GET") {
      const staff = await lookupStaff(user.id, db);
      if (
        staff &&
        (staff.approval_status === "rejected" ||
          (staff.approval_status === "approved" && !staff.enabled))
      )
        fail(403, "Your account is disabled.");
    }
    const b =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (action === "categories") {
      if (req.method === "GET") return json(res, 200, { categories: await categories(db) });
      if (!user) fail(401, "Sign in to add a category.");
      if (req.method === "POST") {
        const name = await addCategory(db, b.name, user.id);
        return json(res, 201, { name });
      }
      if (req.method === "PUT") {
        const grant = await accessLookup(session);
        if (!canReview(grant)) fail(403, "Only publishing administrators can manage categories.");
        const name = normalizeCategory(b.name);
        if (typeof b.active !== "boolean") fail(400, "Choose a category status.");
        await categories(db);
        const row = (await db.query("UPDATE con.project_categories SET active=$2 WHERE name=$1 RETURNING name", [name,b.active])).rows[0];
        if (!row) fail(404, "Category not found.");
        return json(res, 200, { ok:true });
      }
    }
    if (action === "seed" && req.method === "POST") {
      const grant = await accessLookup(session);
      if (!grant.owner)
        fail(403, "Only the site owner can create starter projects.");
      return json(res, 200, await seedOwnerProjects(db, user));
    }
    if (action === "list" && req.method === "GET") {
      const grant = user ? await accessLookup(session) : null;
      return json(res, 200, {
        projects: await publicProjects(
          db,
          user?.id,
          url.searchParams.get("showcase") === "1",
        ),
        canManage: canReview(grant),
      });
    }
    if (
      ["report", "project_reports", "moderate", "review_report"].includes(
        action,
      )
    ) {
      if (!user) fail(401, "Sign in with Discord first.");
      const grant = await accessLookup(session);
      if (action !== "report" && !canReview(grant))
        fail(
          403,
          "Project publishing and website publishing permissions are required.",
        );
      await ensureProjectModeration(db);
      if (action === "project_reports" && req.method === "GET") {
        const state = url.searchParams.get("state") || "open";
        if (!["open", "dismissed", "removed"].includes(state))
          fail(400, "Choose a valid report status.");
        const reports = (
          await db.query(
            "SELECT r.*,p.homepage_pinned,p.homepage_hidden FROM con.project_reports r JOIN con.projects p ON p.id=r.project_id WHERE r.status=$1 ORDER BY r.created_at DESC LIMIT 200",
            [state],
          )
        ).rows;
        return json(res, 200, { reports });
      }
      if (action === "report" && req.method === "POST")
        return json(res, 201, await reportProject(db, b, user));
      if (action === "moderate" && req.method === "PUT")
        return json(res, 200, await moderateProject(db, b, user.id));
      if (action === "review_report" && req.method === "PUT")
        return json(res, 200, await reviewProjectReport(db, b, user.id));
      fail(405, "Unsupported moderation operation.");
    }
    if (action === "mine" && req.method === "GET") {
      if (!user) fail(401, "Sign in first.");
      const grant = await accessLookup(session);
      return json(res, 200, {
        projects: (
          await db.query(
            "SELECT * FROM con.projects WHERE owner_id=$1 ORDER BY updated_at DESC",
            [user.id],
          )
        ).rows,
        canReview: canReview(grant),
        owner: Boolean(grant.owner),
      });
    }
    if (action === "review") {
      if (!user) fail(401, "Sign in first.");
      const grant = await accessLookup(session);
      if (!canReview(grant))
        fail(
          403,
          "Project publishing and website publishing permissions are required.",
        );
      if (req.method === "GET")
        return json(res, 200, {
          projects: (
            await db.query(
              "SELECT * FROM con.projects WHERE status='pending' ORDER BY updated_at",
            )
          ).rows,
        });
      if (req.method !== "PUT") fail(405, "Use PUT.");
      const id = idOf(b.id);
      if (
        !["approve", "reject", "unpublish"].includes(b.decision) ||
        !Number.isSafeInteger(b.version)
      )
        fail(400, "Invalid review.");
      if (typeof b.note !== "string" || b.note.length > 2000)
        fail(400, "Review note is too long.");
      const row = (
        await db.query(
          `UPDATE con.projects SET status=CASE WHEN $3='approve' THEN 'approved' ELSE 'rejected' END,published=CASE WHEN $3='approve' THEN draft WHEN $3='unpublish' THEN NULL ELSE published END,published_at=CASE WHEN $3='approve' THEN coalesce(published_at,now()) ELSE published_at END,review_note=$4,reviewed_by=$5,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 AND (status='pending' OR $3='unpublish') RETURNING id`,
          [id, b.version, b.decision, b.note, user.id],
        )
      ).rows[0];
      if (!row) fail(409, "This submission changed. Refresh before reviewing.");
      return json(res, 200, { ok: true });
    }
    if (action === "save" && ["POST", "PUT"].includes(req.method)) {
      const draft = projectInput(b);
      draft.category = await addCategory(db, draft.category, user.id);
      if (typeof b.submit !== "boolean") fail(400, "Choose draft or submit.");
      if (req.method === "POST") {
        const count = await db.query(
          "SELECT count(*)::int AS n FROM con.projects WHERE owner_id=$1",
          [user.id],
        );
        if (count.rows[0].n >= 30)
          fail(429, "You can manage up to 30 projects.");
        const id = randomUUID();
        await db.query(
          "INSERT INTO con.projects(id,owner_id,owner_name,draft,status)VALUES($1,$2,$3,$4,$5)",
          [
            id,
            user.id,
            user.name,
            JSON.stringify(draft),
            b.submit ? "pending" : "draft",
          ],
        );
        return json(res, 200, { id });
      }
      const id = idOf(b.id);
      if (!Number.isSafeInteger(b.version))
        fail(400, "Missing project version.");
      const row = (
        await db.query(
          "UPDATE con.projects SET draft=$3,status=$4,version=version+1,updated_at=now(),review_note='' WHERE id=$1 AND owner_id=$2 AND version=$5 RETURNING id",
          [
            id,
            user.id,
            JSON.stringify(draft),
            b.submit ? "pending" : "draft",
            b.version,
          ],
        )
      ).rows[0];
      if (!row)
        fail(
          409,
          "Project changed or you do not own it. Refresh and try again.",
        );
      return json(res, 200, { id });
    }
    const id = idOf(url.searchParams.get("id") || b.id);
    if (action === "detail" && req.method === "GET") {
      const p = (await db.query("SELECT * FROM con.projects WHERE id=$1", [id]))
        .rows[0];
      if (!p) fail(404, "Project not found.");
      const own = user?.id === p.owner_id;
      if (!p.published && !own) fail(404, "Project not found.");
      const stats = (
        await db.query(
          `SELECT
        (SELECT count(*)::int FROM con.project_votes WHERE project_id=$1) AS votes,
        (SELECT count(*)::int FROM con.project_comments WHERE project_id=$1) AS comments,
        EXISTS(SELECT 1 FROM con.project_votes WHERE project_id=$1 AND user_id=$2) AS voted`,
          [id, user?.id || ""],
        )
      ).rows[0];
      const comments = p.published
        ? (
            await db.query(
              "SELECT id,user_id,user_name,body,created_at FROM con.project_comments WHERE project_id=$1 ORDER BY created_at DESC LIMIT 200",
              [id],
            )
          ).rows
        : [];
      await ensureSocial(db);
      const identity=(await db.query("SELECT COALESCE(NULLIF(pf.public_display_name,''),ms.codename,'Member') AS name,ms.public_slug AS slug FROM con.memberships ms LEFT JOIN con.profiles pf ON pf.user_id=ms.user_id WHERE ms.user_id=$1",[p.owner_id])).rows[0];
      const authorPictures = await authorAvatars(db, [p.owner_id]);
      return json(res, 200, {
        project: {
          id,
          ...(p.published || p.draft),
          avatar_url: authorPictures.get(p.owner_id) || "",
          author_name: identity?.name || p.owner_name,
          owner_slug: identity?.slug || "",
          owner_id: p.owner_id,
          published_at: p.published_at,
          ...stats,
        },
        comments,
        isPublished: Boolean(p.published),
        canEdit: own,
        canModerate: user ? canReview(await accessLookup(session)) : false,
        version: own ? p.version : undefined,
        status: own ? p.status : undefined,
      });
    }
    if (action === "vote" && req.method === "PUT") {
      if (typeof b.voted !== "boolean") fail(400, "Invalid vote.");
      await ensureSocial(db);
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const p = (
          await client.query(
            "SELECT id,owner_id FROM con.projects WHERE id=$1 AND published IS NOT NULL FOR SHARE",
            [id],
          )
        ).rows[0];
        if (!p) fail(404, "Project is not published.");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[id+":"+user.id]);
        const previouslyVoted=Boolean((await client.query("SELECT 1 FROM con.project_votes WHERE project_id=$1 AND user_id=$2",[id,user.id])).rowCount);
        if (b.voted)
          await client.query(
            "INSERT INTO con.project_votes(project_id,user_id)VALUES($1,$2) ON CONFLICT DO NOTHING",
            [id, user.id],
          );
        else
          await client.query(
            "DELETE FROM con.project_votes WHERE project_id=$1 AND user_id=$2",
            [id, user.id],
          );
        if(p.owner_id!==user.id && previouslyVoted!==b.voted)
          await client.query("INSERT INTO con.reputation_ledger(id,user_id,post_id,voter_id,points)VALUES($1,$2,$3,$4,$5)",[randomUUID(),p.owner_id,id,user.id,b.voted?1:-1]);
        const votes = (
          await client.query(
            "SELECT count(*)::int AS n FROM con.project_votes WHERE project_id=$1",
            [id],
          )
        ).rows[0].n;
        await client.query("COMMIT");
        return json(res, 200, { votes, voted: b.voted });
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
    if (action === "comment" && req.method === "POST") {
      if (typeof b.body !== "string" || !b.body.trim() || b.body.length > 2000)
        fail(400, "Comments must be 1–2000 characters.");
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `con-comment:${user.id}`,
        ]);
        const recent = await client.query(
          "SELECT 1 FROM con.project_comments WHERE user_id=$1 AND created_at>now()-interval '15 seconds' LIMIT 1",
          [user.id],
        );
        if (recent.rowCount)
          fail(429, "Give it a moment before posting another comment.");
        const p = await client.query(
          "SELECT id FROM con.projects WHERE id=$1 AND published IS NOT NULL FOR SHARE",
          [id],
        );
        if (!p.rowCount) fail(404, "Project is not published.");
        await client.query(
          "INSERT INTO con.project_comments(id,project_id,user_id,user_name,body)VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), id, user.id, user.name, b.body.trim()],
        );
        await client.query("COMMIT");
        return json(res, 200, { ok: true });
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
    if (action === "comment" && req.method === "DELETE") {
      const comment = idOf(b.comment_id),
        grant = await accessLookup(session);
      const result = await db.query(
        "DELETE FROM con.project_comments WHERE id=$1 AND project_id=$2 AND (user_id=$3 OR $4) RETURNING id",
        [comment, id, user.id, canReview(grant)],
      );
      if (!result.rowCount) fail(403, "You cannot remove this comment.");
      return json(res, 200, { ok: true });
    }
    fail(405, "Unsupported project operation.");
  } catch (e) {
    if (e.code === "42P01")
      return json(res, 503, {
        error:
          "Project storage needs an update. The owner can apply it from Admin → Database.",
        needsSetup: true,
      });
    if (!e.status)
      console.error("Community project operation failed", {
        code: e.code || "application",
      });
    return json(res, e.status || 503, {
      error: e.status ? e.message : "Project service temporarily unavailable.",
    });
  }
}
