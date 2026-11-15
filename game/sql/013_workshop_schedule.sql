-- Schedule the independent Workshop publisher once per minute.
-- Re-running by name updates the existing pg_cron job.
select cron.schedule('con-workshop-daily-objectives','* * * * *','select con.workshop_fallback_tick()');
