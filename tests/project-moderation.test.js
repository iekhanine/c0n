import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migration, staffMigration, approvalMigration } from "../server/db.js";
import { projectMigration } from "../server/project-schema.js";
import { projectsHandler, publicProjects } from "../server/projects.js";
import { ORIGIN, seal } from "../server/auth.js";
import { reportInput } from "../server/project-moderation.js";
const owner = "267489014922215434",
  member = "123456789012345678",
  other = "234567890123456789";
process.env.SESSION_SECRET =
  "moderation-tests-only-session-secret-32-characters";
test("report reasons and details are allowlisted", () => {
  assert.equal(
    reportInput({ reason: "illegal", details: "" }).reason,
    "illegal",
  );
  for (const b of [
    { reason: "unknown", details: "" },
    { reason: "other", details: "" },
    { reason: "spam", details: "x".repeat(2001) },
  ])
    assert.throws(() => reportInput(b));
});
test("front-page ranking, pins, removal and private report review enforce authorization", async () => {
  const pg = new PGlite();
  try {
    await pg.exec("CREATE ROLE anon;CREATE ROLE authenticated");
    await pg.exec(migration);
    await pg.exec(staffMigration);
    await pg.exec(approvalMigration);
    await pg.exec(projectMigration);
    const db = {
      async query(sql, args) {
        if (sql.includes("pg_advisory_xact_lock"))
          return { rows: [], rowCount: 0 };
        const r = await pg.query(sql, args);
        return { ...r, rowCount: r.affectedRows ?? r.rows.length };
      },
      async connect() {
        return { ...this, release() {} };
      },
    };
    const ids = [];
    for (let i = 0; i < 20; i++) {
      const id = randomUUID();
      ids.push(id);
      await db.query(
        "INSERT INTO con.projects(id,owner_id,owner_name,draft,published,status,published_at)VALUES($1,$2,'Member',$3,$3,'approved',now())",
        [
          id,
          member,
          JSON.stringify({
            title: "Project " + i,
            body: "Useful project",
            category: "Tools",
          }),
        ],
      );
      for (let v = 0; v < i; v++)
        await db.query(
          "INSERT INTO con.project_votes(project_id,user_id)VALUES($1,$2)",
          [id, "voter-" + v],
        );
    }
    async function call(
      uid,
      action,
      method = "GET",
      body = {},
      origin = ORIGIN,
    ) {
      const res = {
        setHeader() {},
        end(s) {
          this.body = JSON.parse(s);
        },
      };
      await projectsHandler(
        {
          method,
          url: "/api/projects?action=" + action,
          body,
          headers: {
            origin,
            ...(uid
              ? {
                  cookie:
                    "__Host-con_session=" +
                    (await seal(
                      {
                        user: {
                          id: uid,
                          name: uid === owner ? "Owner" : "Member",
                        },
                      },
                      60,
                    )),
                }
              : {}),
          },
        },
        res,
        () => db,
        async (s) =>
          s.user.id === owner
            ? { owner: true, authorized: true }
            : { authorized: false, permissions: [] },
      );
      return res;
    }
    const list = await call(null, "list&showcase=1");
    assert.equal(list.statusCode, 200);
    assert.equal(list.body.projects.length, 15);
    assert.equal(list.body.projects[0].id, ids[19]);
    assert.equal(list.body.canManage, false);
    assert.equal(
      (await call(member, "moderate", "PUT", { id: ids[0], operation: "pin" }))
        .statusCode,
      403,
    );
    assert.equal(
      (await call(owner, "moderate", "PUT", { id: ids[0], operation: "pin" }))
        .statusCode,
      200,
    );
    const pinned = await publicProjects(db, "", true);
    assert.equal(pinned[0].id, ids[0]);
    assert.equal(pinned.length, 15);
    assert.equal(pinned[0].homepage_pinned, true);
    assert.equal(
      (await call(owner, "moderate", "PUT", { id: ids[0], operation: "unpin" }))
        .statusCode,
      200,
    );
    assert.equal((await publicProjects(db, "", true)).length, 15);
    assert.equal(
      (
        await call(null, "report", "POST", {
          id: ids[19],
          reason: "illegal",
          details: "",
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await call(member, "report", "POST", {
          id: ids[19],
          reason: "illegal",
          details: "Questionable listing",
        })
      ).statusCode,
      201,
    );
    assert.ok(
      (await publicProjects(db, "", true)).some((p) => p.id === ids[19]),
    );
    assert.equal((await call(member, "project_reports")).statusCode, 403);
    const reports = await call(owner, "project_reports");
    assert.equal(reports.body.reports.length, 1);
    const report = reports.body.reports[0];
    assert.equal(report.reporter_name, "Member");
    assert.equal(
      (
        await call(member, "review_report", "PUT", {
          report_id: report.id,
          decision: "remove",
          note: "",
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await call(owner, "review_report", "PUT", {
          report_id: report.id,
          decision: "remove",
          note: "Needs review",
        })
      ).statusCode,
      200,
    );
    assert.ok(
      !(await publicProjects(db, "", true)).some((p) => p.id === ids[19]),
    );
    assert.ok((await publicProjects(db)).some((p) => p.id === ids[19]));
    assert.equal(
      (await call(owner, "project_reports&state=removed")).body.reports[0]
        .review_note,
      "Needs review",
    );
    assert.equal(
      (
        await call(owner, "review_report", "PUT", {
          report_id: report.id,
          decision: "dismiss",
          note: "",
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await call(owner, "moderate", "PUT", {
          id: ids[19],
          operation: "restore",
        })
      ).statusCode,
      200,
    );
    assert.equal((await publicProjects(db, "", true))[0].id, ids[19]);
    assert.equal(
      (
        await call(other, "report", "POST", {
          id: ids[18],
          reason: "spam",
          details: "",
        })
      ).statusCode,
      201,
    );
    const second = (await call(owner, "project_reports")).body.reports[0];
    await call(owner, "review_report", "PUT", {
      report_id: second.id,
      decision: "dismiss",
      note: "Reviewed",
    });
    assert.equal(
      (await call(owner, "project_reports&state=dismissed")).body.reports
        .length,
      1,
    );
    assert.equal(
      (
        await call(
          owner,
          "moderate",
          "PUT",
          { id: ids[19], operation: "hide" },
          "https://evil.example",
        )
      ).statusCode,
      403,
    );
    for (let i = 0; i < 5; i++)
      assert.equal(
        (await call(owner, "moderate", "PUT", { id: ids[i], operation: "pin" }))
          .statusCode,
        200,
      );
    assert.equal(
      (await call(owner, "moderate", "PUT", { id: ids[6], operation: "pin" }))
        .statusCode,
      409,
    );
    assert.equal((await publicProjects(db, "", true)).length, 5);
    const security = await db.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid='con.project_reports'::regclass",
    );
    assert.equal(security.rows[0].relrowsecurity, true);
  } finally {
    await pg.close();
  }
});
