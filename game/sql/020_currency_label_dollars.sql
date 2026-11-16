-- Currency display-only migration. All ledger column names, balances,
-- transaction references and arithmetic remain unchanged.
DO $currency$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('con.workshop_fallback_tick()'::regprocedure) INTO definition;
 IF position('Compound Credits' in definition)>0 THEN
  EXECUTE replace(definition,'Compound Credits','Compound Dollars');
 END IF;
END $currency$;
-- The unit field is documentation only, not a conversion.
DO $currency$
DECLARE signature text;definition text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'con.bot_workshop_wallet(text)',
  'con.bot_workshop_treasury()'
 ] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
  IF position('Compound Credits' in definition)>0 THEN
   EXECUTE replace(definition,'Compound Credits','Compound Dollars');
  END IF;
 END LOOP;
END $currency$;
