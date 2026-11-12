import { randomUUID } from "node:crypto";
import { database } from "./db.js";
import { json, ORIGIN, readSession } from "./auth.js";
import { SITE_COPY } from "../shared/site-copy.js";
export const siteContentMigration = `
CREATE TABLE IF NOT EXISTS con.site_content (key text PRIMARY KEY,value text NOT NULL CHECK(length(value)<=4000),version integer NOT NULL DEFAULT 1,updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE con.site_content ADD COLUMN IF NOT EXISTS removed boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS con.site_content_history(id uuid PRIMARY KEY,key text NOT NULL,action text NOT NULL,actor_id text NOT NULL,before_value text NOT NULL,before_removed boolean NOT NULL,after_value text NOT NULL,after_removed boolean NOT NULL,after_version integer NOT NULL,source_id uuid,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE con.site_content_history ADD COLUMN IF NOT EXISTS actor_name text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS con_content_history_time ON con.site_content_history(created_at DESC);
ALTER TABLE con.site_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE con.site_content_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON con.site_content,con.site_content_history FROM PUBLIC,anon,authenticated;
`;
export const isSiteOwner = (id) =>
  Boolean(
    id &&
    (process.env.DISCORD_ADMIN_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .includes(id),
  );
const fail = (status, message) => {
  throw Object.assign(Error(message), { status });
};
export function validateSiteCopy(body) {
  if (
    !body ||
    typeof body !== "object" ||
    !Object.hasOwn(SITE_COPY, body.key) ||
    !Number.isSafeInteger(body.version) ||
    body.version < 0
  )
    fail(400, "Invalid text or version.");
  if (body.removed !== undefined && typeof body.removed !== "boolean")
    fail(400, "Invalid removal state.");
  if (
    typeof body.value !== "string" ||
    body.value.length > 4000 ||
    (!body.removed && !body.value.trim())
  )
    fail(400, "Enter text or use Remove.");
  return {
    key: body.key,
    value: body.value.trim(),
    version: body.version,
    ...(body.removed !== undefined ? { removed: body.removed } : {}),
  };
}
export async function siteContentHandler(req, res, dbFactory = database) {
  let client;
  try {
    const url = new URL(req.url || "/api/site-content", ORIGIN),
      action = url.searchParams.get("action") || "";
    if (!["GET", "PUT", "POST"].includes(req.method)) {
      res.setHeader("Allow", "GET, PUT, POST");
      fail(405, "Method not allowed.");
    }
    if (req.method === "GET" && !action) {
      try {
        const rows = (
          await dbFactory().query(
            "SELECT key,value,version,removed FROM con.site_content",
          )
        ).rows;
        return json(res, 200, {
          entries: rows.map((row) =>
            row.removed ? { ...row, value: "" } : row,
          ),
        });
      } catch (e) {
        // Pre-migration installations still expose their existing values.
        if (e.code === "42703")
          return json(res, 200, {
            entries: (
              await dbFactory().query(
                "SELECT key,value,version FROM con.site_content",
              )
            ).rows,
          });
        if (e.code === "42P01" || !process.env.DATABASE_URL)
          return json(res, 200, { entries: [] });
        throw e;
      }
    }
    if (req.method !== "GET" && req.headers.origin !== ORIGIN)
      fail(403, "Invalid origin");
    const session = await readSession(req);
    if (!session) fail(401, "Sign in required");
    if (!isSiteOwner(session.user.id))
      fail(403, "Only the site owner can manage website content.");
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (req.method === "GET" && action !== "history")
      fail(400, "Unknown content action.");
    if (req.method === "POST" && action !== "restore")
      fail(400, "Unknown content action.");
    if (req.method === "PUT" && action) fail(400, "Unknown content action.");
    let input = req.method === "PUT" ? validateSiteCopy(body) : null;
    client = await dbFactory().connect();
    await client.query("BEGIN");
    const marker = await client.query(
      "SELECT app FROM con.schema_migrations WHERE version=1",
    );
    if (marker.rows[0]?.app !== "cult-of-nix0n")
      fail(503, "Site storage is not initialized.");
    await client.query("SELECT pg_advisory_xact_lock(1570103248)");
    await client.query(siteContentMigration);
    if (req.method === "GET") {
      const cursor = url.searchParams.get("before");
      if (cursor && !/^[\da-f-]{36}$/i.test(cursor))
        fail(400, "Invalid history cursor.");
      const history = (
        await client.query(
          "SELECT * FROM con.site_content_history WHERE ($1::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM con.site_content_history WHERE id=$1)) ORDER BY created_at DESC,id DESC LIMIT 100",
          [cursor || null],
        )
      ).rows;
      const entries = (
        await client.query(
          "SELECT key,value,version,removed FROM con.site_content",
        )
      ).rows;
      await client.query("COMMIT");
      return json(res, 200, {
        history,
        entries,
        defaults: SITE_COPY,
        next: history.length === 100 ? history.at(-1).id : null,
      });
    }
    let event = null;
    if (req.method === "POST") {
      if (
        !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(
          body.event_id || "",
        ) ||
        !Number.isSafeInteger(body.version) ||
        body.version < 0 ||
        !["before", "after"].includes(body.side || "before")
      )
        fail(400, "Invalid restore request.");
      event = (
        await client.query(
          "SELECT * FROM con.site_content_history WHERE id=$1",
          [body.event_id],
        )
      ).rows[0];
      if (!event || !Object.hasOwn(SITE_COPY, event.key))
        fail(404, "History entry not found.");
      const side = body.side || "before";
      input = {
        key: event.key,
        value: event[side + "_value"],
        removed: event[side + "_removed"],
        version: body.version,
      };
    }
    const current = (
      await client.query(
        "SELECT key,value,version,removed FROM con.site_content WHERE key=$1 FOR UPDATE",
        [input.key],
      )
    ).rows[0];
    const before = current || {
      key: input.key,
      value: SITE_COPY[input.key],
      version: 0,
      removed: false,
    };
    if (before.version !== input.version)
      fail(
        409,
        "This content changed in another window. Refresh before changing it again.",
      );
    // Removing hides the entry without losing its saved value.
    const removed = input.removed === true,
      value = event ? input.value : removed ? before.value : input.value;
    const row = (
      await client.query(
        `INSERT INTO con.site_content(key,value,version,removed,updated_by)VALUES($1,$2,$3,$4,$5) ON CONFLICT(key) DO UPDATE SET value=$2,version=$3,removed=$4,updated_by=$5,updated_at=now() RETURNING key,value,version,removed`,
        [input.key, value, before.version + 1, removed, session.user.id],
      )
    ).rows[0];
    const eventId = randomUUID();
    await client.query(
      "INSERT INTO con.site_content_history(id,key,action,actor_id,before_value,before_removed,after_value,after_removed,after_version,source_id,actor_name)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        eventId,
        input.key,
        event ? "restore" : removed ? "remove" : "edit",
        session.user.id,
        before.value,
        before.removed,
        row.value,
        row.removed,
        row.version,
        event?.id || null,
        session.user.name || session.user.id,
      ],
    );
    await client.query("COMMIT");
    return json(res, 200, { ...row, event_id: eventId });
  } catch (e) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    return json(res, e.status || 503, {
      error: e.status
        ? e.message
        : "Could not update website content. Refresh and try again.",
    });
  } finally {
    client?.release();
  }
}
