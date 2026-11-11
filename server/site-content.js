import { database } from "./db.js";
import { json, ORIGIN, readSession } from "./auth.js";
import { SITE_COPY } from "../shared/site-copy.js";
export const siteContentMigration = `
CREATE TABLE IF NOT EXISTS con.site_content (key text PRIMARY KEY,value text NOT NULL CHECK(length(value)<=4000),version integer NOT NULL DEFAULT 1,updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE con.site_content ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON con.site_content FROM PUBLIC,anon,authenticated;
`;
export const isSiteOwner = (id) =>
  Boolean(
    id &&
    (process.env.DISCORD_ADMIN_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .includes(id),
  );
export function validateSiteCopy(body) {
  if (
    !body ||
    typeof body !== "object" ||
    !Object.hasOwn(SITE_COPY, body.key) ||
    typeof body.value !== "string" ||
    !body.value.trim() ||
    body.value.length > 4000 ||
    !Number.isSafeInteger(body.version) ||
    body.version < 0
  )
    throw Object.assign(Error("Invalid text or version."), { status: 400 });
  return { key: body.key, value: body.value.trim(), version: body.version };
}
export async function siteContentHandler(req, res, dbFactory = database) {
  if (!["GET", "PUT"].includes(req.method)) {
    res.setHeader("Allow", "GET, PUT");
    return json(res, 405, { error: "Method not allowed" });
  }
  if (req.method === "PUT") {
    if (req.headers.origin !== ORIGIN)
      return json(res, 403, { error: "Invalid origin" });
    const session = await readSession(req);
    if (!session) return json(res, 401, { error: "Sign in required" });
    if (!isSiteOwner(session.user.id))
      return json(res, 403, {
        error: "Only the site owner can edit website text.",
      });
    let input;
    try {
      input = validateSiteCopy(
        typeof req.body === "string" ? JSON.parse(req.body) : req.body,
      );
    } catch (e) {
      return json(res, e.status || 400, { error: e.message });
    }
    let client;
    try {
      client = await dbFactory().connect();
      await client.query("BEGIN");
      const marker = await client.query(
        "SELECT app FROM con.schema_migrations WHERE version=1",
      );
      if (marker.rows[0]?.app !== "cult-of-nix0n")
        throw Error("Site storage is not initialized");
      // Serialize first-time initialization; only an authenticated owner can reach this path.
      await client.query("SELECT pg_advisory_xact_lock(1570103248)");
      await client.query(siteContentMigration);
      const saved = await client.query(
        `INSERT INTO con.site_content(key,value,version,updated_by) SELECT $1,$2,1,$3 WHERE $4=0 ON CONFLICT(key) DO UPDATE SET value=$2,version=con.site_content.version+1,updated_by=$3,updated_at=now() WHERE con.site_content.version=$4 RETURNING key,value,version`,
        [input.key, input.value, session.user.id, input.version],
      );
      // Existing rows with a nonzero version need a regular UPDATE, because SELECT prevents the insert attempt.
      let row = saved.rows[0];
      if (!row && input.version > 0)
        row = (
          await client.query(
            "UPDATE con.site_content SET value=$2,version=version+1,updated_by=$3,updated_at=now() WHERE key=$1 AND version=$4 RETURNING key,value,version",
            [input.key, input.value, session.user.id, input.version],
          )
        ).rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return json(res, 409, {
          error:
            "This text changed in another window. Reload before editing again.",
        });
      }
      await client.query("COMMIT");
      return json(res, 200, row);
    } catch {
      if (client) await client.query("ROLLBACK").catch(() => {});
      return json(res, 503, {
        error: "Could not save website text. Check site storage and try again.",
      });
    } finally {
      client?.release();
    }
  }
  try {
    const rows = (
      await dbFactory().query("SELECT key,value,version FROM con.site_content")
    ).rows;
    return json(res, 200, { entries: rows });
  } catch (e) {
    if (e.code === "42P01" || !process.env.DATABASE_URL)
      return json(res, 200, { entries: [] });
    return json(res, 503, {
      error: "Website text is temporarily unavailable.",
    });
  }
}
