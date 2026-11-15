BEGIN;
ALTER TABLE con.workshop_job_posts
 ADD COLUMN IF NOT EXISTS salary_credits integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS job_location text NOT NULL DEFAULT 'The Compound',
 ADD COLUMN IF NOT EXISTS required_supplies jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS assigned_discord_id text,
 ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
CREATE TABLE IF NOT EXISTS con.workshop_assignments (
 post_id uuid PRIMARY KEY REFERENCES con.workshop_job_posts(id),
 discord_id text NOT NULL CHECK(discord_id ~ '^[0-9]{17,20}$'),
 state text NOT NULL DEFAULT 'working' CHECK(state IN ('working','awaiting_confirmation','completed','cancelled')),
 started_at timestamptz NOT NULL DEFAULT now(),
 due_at timestamptz NOT NULL,
 reminded_at timestamptz,
 reminder_message_id text,
 issued_items jsonb NOT NULL DEFAULT '{}'::jsonb,
 salary_credits integer NOT NULL CHECK(salary_credits BETWEEN 0 AND 10000),
 xp_reward integer NOT NULL CHECK(xp_reward BETWEEN 0 AND 1000),
 completed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workshop_assignments_due ON con.workshop_assignments(state,due_at);
CREATE UNIQUE INDEX IF NOT EXISTS workshop_one_active_shift_per_resident
 ON con.workshop_assignments(discord_id) WHERE state IN ('working','awaiting_confirmation');
CREATE TABLE IF NOT EXISTS con.workshop_wallets (
 discord_id text PRIMARY KEY CHECK(discord_id ~ '^[0-9]{17,20}$'),
 balance bigint NOT NULL DEFAULT 0 CHECK(balance>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS con.workshop_salary_receipts (
 post_id uuid PRIMARY KEY REFERENCES con.workshop_assignments(post_id),
 discord_id text NOT NULL,
 credits integer NOT NULL,
 transaction_id uuid NOT NULL UNIQUE REFERENCES con.game_transactions(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE v text;BEGIN
 FOREACH v IN ARRAY ARRAY['workshop_assignments','workshop_wallets','workshop_salary_receipts'] LOOP
  EXECUTE format('ALTER TABLE con.%I ENABLE ROW LEVEL SECURITY',v);
  EXECUTE format('REVOKE ALL ON con.%I FROM PUBLIC,anon,authenticated',v);
 END LOOP;
END $$;
-- Remove the previous participation-only payout. Two generic messages must
-- never auto-complete a job once jobs become exclusive.
DROP TRIGGER IF EXISTS workshop_daily_activity ON con.discord_participation_events;
-- The shared fictional warehouse was empty, so provision a small initial
-- inventory, without overwriting or adjusting any preexisting stock.
INSERT INTO con.game_inventory(storage_id,item_id,quantity)
SELECT s.id,i.item_id,i.quantity
FROM con.game_storage s
CROSS JOIN (VALUES ('toolkit',24::bigint),('lumber',160),('scrap',180),
 ('medical_supplies',120),('seeds',100),('electrical_parts',110),
 ('food',120),('steel_bracket',80)) i(item_id,quantity)
WHERE s.storage_type='warehouse'
ON CONFLICT(storage_id,item_id) DO NOTHING;
COMMIT;