import pg from "pg";
import { projectMigration } from "./project-schema.js";
import { presetPermissions } from "../shared/permissions.js";

// HEADER 001: Server-only pooled database connection. No credentials in logs.
let pool;
export function database() {
  if (!process.env.DATABASE_URL)
    throw Object.assign(new Error("DATABASE_URL is not configured."), {
      status: 503,
    });
  if (!pool) {
    const url = new URL(process.env.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol))
      throw new Error("Invalid database configuration");
    for (const name of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
      url.searchParams.delete(name);
    pool = new pg.Pool({
      connectionString: url.toString(),
      ssl: {
        rejectUnauthorized: true,
        ...(process.env.DATABASE_CA_CERT
          ? { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n") }
          : {}),
      },
      max: 2,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 10000,
      query_timeout: 20000,
      application_name: "con-admin",
    });
    pool.on("error", () =>
      console.error("CoN idle database connection failed"),
    );
  }
  return pool;
}

// HEADER 002: Migration is scoped to con, and refuses an unrelated existing schema.
export const migration = `
CREATE SCHEMA IF NOT EXISTS con;
CREATE TABLE con.schema_migrations (version integer PRIMARY KEY, app text NOT NULL CHECK (app = 'cult-of-nix0n'));
CREATE TABLE con.webhooks (
 id uuid PRIMARY KEY, name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
 url_cipher text NOT NULL, discord_id text NOT NULL UNIQUE, channel_id text NOT NULL, guild_id text,
 enabled boolean NOT NULL DEFAULT true, created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE con.posts (
 id uuid PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('update','project')),
 title text NOT NULL DEFAULT '' CHECK (length(title) <= 200),
 body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1800),
 link_url text NOT NULL DEFAULT '', image_url text NOT NULL DEFAULT '',
 featured boolean NOT NULL DEFAULT false, published_at timestamptz,
 author_id text NOT NULL, author_name text NOT NULL,
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE con.deliveries (
 id uuid PRIMARY KEY, post_id uuid NOT NULL REFERENCES con.posts(id),
 webhook_id uuid NOT NULL REFERENCES con.webhooks(id), message_id text,
 state text NOT NULL CHECK (state IN ('sending','sent','failed','uncertain')),
 post_version integer NOT NULL, last_error text,
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (post_id, webhook_id)
);
CREATE INDEX con_posts_published ON con.posts (published_at DESC) WHERE published_at IS NOT NULL;
ALTER TABLE con.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE con.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE con.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE con.deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA con FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA con FROM PUBLIC, anon, authenticated;
INSERT INTO con.schema_migrations(version, app) VALUES (1, 'cult-of-nix0n');
`;
// HEADER 003: Staff access is an additive migration; existing content is preserved.
export const staffMigration = `
CREATE TABLE con.staff_users (
 discord_id text PRIMARY KEY CHECK (discord_id ~ '^[0-9]{17,20}$'),
 display_name text NOT NULL DEFAULT '' CHECK (length(display_name)<=80),
 access text NOT NULL CHECK (access IN ('admin','moderator','report')),
 enabled boolean NOT NULL DEFAULT true,
 created_by text NOT NULL, updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE con.staff_audit (
 id uuid PRIMARY KEY, actor_id text NOT NULL, target_id text NOT NULL,
 old_access text, new_access text NOT NULL, old_enabled boolean, new_enabled boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE con.staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE con.staff_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON con.staff_users,con.staff_audit FROM PUBLIC,anon,authenticated;
INSERT INTO con.schema_migrations(version,app) VALUES (2,'cult-of-nix0n');
`;
export const approvalMigration = `
ALTER TABLE con.staff_users ADD COLUMN username text, ADD COLUMN avatar text,
 ADD COLUMN approval_status text NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending','approved','rejected')),
 ADD COLUMN permissions jsonb, ADD COLUMN channel_ids jsonb NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN all_channels boolean NOT NULL DEFAULT false, ADD COLUMN requested_at timestamptz, ADD COLUMN last_seen_at timestamptz;
UPDATE con.staff_users SET permissions=CASE access
 WHEN 'admin' THEN '${JSON.stringify(presetPermissions("admin"))}'::jsonb
 WHEN 'moderator' THEN '${JSON.stringify(presetPermissions("moderator"))}'::jsonb
 ELSE '["reports.view"]'::jsonb END;
UPDATE con.staff_users SET all_channels=true;
ALTER TABLE con.posts ADD COLUMN published_snapshot jsonb, ADD COLUMN published_version integer, ADD COLUMN published_updated_at timestamptz;
UPDATE con.posts SET published_snapshot=jsonb_build_object('kind',kind,'title',title,'body',body,'link_url',link_url,'image_url',image_url,'featured',featured,'author_name',author_name),published_version=version,published_updated_at=updated_at WHERE published_at IS NOT NULL;
ALTER TABLE con.staff_users ALTER COLUMN permissions SET NOT NULL, ALTER COLUMN permissions SET DEFAULT '[]'::jsonb,
 ALTER COLUMN approval_status SET DEFAULT 'pending';
ALTER TABLE con.staff_users ADD CONSTRAINT con_permissions_array CHECK (jsonb_typeof(permissions)='array');
ALTER TABLE con.staff_audit ADD COLUMN old_permissions jsonb, ADD COLUMN new_permissions jsonb,
 ADD COLUMN old_status text, ADD COLUMN new_status text, ADD COLUMN old_channels jsonb, ADD COLUMN new_channels jsonb, ADD COLUMN old_all_channels boolean, ADD COLUMN new_all_channels boolean;
UPDATE con.webhooks SET name='#' || left(coalesce(nullif(regexp_replace(trim(name),'^#+[[:space:]]*',''),''),'channel'),79);
INSERT INTO con.schema_migrations(version,app) VALUES (3,'cult-of-nix0n');
`;
export async function databaseStatus(db = database()) {
  const result = await db.query(
    "SELECT to_regclass('con.schema_migrations')::text AS marker",
  );
  if (!result.rows[0].marker) return { connected: true, initialized: false };
  const marker = await db.query(
    "SELECT version, app FROM con.schema_migrations WHERE version = 1",
  );
  const latest = await db.query(
    "SELECT max(version)::integer AS version FROM con.schema_migrations",
  );
  return {
    connected: true,
    initialized: marker.rows[0]?.app === "cult-of-nix0n",
    schema_version: latest.rows[0].version,
    needs_upgrade: latest.rows[0].version < 4,
  };
}
export async function initializeDatabase(db = database()) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('con-admin-schema-v1'))",
    );
    const marker = await client.query(
      "SELECT to_regclass('con.schema_migrations')::text AS marker",
    );
    if (marker.rows[0].marker) {
      const existing = await client.query(
        "SELECT app FROM con.schema_migrations WHERE version = 1",
      );
      if (existing.rows[0]?.app !== "cult-of-nix0n")
        throw Object.assign(
          new Error(
            "Existing con schema is not owned by this application. No changes made.",
          ),
          { status: 409 },
        );
    } else {
      const existing = await client.query(
        "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'con' UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'con' LIMIT 1",
      );
      if (existing.rowCount)
        throw Object.assign(
          new Error(
            "The con schema already contains unrelated objects. No changes made.",
          ),
          { status: 409 },
        );
      await client.query(migration);
    }
    const current = await client.query(
      "SELECT 1 FROM con.schema_migrations WHERE version=2",
    );
    if (!current.rowCount) await client.query(staffMigration);
    const approval = await client.query(
      "SELECT 1 FROM con.schema_migrations WHERE version=3",
    );
    if (!approval.rowCount) await client.query(approvalMigration);
    const projects = await client.query(
      "SELECT 1 FROM con.schema_migrations WHERE version=4",
    );
    if (!projects.rowCount) await client.query(projectMigration);
    await client.query("COMMIT");
    return {
      connected: true,
      initialized: true,
      schema_version: 4,
      needs_upgrade: false,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
