-- Apply this only to the existing C0N PostgreSQL database, after verifying
-- that con.discord_settings and con.memberships belong to the same project.
-- This view intentionally exposes ONLY the fields shown on public character cards.
-- Run as the database owner. Never grant bot access to the underlying tables.
CREATE OR REPLACE VIEW con.bot_public_profiles AS
SELECT p.discord_id, p.display_name, dm.avatar,
       COALESCE(r.apartment_id, 'The Unhoused') AS apartment,
       m.member_no, m.codename, m.joined_at AS member_joined_at,
       p.xp, 1+floor(p.xp/250.0)::integer AS level,
       p.health, p.stamina, p.skill, p.charisma, p.intellect, p.luck
FROM con.compound_profiles AS p
JOIN con.discord_members AS dm
  ON dm.discord_id=p.discord_id AND dm.active=true AND dm.is_bot=false
JOIN con.discord_settings AS ds
  ON ds.id=true AND ds.guild_id=dm.guild_id
LEFT JOIN con.compound_residency AS r ON r.discord_id=p.discord_id
LEFT JOIN con.memberships AS m ON m.user_id=p.discord_id AND m.active=true;

REVOKE ALL ON con.bot_public_profiles FROM PUBLIC, anon, authenticated;
-- Provision with a generated, unique password in the database console.
-- CREATE ROLE con_bot_profile_reader WITH LOGIN PASSWORD '<GENERATED_SECRET>' NOINHERIT;
-- GRANT USAGE ON SCHEMA con TO con_bot_profile_reader;
-- GRANT SELECT ON con.bot_public_profiles TO con_bot_profile_reader;
-- REVOKE ALL ON ALL TABLES IN SCHEMA con FROM con_bot_profile_reader;
-- GRANT SELECT ON con.bot_public_profiles TO con_bot_profile_reader;
--
-- Verify after provisioning: SELECT has_table_privilege(
--   'con_bot_profile_reader','con.bot_public_profiles','SELECT');
-- Verify restricted: SELECT has_table_privilege(
--   'con_bot_profile_reader','con.compound_profiles','SELECT');
-- The first should be true; the second false.
--
-- IMPORTANT: a regular PostgreSQL view executes under the owner privileges
-- and can read RLS-protected source tables; keep its fields restricted.
-- Database role must not own this view or any underlying table.
