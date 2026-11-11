import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { seal, ORIGIN } from "../server/auth.js";
import {
  siteContentHandler,
  validateSiteCopy,
} from "../server/site-content.js";
process.env.SESSION_SECRET = "owner-copy-tests-only-at-least-32-characters";
const owner = "267489014922215434",
  admin = "123456789012345678";
process.env.DISCORD_ADMIN_IDS = owner;
const response = () => ({
  setHeader() {},
  end(body) {
    this.body = JSON.parse(body);
  },
});
async function req(id, body, origin = ORIGIN) {
  return {
    method: "PUT",
    headers: {
      origin,
      ...(id
        ? { cookie: `__Host-con_session=${await seal({ user: { id } }, 60)}` }
        : {}),
    },
    body,
  };
}
test("stationary text rejects unknown keys, blank text and invalid versions", () => {
  for (const body of [
    { key: "arbitrary", value: "x", version: 0 },
    { key: "footer", value: " ", version: 0 },
    { key: "footer", value: "x", version: -1 },
  ])
    assert.throws(() => validateSiteCopy(body));
});
test("anonymous, non-owner and cross-origin edits never access storage", async () => {
  for (const [id, origin, status] of [
    [null, ORIGIN, 401],
    [admin, ORIGIN, 403],
    [owner, "https://other.example", 403],
  ]) {
    const res = response();
    await siteContentHandler(
      await req(id, { key: "footer", value: "test", version: 0 }, origin),
      res,
      () => {
        throw Error("Storage must not be called");
      },
    );
    assert.equal(res.statusCode, status);
  }
});
test("owner saves persist, public reads omit attribution, stale edits conflict", async () => {
  const pg = new PGlite();
  await pg.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA con;CREATE TABLE con.schema_migrations(version integer,app text);INSERT INTO con.schema_migrations VALUES(1,'cult-of-nix0n');",
  );
  const client = {
    query: (sql, args) =>
      sql.includes("pg_advisory_xact_lock")
        ? Promise.resolve({ rows: [] })
        : sql.includes("CREATE TABLE")
          ? pg.exec(sql).then(() => ({ rows: [] }))
          : pg.query(sql, args),
    release() {},
  };
  const db = { query: client.query, connect: async () => client };
  try {
    let res = response();
    await siteContentHandler(
      await req(owner, { key: "footer", value: "New footer", version: 0 }),
      res,
      () => db,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.version, 1);
    res = response();
    await siteContentHandler(
      await req(owner, { key: "footer", value: "Second footer", version: 1 }),
      res,
      () => db,
    );
    assert.equal(res.body.version, 2);
    res = response();
    await siteContentHandler(
      await req(owner, { key: "footer", value: "Stale footer", version: 1 }),
      res,
      () => db,
    );
    assert.equal(res.statusCode, 409);
    res = response();
    await siteContentHandler({ method: "GET" }, res, () => db);
    assert.equal(res.body.entries[0].value, "Second footer");
    assert.equal(res.body.entries[0].updated_by, undefined);
    const privileges = await pg.query(
      "SELECT has_table_privilege('anon','con.site_content','SELECT') AS allowed",
    );
    assert.equal(privileges.rows[0].allowed, false);
  } finally {
    await pg.close();
  }
});
