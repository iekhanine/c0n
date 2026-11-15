begin;
create unique index if not exists game_one_active_salary on con.game_employment(character_id) where active=true and compensation_type='salary';
alter table con.game_employment add column if not exists created_at timestamptz not null default now();
alter table con.game_employment add column if not exists appointed_by text;
alter table con.game_payroll add column if not exists work_units integer not null default 0;
insert into con.game_settings(key,value) values
('payroll','{"frequency":"weekly","minimum_active_tasks":1,"auto_pay":false}'::jsonb)
on conflict(key) do nothing;
commit;