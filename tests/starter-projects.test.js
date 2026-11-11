import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { initializeDatabase } from "../server/db.js";
import {
  seedOwnerProjects,
  STARTER_PROJECTS,
} from "../server/starter-projects.js";
import { projectsHandler, publicProjects } from "../server/projects.js";
import { seal, ORIGIN } from "../server/auth.js";
const owner = "267489014922215434",
  member = "123456789012345678";
process.env.SESSION_SECRET = "starter-project-tests-only-32-plus-characters";
process.env.DISCORD_ADMIN_IDS = owner;
test("starter records use the authenticated owner, never create fake identities/votes/comments, and are inserted only once", async () => {
  const pg = new PGlite();
  await pg.exec("CREATE ROLE anon;CREATE ROLE authenticated;");
  const db = {
    async query(sql, args) {
      if (sql.includes("pg_advisory_xact_lock"))
        return { rows: [], rowCount: 0 };
      if (
        !args &&
        (sql.includes("CREATE TABLE") ||
          sql.includes("CREATE SCHEMA") ||
          sql.includes("ALTER TABLE con.staff_users ADD COLUMN"))
      ) {
        const rs = await pg.exec(sql);
        const r = rs.at(-1);
        return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
      }
      const r = await pg.query(sql, args);
      return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 };
    },
    async connect() {
      return { ...this, release() {} };
    },
  };
  try {
    await initializeDatabase(db);
    const res = {
      setHeader() {},
      end(s) {
        this.body = JSON.parse(s);
      },
    };
    await projectsHandler(
      {
        method: "POST",
        url: "/api/projects?action=seed",
        headers: {
          origin: ORIGIN,
          cookie: `__Host-con_session=${await seal({ user: { id: member, name: "Member" } }, 60)}`,
        },
        body: {},
      },
      res,
      () => db,
      async () => ({ owner: false, authorized: false }),
    );
    assert.equal(res.statusCode, 403);
    assert.equal(
      (await seedOwnerProjects(db, { id: owner, name: "Actual owner" })).seeded,
      2,
    );
    let projects = await publicProjects(db);
    assert.equal(projects.length, 2);
    assert.equal(
      projects.every(
        (p) =>
          p.owner_id === owner &&
          p.author_name === "Actual owner" &&
          p.votes === 0 &&
          p.comments === 0,
      ),
      true,
    );
    assert.equal(
      projects.find((p) => p.title === "Cult of nix0n").git_url,
      "https://github.com/iekhanine/c0n",
    );
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM con.staff_users")).rows[0]
        .n,
      0,
    );
    await db.query("UPDATE con.projects SET published=null WHERE id=$1", [
      STARTER_PROJECTS[0].id,
    ]);
    assert.equal(
      (await seedOwnerProjects(db, { id: owner, name: "Renamed owner" }))
        .seeded,
      0,
    );
    projects = await publicProjects(db);
    assert.equal(projects.length, 1);
    assert.equal(projects[0].author_name, "Actual owner");
    assert.equal(
      (
        await pg.query(
          "SELECT has_table_privilege('anon','con.project_bootstrap','SELECT') AS allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await pg.close();
  }
});
