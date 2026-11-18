-- Expand persistent conversation rotation from 50 to 1,000 without losing sequence or awards.
ALTER TABLE con.thirty_plus_state DROP CONSTRAINT IF EXISTS thirty_plus_state_active_question_check;
ALTER TABLE con.thirty_plus_state ADD CONSTRAINT thirty_plus_state_active_question_check CHECK (active_question between 1 and 1000);
ALTER TABLE con.thirty_plus_answers DROP CONSTRAINT IF EXISTS thirty_plus_answers_question_index_check;
ALTER TABLE con.thirty_plus_answers ADD CONSTRAINT thirty_plus_answers_question_index_check CHECK (question_index between 1 and 1000);

DO $update_rotation$
DECLARE name text; definition text;
BEGIN
 FOREACH name IN ARRAY ARRAY['bot_thirty_plus_claim','bot_thirty_plus_ack'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='con' AND p.proname=name;
  IF definition IS NULL OR position('%50' IN definition)=0 THEN
   RAISE EXCEPTION 'Expected original 50-question rotation in %',name;
  END IF;
  EXECUTE replace(definition,'%50','%1000');
 END LOOP;
END $update_rotation$;
