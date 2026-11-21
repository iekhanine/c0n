-- Campfire Questions: owner-controlled cadence, with 1,000-question progress retained.
ALTER TABLE con.thirty_plus_state ADD COLUMN IF NOT EXISTS interval_minutes integer NOT NULL DEFAULT 30;
ALTER TABLE con.thirty_plus_state DROP CONSTRAINT IF EXISTS thirty_plus_state_interval_minutes_check;
ALTER TABLE con.thirty_plus_state ADD CONSTRAINT thirty_plus_state_interval_minutes_check CHECK (interval_minutes BETWEEN 5 AND 1440);

CREATE OR REPLACE FUNCTION con.bot_thirty_plus_ack(guild text, seq bigint, token uuid, message text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,con AS $fn$
DECLARE s con.thirty_plus_state%rowtype;
BEGIN
 IF message !~ '^[0-9]{17,20}$' THEN RETURN false; END IF;
 SELECT * INTO s FROM con.thirty_plus_state WHERE id=true AND guild_id=guild FOR UPDATE;
 IF NOT FOUND OR s.next_seq<>seq OR s.lease_token IS DISTINCT FROM token THEN RETURN false; END IF;
 UPDATE con.thirty_plus_state SET active_seq=seq,active_question=(seq%1000)::integer+1,
 active_message_id=message,active_posted_at=now(),next_seq=seq+1,
 next_at=now()+make_interval(mins=>s.interval_minutes),lease_token=null,lease_until=null,updated_at=now()
 WHERE id=true;
 RETURN true;
END $fn$;

CREATE OR REPLACE FUNCTION con.bot_thirty_plus_set_interval(guild text, minutes integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,con AS $fn$
DECLARE s con.thirty_plus_state%rowtype;
BEGIN
 IF guild !~ '^[0-9]{17,20}$' OR minutes NOT BETWEEN 5 AND 1440 THEN RETURN false; END IF;
 SELECT * INTO s FROM con.thirty_plus_state WHERE id=true AND guild_id=guild FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE con.thirty_plus_state
 SET interval_minutes=minutes,
 next_at=CASE WHEN s.active_posted_at IS NULL THEN now()+make_interval(mins=>minutes)
              ELSE greatest(now(),s.active_posted_at+make_interval(mins=>minutes)) END,
 updated_at=now()
 WHERE id=true;
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION con.bot_thirty_plus_set_interval(text,integer) FROM PUBLIC,anon,authenticated;
DO $grant$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='con_bot_profile_reader') THEN
  GRANT EXECUTE ON FUNCTION con.bot_thirty_plus_set_interval(text,integer) TO con_bot_profile_reader;
 END IF;
END $grant$;