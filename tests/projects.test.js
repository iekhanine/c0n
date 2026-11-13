import { randomUUID } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { publish } from "../server/admin.js";
import { PGlite } from "@electric-sql/pglite";
import { migration, staffMigration, approvalMigration } from "../server/db.js";
import { projectMigration } from "../server/project-schema.js";
import {
  projectsHandler,
  projectInput,
  canReview,
} from "../server/projects.js";
import { ORIGIN, seal } from "../server/auth.js";
process.env.SESSION_SECRET = "projects-test-only-session-key-at-least-32";
const owner = "267489014922215434",
  alice = "123456789012345678",
  bob = "234567890123456789";
process.env.DISCORD_ADMIN_IDS = owner;
const res = () => ({
  headers: {},
  setHeader(k, v) {
    this.headers[k] = v;
  },
  end(body) {
    this.body = JSON.parse(body);
  },
});
const draft = {
  title: "A real app",
  body: "Something useful",
  category: "Apps",
  link_url: "https://example.com",
  image_url: "",
  git_url: "https://github.com/example/app",
};
test("project input validates categories, length and safe links", () => {
  assert.deepEqual(projectInput(draft), draft);
  assert.equal(
    projectInput({ ...draft, git_url: "https://gitlab.com/example/app" })
      .git_url,
    "https://gitlab.com/example/app",
  );
  const legacy = { ...draft };
  delete legacy.git_url;
  assert.equal(projectInput(legacy).git_url, "");
  assert.equal(projectInput({ ...draft, category:"Photography" }).category, "Photography");
  assert.equal(projectInput({ ...draft, category:"Glass sculpture" }).category, "Glass sculpture");
  for (const change of [
    { title: "" },
    { body: "a".repeat(10001) },
    { category: "<script>" },
    { link_url: "javascript:alert(1)" },
    { git_url: "javascript:alert(1)" },
    { git_url: "https://user:pass@github.com/example/repo" },
    { image_url: "https://user:pass@example.com" },
  ])
    assert.throws(() => projectInput({ ...draft, ...change }));
  assert.equal(
    canReview({ authorized: true, permissions: ["projects.publish"] }),
    false,
  );
  assert.equal(
    canReview({
      authorized: true,
      permissions: ["projects.publish", "website.publish"],
    }),
    true,
  );
});
test("project lifecycle keeps authorship, approval snapshots, votes and comments isolated", async (t) => {
  const pg = new PGlite();
  await pg.exec("CREATE ROLE anon;CREATE ROLE authenticated;");
  await pg.exec(migration);
  await pg.exec(staffMigration);
  await pg.exec(approvalMigration);
  await pg.exec(projectMigration);
  const db = {
    async query(sql, args) {
      if (sql.includes("pg_advisory_xact_lock"))
        return { rows: [], rowCount: 0 };
      const r = await pg.query(sql, args);
      return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 };
    },
    async connect() {
      return { ...this, release() {} };
    },
  };
  async function call(user, action, method = "GET", body = {}, id) {
    const response = res();
    const request = {
      method,
      url: `/api/projects?action=${action}${id ? "&id=" + id : ""}`,
      headers: {
        origin: ORIGIN,
        ...(user
          ? {
              cookie: `__Host-con_session=${await seal({ user: { id: user, name: user === alice ? "Alice" : "Bob" } }, 60)}`,
            }
          : {}),
      },
      body,
    };
    await projectsHandler(
      request,
      response,
      () => db,
      async (session) => ({
        authorized: session.user.id === owner,
        owner: session.user.id === owner,
        permissions: [],
      }),
    );
    return response;
  }
  let id;
  try {
    await t.test(
      "sign-in and correct origin required for mutation",
      async () => {
        assert.equal(
          (await call(null, "save", "POST", { ...draft, submit: true }))
            .statusCode,
          401,
        );
        const r = res();
        await projectsHandler(
          {
            method: "POST",
            url: "/api/projects",
            headers: { origin: "https://evil.example" },
          },
          r,
          () => {
            throw Error("Should not access storage");
          },
        );
        assert.equal(r.statusCode, 403);
      },
    );
    await t.test(
      "members create drafts; others cannot view or change them",
      async () => {
        const r = await call(alice, "save", "POST", {
          ...draft,
          submit: false,
        });
        assert.equal(r.statusCode, 200);
        id = r.body.id;
        assert.equal(
          (await call(null, "detail", "GET", {}, id)).statusCode,
          404,
        );
        assert.equal(
          (await call(alice, "detail", "GET", {}, id)).statusCode,
          200,
        );
        assert.equal(
          (
            await call(bob, "save", "PUT", {
              ...draft,
              id,
              version: 1,
              submit: true,
            })
          ).statusCode,
          409,
        );
        assert.equal(
          (
            await call(bob, "review", "PUT", {
              id,
              version: 1,
              decision: "approve",
              note: "",
            })
          ).statusCode,
          403,
        );
      },
    );
    await t.test("shared categories are visible and new creator categories are available globally", async()=>{
      const initial=await call(null,"categories");
      assert.equal(initial.statusCode,200);
      assert.ok(initial.body.categories.some(c=>c.name==="Photography"));
      const made=await call(alice,"categories","POST",{name:"Glass Sculpture"});
      assert.equal(made.statusCode,201);
      assert.equal(made.body.name,"Glass Sculpture");
      const global=await call(null,"categories");
      assert.ok(global.body.categories.some(c=>c.name==="Glass Sculpture"));
      assert.equal((await call(bob,"categories","PUT",{name:"Glass Sculpture",active:false})).statusCode,403);
      assert.equal((await call(owner,"categories","PUT",{name:"Glass Sculpture",active:false})).statusCode,200);
      const hidden=await call(null,"categories");
      assert.ok(hidden.body.categories.some(c=>c.name==="Glass Sculpture" && c.active===false));
    });
    await t.test(
      "submission stays private until reviewed, and stale approvals fail",
      async () => {
        assert.equal(
          (
            await call(alice, "save", "PUT", {
              ...draft,
              id,
              version: 1,
              submit: true,
            })
          ).statusCode,
          200,
        );
        assert.equal((await call(null, "list")).body.projects.length, 0);
        assert.equal(
          (
            await call(owner, "review", "PUT", {
              id,
              version: 1,
              decision: "approve",
              note: "",
            })
          ).statusCode,
          409,
        );
        assert.equal(
          (
            await call(owner, "review", "PUT", {
              id,
              version: 2,
              decision: "approve",
              note: "",
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (await call(null, "detail", "GET", {}, id)).body.project.title,
          draft.title,
        );
        assert.equal(
          (await call(null, "detail", "GET", {}, id)).body.project.git_url,
          draft.git_url,
        );
      },
    );
    await t.test(
      "one vote per Discord user, idempotent setting and undo",
      async () => {
        for (let n = 0; n < 2; n++)
          assert.equal(
            (await call(bob, "vote", "PUT", { id, voted: true })).body.votes,
            1,
          );
        assert.equal(
          (await call(alice, "vote", "PUT", { id, voted: true })).body.votes,
          2,
        );
        assert.equal(
          (await call(bob, "vote", "PUT", { id, voted: false })).body.votes,
          1,
        );
        const list = (await call(alice, "list")).body.projects;
        assert.equal(list[0].votes, 1);
        assert.equal(list[0].voted, true);
      },
    );
    await t.test(
      "published snapshot survives author edits and rejected submission",
      async () => {
        await call(alice, "save", "PUT", {
          ...draft,
          title: "Unapproved title",
          id,
          version: 3,
          submit: true,
        });
        assert.equal(
          (await call(null, "detail", "GET", {}, id)).body.project.title,
          draft.title,
        );
        assert.equal(
          (
            await call(owner, "review", "PUT", {
              id,
              version: 4,
              decision: "reject",
              note: "Needs detail",
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (await call(null, "detail", "GET", {}, id)).body.project.title,
          draft.title,
        );
      },
    );
    await t.test(
      "comments require sign-in, enforce cooldown and ownership, public reads expose plain text",
      async () => {
        assert.equal(
          (await call(null, "comment", "POST", { id, body: "hello" }))
            .statusCode,
          401,
        );
        assert.equal(
          (
            await call(bob, "comment", "POST", {
              id,
              body: "<script>plain text</script>",
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (await call(bob, "comment", "POST", { id, body: "again" }))
            .statusCode,
          429,
        );
        const comments = (await call(null, "detail", "GET", {}, id)).body
          .comments;
        assert.equal(comments[0].body, "<script>plain text</script>");
        assert.equal(
          (
            await call(alice, "comment", "DELETE", {
              id,
              comment_id: comments[0].id,
            })
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await call(bob, "comment", "DELETE", {
              id,
              comment_id: comments[0].id,
            })
          ).statusCode,
          200,
        );
      },
    );
    await t.test(
      "votes rank projects and unpublishing removes public access",
      async () => {
        const other = (
          await call(bob, "save", "POST", {
            ...draft,
            title: "Second app",
            submit: true,
          })
        ).body.id;
        await call(owner, "review", "PUT", {
          id: other,
          version: 1,
          decision: "approve",
          note: "",
        });
        await call(bob, "vote", "PUT", { id: other, voted: true });
        await call(owner, "vote", "PUT", { id: other, voted: true });
        assert.equal((await call(null, "list")).body.projects[0].id, other);
        await call(owner, "review", "PUT", {
          id,
          version: 5,
          decision: "unpublish",
          note: "",
        });
        assert.equal(
          (await call(null, "detail", "GET", {}, id)).statusCode,
          404,
        );
        assert.equal(
          (await call(bob, "vote", "PUT", { id, voted: true })).statusCode,
          404,
        );
      },
    );
    await t.test(
      "existing admin project publishing creates and removes voting-enabled project pages",
      async () => {
        const legacy = "a23f5ab8-67f6-4ef6-a170-70bbafb1827d";
        await db.query(
          "INSERT INTO con.posts(id,kind,title,body,author_id,author_name)VALUES($1,'project','Admin project','Existing workflow',$2,'Owner')",
          [legacy, owner],
        );
        await publish(
          db,
          { post_id: legacy, version: 1, website: true },
          { owner: true },
        );
        assert.equal(
          (await call(null, "detail", "GET", {}, legacy)).body.project.title,
          "Admin project",
        );
        await publish(
          db,
          { post_id: legacy, unpublish: true },
          { owner: true },
        );
        assert.equal(
          (await call(null, "detail", "GET", {}, legacy)).statusCode,
          404,
        );
      },
    );
    await t.test(
      "project details outside the top listings never expose draft edits",
      async () => {
        const old = randomUUID(),
          snapshot = { ...draft, title: "Approved older project" };
        await db.query(
          "INSERT INTO con.projects(id,owner_id,owner_name,draft,published,status,published_at)VALUES($1,$2,'Alice',$3,$4,'pending','2000-01-01')",
          [
            old,
            alice,
            JSON.stringify({ ...draft, title: "PRIVATE DRAFT" }),
            JSON.stringify(snapshot),
          ],
        );
        const args = [],
          values = [];
        for (let i = 0; i < 205; i++) {
          const offset = args.length;
          args.push(randomUUID(), alice, JSON.stringify(draft));
          values.push(
            `($${offset + 1},$${offset + 2},'Alice',$${offset + 3}::jsonb,$${offset + 3}::jsonb,'approved',now())`,
          );
        }
        await db.query(
          "INSERT INTO con.projects(id,owner_id,owner_name,draft,published,status,published_at)VALUES" +
            values.join(","),
          args,
        );
        assert.equal(
          (await call(null, "list")).body.projects.some((p) => p.id === old),
          false,
        );
        assert.equal(
          (await call(null, "detail", "GET", {}, old)).body.project.title,
          "Approved older project",
        );
      },
    );
    await t.test(
      "database browser roles have no access to project records",
      async () => {
        for (const table of ["projects", "project_comments", "project_votes"])
          assert.equal(
            (
              await pg.query(
                `SELECT has_table_privilege('anon','con.${table}','SELECT') AS allowed`,
              )
            ).rows[0].allowed,
            false,
          );
      },
    );
  } finally {
    await pg.close();
  }
});
