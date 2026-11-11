import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migration, databaseStatus, initializeDatabase } from "../server/db.js";
import {
  canAccess,
  assignedAccess,
  staffInput,
  saveStaff,
  listStaff,
  lookupStaff,
} from "../server/staff.js";
import { accessFor } from "../server/auth.js";
const owner = "267489014922215434",
  admin = "123456789012345678",
  member = "234567890123456789";

test("report access is read only and cannot see drafts or manage channels/staff", () => {
  for (const action of [
    "posts",
    "publish",
    "reconcile",
    "webhooks",
    "staff",
    "setup",
  ])
    for (const method of ["GET", "POST", "PATCH", "DELETE"])
      assert.equal(canAccess("report", action, method), false);
  assert.equal(canAccess("report", "reports", "GET"), true);
  assert.equal(canAccess("report", "status", "GET"), true);
  assert.equal(canAccess("report", "reports", "POST"), false);
});
test("moderators publish but cannot grant access or manage webhooks", () => {
  for (const action of ["posts", "publish", "reconcile"])
    assert.equal(canAccess("moderator", action, "POST"), true);
  assert.equal(canAccess("moderator", "webhooks", "GET"), true);
  for (const action of ["webhooks", "staff", "setup"])
    assert.equal(canAccess("moderator", action, "POST"), false);
  assert.equal(canAccess("moderator", "staff", "GET"), false);
  assert.equal(canAccess("unknown", "posts", "GET"), false);
});
test("staff input rejects invalid IDs, roles and enabled states", () => {
  const valid = {
    discord_id: member,
    display_name: "Test",
    access: "report",
    enabled: true,
  };
  assert.equal(staffInput(valid).access, "report");
  for (const replacement of [
    { discord_id: "nix0n" },
    { discord_id: 234567890123456789 },
    { access: "owner" },
    { enabled: "true" },
  ])
    assert.throws(() => staffInput({ ...valid, ...replacement }));
  assert.deepEqual(assignedAccess({ ...valid, enabled: false }), {
    authorized: false,
    access: "denied",
  });
});

test("staff migration, grants and revocation", async (t) => {
  const pg = new PGlite();
  await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  const db = {
    async query(sql, args) {
      const r =
        !args && sql.split(";").length > 2
          ? (await pg.exec(sql)).at(-1)
          : await pg.query(sql, args);
      return { ...r, rowCount: r.rows.length || r.affectedRows || 0 };
    },
    async connect() {
      return { query: this.query.bind(this), release() {} };
    },
  };
  const oldIds = process.env.DISCORD_ADMIN_IDS,
    oldUrl = process.env.DATABASE_URL;
  process.env.DISCORD_ADMIN_IDS = owner;
  try {
    await pg.exec(migration);
    await pg.query(
      "INSERT INTO con.posts(id,kind,title,body,author_id,author_name) VALUES('a23f5ab8-67f6-4ef6-a170-70bbafb1827d','update','Existing','Keep me','owner','Owner')",
    );
    await t.test(
      "upgrades version 1 without altering existing content and is idempotent",
      async () => {
        assert.equal((await databaseStatus(db)).needs_upgrade, true);
        await initializeDatabase(db);
        await initializeDatabase(db);
        assert.equal((await databaseStatus(db)).schema_version, 2);
        assert.equal(
          (await db.query("SELECT body FROM con.posts")).rows[0].body,
          "Keep me",
        );
        const p = await db.query(
          "SELECT has_table_privilege('anon','con.staff_users','SELECT') AS anon, has_table_privilege('authenticated','con.staff_users','SELECT') AS auth",
        );
        assert.equal(p.rows[0].anon, false);
        assert.equal(p.rows[0].auth, false);
      },
    );
    await t.test(
      "grants role by Discord ID and records who changed it",
      async () => {
        await saveStaff(
          owner,
          {
            discord_id: member,
            display_name: "Member",
            access: "moderator",
            enabled: true,
          },
          db,
        );
        assert.equal((await lookupStaff(member, db)).access, "moderator");
        const audit = (
          await db.query("SELECT actor_id,new_access FROM con.staff_audit")
        ).rows[0];
        assert.equal(audit.actor_id, owner);
        assert.equal(audit.new_access, "moderator");
        const users = await listStaff(db);
        assert.equal(users[0].owner, true);
        assert.equal(users.length, 2);
      },
    );
    await t.test(
      "disabling staff revokes an existing session on its next request",
      async () => {
        process.env.DATABASE_URL = "test-only";
        const session = { user: { id: member }, accessToken: "test" };
        assert.equal(
          (await accessFor(session, (id) => lookupStaff(id, db))).access,
          "moderator",
        );
        await saveStaff(
          owner,
          {
            discord_id: member,
            display_name: "Member",
            access: "moderator",
            enabled: false,
          },
          db,
        );
        assert.deepEqual(
          await accessFor(session, (id) => lookupStaff(id, db)),
          { authorized: false, access: "denied" },
        );
        await assert.rejects(
          accessFor(session, async () => {
            throw new Error("database unavailable");
          }),
        );
      },
    );
    await t.test("protects owner and self-access from lockout", async () => {
      await assert.rejects(
        saveStaff(
          admin,
          {
            discord_id: owner,
            display_name: "Owner",
            access: "report",
            enabled: false,
          },
          db,
        ),
        /Owner accounts/,
      );
      await assert.rejects(
        saveStaff(
          admin,
          {
            discord_id: admin,
            display_name: "Self",
            access: "report",
            enabled: false,
          },
          db,
        ),
        /own access/,
      );
      assert.deepEqual(
        await accessFor({ user: { id: owner } }, async () => {
          throw new Error("should not query");
        }),
        { authorized: true, access: "admin", owner: true },
      );
    });
  } finally {
    if (oldIds === undefined) delete process.env.DISCORD_ADMIN_IDS;
    else process.env.DISCORD_ADMIN_IDS = oldIds;
    if (oldUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldUrl;
    await pg.close();
  }
});
