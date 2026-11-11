import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  migration,
  staffMigration,
  databaseStatus,
  initializeDatabase,
} from "../server/db.js";
import {
  canAccess,
  assignedAccess,
  staffInput,
  saveStaff,
  listStaff,
  lookupStaff,
  registerApplicant,
} from "../server/staff.js";
import { accessFor } from "../server/auth.js";
import {
  assertContent,
  assertDestination,
  posts,
  publish,
  reconcile,
} from "../server/admin.js";
import {
  PERMISSIONS,
  presetPermissions,
  channelLabel,
  discordMessageTime,
} from "../shared/permissions.js";
const owner = "267489014922215434",
  member = "234567890123456789",
  limited = "345678901234567890";
const user = {
  id: member,
  name: "New member",
  username: "member",
  avatar: null,
};
const input = (overrides = {}) => ({
  discord_id: member,
  display_name: "New member",
  access: "moderator",
  enabled: true,
  approval_status: "approved",
  permissions: ["updates.view", "updates.edit"],
  all_channels: false,
  channel_ids: [],
  ...overrides,
});

test("checkbox permissions override role labels and enforce content-specific actions", () => {
  const updateOnly = { access: "admin", permissions: ["updates.publish"] };
  assert.equal(canAccess(updateOnly, "publish", "POST"), true);
  assert.doesNotThrow(() => assertContent(updateOnly, "update", "publish"));
  assert.throws(
    () => assertContent(updateOnly, "project", "publish"),
    /permission/,
  );
  assert.equal(canAccess(updateOnly, "staff", "POST"), false);
  assert.equal(canAccess(updateOnly, "webhooks", "POST"), false);
  const report = { access: "moderator", permissions: ["reports.view"] };
  for (const action of [
    "posts",
    "publish",
    "reconcile",
    "webhooks",
    "staff",
    "setup",
  ])
    for (const method of ["GET", "POST", "PATCH", "DELETE"])
      assert.equal(canAccess(report, action, method), false);
  assert.equal(canAccess(report, "reports", "GET"), true);
  assert.equal(canAccess(report, "reports", "POST"), false);
});
test("staff input validates all permissions and view dependencies", () => {
  assert.deepEqual(
    staffInput(input({ permissions: ["updates.publish"] })).permissions,
    ["updates.view", "updates.publish"],
  );
  for (const patch of [
    { discord_id: "nix0n" },
    { permissions: ["everything"] },
    { approval_status: "pending" },
    { access: "owner" },
    { enabled: "true" },
  ])
    assert.throws(() => staffInput(input(patch)));
  assert.equal(channelLabel("general"), "#general");
  assert.equal(channelLabel("###  updates"), "#updates");
  assert.equal(
    assignedAccess({
      access: "admin",
      enabled: true,
      approval_status: "pending",
      permissions: PERMISSIONS,
    }).authorized,
    false,
  );
});

