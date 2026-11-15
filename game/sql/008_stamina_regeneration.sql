begin;
alter table con.game_characters add column if not exists stamina_updated_at timestamptz not null default now();
insert into con.game_settings(key,value) values('stamina','{"regeneration_per_hour":12,"maximum":100}'::jsonb) on conflict(key) do nothing;
commit;