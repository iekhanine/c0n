-- Standalone fresh-install migration. Prefer the idempotent admin initializer.
-- Refuses an existing con schema with objects; never alters another application schema.
BEGIN;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='con')
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='con') THEN
  RAISE EXCEPTION 'con already contains objects. Use the application initializer; no changes made.';
 END IF;
END $$;

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

COMMIT;
