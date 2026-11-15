-- Applied to ONETIMELABS production database in migration:
-- con_bot_profile_public_read_view
-- con_bot_profile_reader_restricted_permissions
-- This file documents the exact live schema. Role password is NOT stored in Git.
CREATE OR REPLACE VIEW con.bot_public_profiles AS
SELECT
  p.discord_id, p.display_name,
  dm.avatar,
  COALESCE(r.apartment_id, 'The Unhoused') AS apartment,
  m.member_no,
  COALESCE(NULLIF(m.codename,''),NULLIF(m.display_name,''),p.display_name) AS codename,
  m.joined_at AS member_joined_at,
  p.xp,
  1 + floor(p.xp/250.0)::integer AS level,
  p.health,p.stamina,p.skill,p.charisma,p.intellect,p.luck
FROM con.compound_profiles p
LEFT JOIN con.compound_residency r ON r.discord_id=p.discord_id
LEFT JOIN con.memberships m ON m.user_id=p.discord_id AND m.active=true
LEFT JOIN LATERAL (
  SELECT d.avatar FROM con.discord_members d
  WHERE d.discord_id=p.discord_id AND d.active=true AND d.is_bot=false
  ORDER BY d.joined_at DESC NULLS LAST LIMIT 1
) dm ON true;
REVOKE ALL ON con.bot_public_profiles FROM PUBLIC,anon,authenticated;

DO $role$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='con_bot_profile_reader') THEN
   CREATE ROLE con_bot_profile_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
 END IF;
END $role$;
GRANT CONNECT ON DATABASE postgres TO con_bot_profile_reader;
GRANT USAGE ON SCHEMA con TO con_bot_profile_reader;
GRANT SELECT ON con.bot_public_profiles TO con_bot_profile_reader;
ALTER ROLE con_bot_profile_reader SET default_transaction_read_only = on;
ALTER ROLE con_bot_profile_reader SET statement_timeout = '8s';
REVOKE CREATE ON SCHEMA con FROM con_bot_profile_reader;
-- Generate a random password securely and enable LOGIN outside migration
-- via the connected Supabase client. Store ONLY in Railway service secrets.
