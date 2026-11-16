-- The Discord worker is limited to SELECT on con.bot_public_profiles
-- and EXECUTE on four narrowly scoped, audited Workshop functions.
-- It must allow writable transactions for claim row locks, warehouse
-- inventory reservations, and salary settlement inside those functions.
-- This does not grant any direct INSERT/UPDATE/DELETE rights on tables.
ALTER ROLE con_bot_profile_reader SET default_transaction_read_only = off;
