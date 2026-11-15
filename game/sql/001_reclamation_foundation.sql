-- C0N / Project Reclamation. Run only against the confirmed C0N database.
-- Private schema: server-side bot/API only. Never expose service credentials to browsers.
begin;
-- pgcrypto available on this Supabase instance; gen_random_uuid() is built-in in PG17.

create table if not exists con.game_settings (
 key text primary key, value jsonb not null, updated_at timestamptz not null default now()
);
create table if not exists con.game_professions (
 id text primary key, title text not null, channel_id text, active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists con.game_characters (
 id uuid primary key default gen_random_uuid(),
 discord_id text not null unique check (discord_id ~ '^[0-9]{17,20}$'),
 name text not null check (length(trim(name)) between 2 and 50),
 profession_id text not null references con.game_professions(id),
 level integer not null default 1 check (level >= 1),
 xp bigint not null default 0 check(xp>=0),
 health integer not null default 100 check(health between 0 and 100),
 stamina integer not null default 100 check(stamina between 0 and 100),
 state text not null default 'surface' check(state in ('surface','underground','inactive')),
 created_at timestamptz not null default now()
);
create table if not exists con.game_character_attributes (
 character_id uuid not null references con.game_characters(id) on delete cascade,
 attribute text not null check(attribute in ('strength','intelligence','charisma','agility','endurance','perception')),
 score smallint not null check(score between 5 and 20),
 training_xp bigint not null default 0 check(training_xp >= 0),
 primary key(character_id,attribute)
);
create table if not exists con.game_character_skills (
 character_id uuid not null references con.game_characters(id) on delete cascade,
 profession_id text not null references con.game_professions(id),
 xp bigint not null default 0 check(xp >= 0),
 primary key(character_id,profession_id)
);
create table if not exists con.game_locations (
 id text primary key, name text not null, parent_id text references con.game_locations(id),
 state text not null check(state in ('unknown','sealed','damaged','accessible','operational')),
 description text not null default '', metadata jsonb not null default '{}'::jsonb
);
create table if not exists con.game_apartments (
 id uuid primary key default gen_random_uuid(), location_id text references con.game_locations(id),
 label text not null unique, capacity integer not null default 1 check(capacity > 0),
 state text not null default 'available' check(state in ('available','occupied','damaged','sealed'))
);
create table if not exists con.game_residencies (
 id uuid primary key default gen_random_uuid(), character_id uuid not null references con.game_characters(id),
 apartment_id uuid not null references con.game_apartments(id),
 status text not null check(status in ('active','pending','ended')),
 moved_in_at timestamptz not null default now(), moved_out_at timestamptz
);
create unique index if not exists game_one_active_residence on con.game_residencies(character_id) where status='active';
create table if not exists con.game_storage (
 id uuid primary key default gen_random_uuid(),
 storage_type text not null check(storage_type in ('carry','apartment','warehouse')),
 owner_character_id uuid references con.game_characters(id),
 apartment_id uuid references con.game_apartments(id),
 capacity integer not null default 100 check(capacity > 0),
 check((storage_type='carry' and owner_character_id is not null and apartment_id is null)
 or (storage_type='apartment' and apartment_id is not null)
 or (storage_type='warehouse' and owner_character_id is null and apartment_id is null))
);
create unique index if not exists game_one_carry on con.game_storage(owner_character_id) where storage_type='carry';
create unique index if not exists game_one_apartment_storage on con.game_storage(apartment_id) where storage_type='apartment';
create unique index if not exists game_one_warehouse on con.game_storage(storage_type) where storage_type='warehouse';
create table if not exists con.game_items (
 id text primary key, name text not null, category text not null,
 stackable boolean not null default true, metadata jsonb not null default '{}'::jsonb
);
create table if not exists con.game_inventory (
 storage_id uuid not null references con.game_storage(id), item_id text not null references con.game_items(id),
 quantity bigint not null check(quantity >= 0), primary key(storage_id,item_id)
);
create table if not exists con.game_projects (
 id uuid primary key default gen_random_uuid(), location_id text references con.game_locations(id),
 title text not null, phase integer not null default 1, state text not null default 'locked'
 check(state in ('locked','active','complete','paused')),
 requirements jsonb not null default '{}'::jsonb,
 progress jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table if not exists con.game_task_templates (
 id uuid primary key default gen_random_uuid(), title text not null,
 profession_id text references con.game_professions(id), project_id uuid references con.game_projects(id),
 description text not null default '', completion_type text not null default 'timer'
 check(completion_type in ('timer','quiz','dice','collaborative','dm_approval')),
 duration_minutes integer not null default 10 check(duration_minutes between 0 and 10080),
 character_xp integer not null default 0 check(character_xp between 0 and 100000),
 profession_xp integer not null default 0 check(profession_xp between 0 and 100000),
 pay_credits bigint not null default 0 check(pay_credits between 0 and 1000000000),
 stamina_cost integer not null default 0 check(stamina_cost between 0 and 100),
 materials jsonb not null default '{}'::jsonb,
 rewards jsonb not null default '{}'::jsonb,
 prerequisites jsonb not null default '{}'::jsonb,
 cooldown_minutes integer not null default 0 check(cooldown_minutes >= 0),
 daily_limit integer check(daily_limit >= 1),
 status text not null default 'draft' check(status in ('draft','published','paused','retired')),
 version integer not null default 1, updated_at timestamptz not null default now()
);
create table if not exists con.game_work_orders (
 id uuid primary key default gen_random_uuid(), template_id uuid not null references con.game_task_templates(id),
 character_id uuid not null references con.game_characters(id),
 template_snapshot jsonb not null,
 status text not null default 'accepted' check(status in ('accepted','in_progress','pending_approval','completed','failed','cancelled')),
 accepted_at timestamptz not null default now(), due_at timestamptz,
 completed_at timestamptz, approved_by text,
 idempotency_key text unique
);
create index if not exists game_work_orders_worker_idx on con.game_work_orders(character_id,status);
create table if not exists con.game_accounts (
 id uuid primary key default gen_random_uuid(),
 account_type text not null check(account_type in ('treasury','overseer','resident','system')),
 character_id uuid unique references con.game_characters(id),
 label text not null, balance bigint not null default 0 check(balance >= 0),
 check((account_type='resident')=(character_id is not null))
);
create unique index if not exists game_one_treasury on con.game_accounts(account_type) where account_type='treasury';
create table if not exists con.game_transactions (
 id uuid primary key default gen_random_uuid(), reason text not null,
 reference_key text unique not null, created_by text not null,
 created_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);
create table if not exists con.game_entries (
 transaction_id uuid not null references con.game_transactions(id), account_id uuid not null references con.game_accounts(id),
 amount bigint not null check(amount <> 0), primary key(transaction_id,account_id)
);
create table if not exists con.game_employment (
 id uuid primary key default gen_random_uuid(), character_id uuid not null references con.game_characters(id),
 profession_id text not null references con.game_professions(id),
 compensation_type text not null check(compensation_type in ('salary','contract')),
 salary_weekly bigint not null default 0 check(salary_weekly >= 0),
 required_units integer not null default 0 check(required_units >= 0),
 active boolean not null default true
);
create table if not exists con.game_payroll (
 id uuid primary key default gen_random_uuid(), employment_id uuid not null references con.game_employment(id),
 period_start date not null, period_end date not null,
 gross bigint not null check(gross>=0), tax bigint not null check(tax>=0 and tax<=gross),
 status text not null default 'pending' check(status in ('pending','paid','void')),
 transaction_id uuid unique references con.game_transactions(id), unique(employment_id,period_start,period_end)
);
create table if not exists con.game_campaigns (
 id uuid primary key default gen_random_uuid(), title text not null, synopsis text not null default '',
 dm_discord_id text not null, state text not null default 'draft'
 check(state in ('draft','active','paused','complete')), discord_channel_id text,
 created_at timestamptz not null default now()
);
create table if not exists con.game_sessions (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references con.game_campaigns(id),
 started_at timestamptz, ended_at timestamptz, narrative text not null default ''
);
create table if not exists con.game_session_players (
 session_id uuid references con.game_sessions(id), character_id uuid references con.game_characters(id),
 primary key(session_id,character_id)
);
create table if not exists con.game_dice_rolls (
 id uuid primary key default gen_random_uuid(), session_id uuid references con.game_sessions(id),
 character_id uuid references con.game_characters(id), die_sides integer not null check(die_sides in (4,6,8,10,12,20,100)),
 number_of_dice integer not null default 1 check(number_of_dice between 1 and 20),
 faces integer[] not null, modifier integer not null default 0, total integer not null,
 purpose text not null default '', rolled_at timestamptz not null default now()
);
create table if not exists con.game_dm_awards (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references con.game_sessions(id),
 character_id uuid not null references con.game_characters(id), xp integer not null default 0 check(xp >= 0),
 credits bigint not null default 0 check(credits >= 0),
 items jsonb not null default '{}'::jsonb,
 status text not null default 'pending' check(status in ('pending','approved','rejected','applied')),
 granted_by text not null, approved_by text, created_at timestamptz not null default now()
);
create table if not exists con.game_audit (
 id bigint generated always as identity primary key, actor text not null, action text not null,
 entity text not null, entity_id text, before_state jsonb, after_state jsonb,
 created_at timestamptz not null default now()
);
-- Tables are server-only by default, with RLS as an additional boundary.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='con' and tablename like 'game_%' loop
  execute format('alter table con.game_%I enable row level security',t.tablename);
  execute format('revoke all on con.game_%I from public,anon,authenticated',t.tablename);
 end loop;
end $$;
insert into con.game_settings(key,value) values
 ('rules', '{"starting_attribute":5,"allocation_points":20,"starting_max":10,"income_tax_percent":5,"sales_tax_percent":5,"paid_stat_points":false}'::jsonb),
 ('story', '{"title":"Project Reclamation","stage":"discovery","underground_open":false}'::jsonb)
on conflict(key) do nothing;
insert into con.game_professions(id,title) values
 ('carpenter','Carpenter'),('metalworker','Metalworker'),('medic','Medic'),('farmer','Farmer'),('engineer','Engineer'),('scavenger','Scavenger')
on conflict(id) do nothing;
insert into con.game_locations(id,name,state,description) values
 ('surface','Surface Settlement','accessible','Temporary starting settlement'),
 ('entrance','Main Bunker Entrance','damaged','Discovered sealed facility access'),
 ('level_one','Level One','sealed','First underground sector'),
 ('residential','Residential Wing','sealed','Future underground housing'),
 ('power','Power Plant','unknown','Electrical infrastructure'),
 ('lower_levels','Lower Levels','unknown','Uncharted depths')
on conflict(id) do nothing;
update con.game_locations set parent_id='entrance' where id='level_one' and parent_id is null;
update con.game_locations set parent_id='level_one' where id in ('residential','power') and parent_id is null;
insert into con.game_accounts(account_type,label,balance)
select 'treasury','Compound Treasury',37000000000
where not exists (select 1 from con.game_accounts where account_type='treasury');
insert into con.game_accounts(account_type,label,balance)
select 'overseer','Overseer Personal Wallet',0
where not exists (select 1 from con.game_accounts where account_type='overseer');
insert into con.game_accounts(account_type,label,balance)
select 'system','Currency Issuance / Retirements',0
where not exists (select 1 from con.game_accounts where account_type='system');
insert into con.game_storage(storage_type,capacity)
select 'warehouse',100000 where not exists(select 1 from con.game_storage where storage_type='warehouse');
commit;
