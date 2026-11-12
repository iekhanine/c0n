export const discordMigration = `
CREATE TABLE IF NOT EXISTS con.discord_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),guild_id text NOT NULL,channel_ids jsonb NOT NULL DEFAULT '[]',publish_members boolean NOT NULL DEFAULT true,key_cipher text,channels jsonb NOT NULL DEFAULT '[]',last_heartbeat timestamptz,member_count integer NOT NULL DEFAULT 0,bot_id text,bot_name text,snapshot_id text,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS con.discord_members(guild_id text NOT NULL,discord_id text NOT NULL,name text NOT NULL,avatar text,joined_at timestamptz,is_bot boolean NOT NULL DEFAULT false,active boolean NOT NULL DEFAULT true,snapshot_id text,PRIMARY KEY(guild_id,discord_id));
CREATE TABLE IF NOT EXISTS con.discord_events(guild_id text NOT NULL,event_id text NOT NULL,channel_id text NOT NULL,user_id text NOT NULL,occurred_at timestamptz NOT NULL,PRIMARY KEY(guild_id,event_id));
CREATE INDEX IF NOT EXISTS con_discord_event_time ON con.discord_events(guild_id,occurred_at);
CREATE TABLE IF NOT EXISTS con.discord_receipts(nonce text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE con.discord_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE con.discord_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE con.discord_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE con.discord_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON con.discord_settings,con.discord_members,con.discord_events,con.discord_receipts FROM PUBLIC,anon,authenticated;
`;