test("pending approval, checkbox grants, legacy upgrade and revocation", async (t) => {
  const pg = new PGlite();
  await pg.exec("CREATE ROLE anon;CREATE ROLE authenticated;");
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
  const res = () => ({
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(body) {
      this.body = body;
    },
  });
  try {
    await pg.exec(migration);
    await pg.exec(staffMigration);
    await db.query(
      "INSERT INTO con.staff_users(discord_id,display_name,access,enabled,created_by,updated_by)VALUES('456789012345678901','Existing staff','report',true,'owner','owner')",
    );
    await db.query(
      "INSERT INTO con.posts(id,kind,title,body,author_id,author_name)VALUES('a23f5ab8-67f6-4ef6-a170-70bbafb1827d','update','Existing','Keep me','owner','Owner'),('a23f5ab8-67f6-4ef6-a170-70bbafb1827e','project','Private project','Hidden','owner','Owner')",
    );
    await t.test(
      "additive version 3 upgrade preserves content and existing approved access",
      async () => {
        assert.equal((await databaseStatus(db)).needs_upgrade, true);
        await initializeDatabase(db);
        await initializeDatabase(db);
        assert.equal((await databaseStatus(db)).schema_version, 4);
        assert.equal(
          (await db.query("SELECT count(*)::int AS n FROM con.posts")).rows[0]
            .n,
          2,
        );
        const legacy = await lookupStaff("456789012345678901", db);
        assert.equal(legacy.approval_status, "approved");
        assert.deepEqual(legacy.permissions, ["reports.view"]);
        assert.equal(
          (
            await db.query(
              "SELECT has_table_privilege('anon','con.staff_users','SELECT') AS allowed",
            )
          ).rows[0].allowed,
          false,
        );
      },
    );
    await t.test(
      "first sign-in creates a pending request with no access, including on repeated sign-in",
      async () => {
        assert.equal(await registerApplicant(user, db), true);
        await registerApplicant(user, db);
        const m = await lookupStaff(member, db);
        assert.equal(m.approval_status, "pending");
        assert.equal(m.enabled, false);
        assert.deepEqual(m.permissions, []);
        assert.equal(assignedAccess(m).authorized, false);
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int AS n FROM con.staff_users WHERE discord_id=$1",
              [member],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "approval grants exactly the checked capabilities, independently of role name",
      async () => {
        await saveStaff(
          owner,
          input({
            access: "admin",
            permissions: ["updates.edit", "updates.publish"],
          }),
          db,
        );
        const m = await lookupStaff(member, db);
        assert.equal(m.approval_status, "approved");
        assert.equal(m.enabled, true);
        assert.deepEqual(m.permissions, [
          "updates.view",
          "updates.edit",
          "updates.publish",
        ]);
        assert.equal(canAccess(assignedAccess(m), "staff", "GET"), false);
        await registerApplicant(user, db);
        assert.equal((await lookupStaff(member, db)).enabled, true);
        assert.equal(
          (await db.query("SELECT actor_id FROM con.staff_audit")).rows[0]
            .actor_id,
          owner,
        );
      },
    );
    await t.test(
      "restricted readers cannot retrieve other content types or edit/create/publish them",
      async () => {
        const staff = {
          user,
          access: "moderator",
          permissions: ["updates.view"],
        };
        const response = res();
        await posts({ method: "GET" }, response, db, staff);
        const found = JSON.parse(response.body).posts;
        assert.equal(found.length, 1);
        assert.equal(found[0].kind, "update");
        await assert.rejects(
          posts(
            {
              method: "POST",
              body: { kind: "update", title: "no", body: "Denied" },
            },
            res(),
            db,
            staff,
          ),
          /permission/,
        );
        await assert.rejects(
          posts(
            {
              method: "PATCH",
              body: {
                id: "a23f5ab8-67f6-4ef6-a170-70bbafb1827e",
                kind: "project",
                title: "Test",
                body: "Denied",
                version: 1,
              },
            },
            res(),
            db,
            { permissions: ["updates.edit"] },
          ),
          /permission/,
        );
        await assert.rejects(
          publish(
            db,
            {
              post_id: "a23f5ab8-67f6-4ef6-a170-70bbafb1827e",
              version: 1,
              website: true,
            },
            { permissions: ["updates.publish"] },
          ),
          /permission/,
        );
        await assert.rejects(
          reconcile(
            db,
            { post_id: "a23f5ab8-67f6-4ef6-a170-70bbafb1827e" },
            { permissions: ["updates.publish"] },
          ),
          /permission/,
        );
      },
    );
    await t.test(
      "saving an edit never changes the published website snapshot",
      async () => {
        const postId = "a23f5ab8-67f6-4ef6-a170-70bbafb1827d";
        await publish(
          db,
          { post_id: postId, version: 1, website: true },
          { owner: true },
        );
        await posts(
          {
            method: "PATCH",
            body: {
              id: postId,
              kind: "update",
              title: "New draft title",
              body: "Unpublished edit",
              version: 1,
            },
          },
          res(),
          db,
          { permissions: ["updates.edit"] },
        );
        let row = (
          await db.query(
            "SELECT body,published_snapshot,published_version FROM con.posts WHERE id=$1",
            [postId],
          )
        ).rows[0];
        assert.equal(row.body, "Unpublished edit");
        assert.equal(row.published_snapshot.body, "Keep me");
        assert.equal(row.published_version, 1);
        await assert.rejects(
          publish(
            db,
            { post_id: postId, version: 2, website: true },
            { permissions: ["updates.publish"] },
          ),
          /website/,
        );
        await publish(
          db,
          { post_id: postId, version: 2, website: true },
          { owner: true },
        );
        row = (
          await db.query(
            "SELECT published_snapshot,published_version FROM con.posts WHERE id=$1",
            [postId],
          )
        ).rows[0];
        assert.equal(row.published_snapshot.body, "Unpublished edit");
        assert.equal(row.published_version, 2);
      },
    );
    await t.test(
      "channel checkboxes prevent posting outside the assigned destination",
      async () => {
        const channelId = "b23f5ab8-67f6-4ef6-a170-70bbafb1827d";
        await db.query(
          "INSERT INTO con.webhooks(id,name,url_cipher,discord_id,channel_id,created_by)VALUES($1,'#allowed','test-cipher','123456789012345678','234567890123456789','owner')",
          [channelId],
        );
        await saveStaff(
          owner,
          input({ permissions: ["updates.publish"], channel_ids: [channelId] }),
          db,
        );
        const grant = assignedAccess(await lookupStaff(member, db));
        assert.deepEqual(grant.channel_ids, [channelId]);
        assert.equal(grant.all_channels, false);
        assert.doesNotThrow(() => assertDestination(grant, channelId, false));
        await assert.rejects(
          publish(
            db,
            {
              post_id: "a23f5ab8-67f6-4ef6-a170-70bbafb1827d",
              version: 2,
              webhook_id: "b23f5ab8-67f6-4ef6-a170-70bbafb1827e",
            },
            grant,
          ),
          /Discord channel/,
        );
        assert.throws(
          () => assertDestination(grant, undefined, true),
          /website/,
        );
      },
    );
    await t.test(
      "disable/rejection persists on re-login and revokes an existing session",
      async () => {
        process.env.DATABASE_URL = "test-only";
        await saveStaff(owner, input({ enabled: false }), db);
        await registerApplicant(user, db);
        const session = { user, accessToken: "test" };
        assert.equal(
          (await accessFor(session, (id) => lookupStaff(id, db))).authorized,
          false,
        );
        await saveStaff(
          owner,
          input({
            approval_status: "rejected",
            enabled: false,
            permissions: [],
          }),
          db,
        );
        await registerApplicant(user, db);
        assert.equal(
          (await lookupStaff(member, db)).approval_status,
          "rejected",
        );
        await assert.rejects(
          accessFor(session, async () => {
            throw new Error("unavailable");
          }),
        );
      },
    );
    await t.test(
      "staff managers cannot delegate permissions they do not hold",
      async () => {
        await registerApplicant(
          { id: limited, name: "Manager", username: "manager", avatar: null },
          db,
        );
        await saveStaff(
          owner,
          input({ discord_id: limited, permissions: ["staff.manage"] }),
          db,
        );
        await assert.rejects(
          saveStaff(limited, input({ permissions: ["projects.publish"] }), db),
          /beyond your own/,
        );
      },
    );
    await t.test(
      "owner and self access stay protected; unknown IDs cannot be approved",
      async () => {
        await assert.rejects(
          saveStaff(limited, input({ discord_id: owner }), db),
          /Owner accounts/,
        );
        await assert.rejects(saveStaff(member, input(), db), /own access/);
        await assert.rejects(
          saveStaff(owner, input({ discord_id: "567890123456789012" }), db),
          /sign in with Discord/,
        );
        const grant = await accessFor({ user: { id: owner } }, async () => {
          throw new Error("should not query");
        });
        assert.equal(grant.owner, true);
        assert.deepEqual(grant.permissions, PERMISSIONS);
        assert.equal((await listStaff(db))[0].owner, true);
      },
    );
  } finally {
    if (oldIds === undefined) delete process.env.DISCORD_ADMIN_IDS;
    else process.env.DISCORD_ADMIN_IDS = oldIds;
    if (oldUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldUrl;
    await pg.close();
  }
});

test("Discord delivery dates use exact message creation time without number rounding", () => {
  assert.equal(
    discordMessageTime("175928847299117063"),
    "2016-04-30T11:18:25.796Z",
  );
  assert.equal(discordMessageTime(null), null);
});
