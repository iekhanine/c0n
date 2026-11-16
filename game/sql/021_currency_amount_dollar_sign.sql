-- Presentation change only. Do not modify stored balances, ledger schemas,
-- salaries, or payroll arithmetic.
DO $money$
DECLARE f text;
BEGIN
 SELECT pg_get_functiondef('con.workshop_fallback_tick()'::regprocedure) INTO f;
 IF position('Compound Dollars' in f)>0 THEN
   f:=replace(f, 'Salary: ''||', 'Salary: $''||');
   f:=replace(f, ' Compound Dollars · +', ' · +');
   EXECUTE f;
 END IF;
END $money$;
