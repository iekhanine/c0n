begin;
-- RPG additions: staff DM permissions, craft recipes, campaign encounters, and auditable world events.
create table if not exists con.game_dungeon_masters (
 discord_id text primary key check(discord_id ~ '^[0-9]{17,20}$'),
 enabled boolean not null default true,
 granted_by text not null, granted_at timestamptz not null default now()
);
create table if not exists con.game_campaign_members (
 campaign_id uuid not null references con.game_campaigns(id) on delete cascade,
 character_id uuid not null references con.game_characters(id) on delete cascade,
 status text not null default 'joined' check(status in ('invited','joined','left','removed')),
 joined_at timestamptz not null default now(),primary key(campaign_id,character_id)
);
create table if not exists con.game_encounters (
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null references con.game_campaigns(id) on delete cascade,
 title text not null,description text not null default '',
 attribute text check(attribute in ('strength','intelligence','charisma','agility','endurance','perception')),
 difficulty integer not null default 10 check(difficulty between 1 and 35),
 state text not null default 'draft' check(state in ('draft','active','resolved','archived')),
 outcome jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists con.game_recipes (
 id uuid primary key default gen_random_uuid(),title text not null,profession_id text references con.game_professions(id),
 skill_xp_required bigint not null default 0 check(skill_xp_required>=0),
 ingredients jsonb not null default '{}'::jsonb,products jsonb not null default '{}'::jsonb,
 duration_minutes integer not null default 0 check(duration_minutes between 0 and 10080),
 xp integer not null default 0 check(xp between 0 and 100000),
 status text not null default 'draft' check(status in ('draft','published','paused','retired')),
 created_at timestamptz not null default now()
);
create table if not exists con.game_crafting_orders (
 id uuid primary key default gen_random_uuid(),recipe_id uuid not null references con.game_recipes(id),
 character_id uuid not null references con.game_characters(id),
 storage_id uuid not null references con.game_storage(id),
 state text not null default 'in_progress' check(state in ('in_progress','completed','cancelled')),
 started_at timestamptz not null default now(), ready_at timestamptz not null, finished_at timestamptz
);
create table if not exists con.game_storage_events (
 id uuid primary key default gen_random_uuid(), actor_discord_id text not null,
 source_storage uuid references con.game_storage(id),
 destination_storage uuid references con.game_storage(id),
 item_id text not null references con.game_items(id), quantity bigint not null check(quantity>0),
 purpose text not null, created_at timestamptz not null default now()
);
create table if not exists con.game_world_events (
 id uuid primary key default gen_random_uuid(),title text not null,description text not null default '',
 event_type text not null check(event_type in ('discovery','infrastructure','hazard','story','construction')),
 location_id text references con.game_locations(id),
 state text not null default 'draft' check(state in ('draft','published','resolved','cancelled')),
 created_by text not null,created_at timestamptz not null default now(),
 published_at timestamptz, effects jsonb not null default '{}'::jsonb
);
alter table con.game_campaigns add column if not exists story_data jsonb not null default '{}'::jsonb;
alter table con.game_campaigns add column if not exists updated_at timestamptz not null default now();
alter table con.game_work_orders add column if not exists moderator_note text not null default '';
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='con' and tablename in
 ('game_dungeon_masters','game_campaign_members','game_encounters','game_recipes','game_crafting_orders','game_storage_events','game_world_events') loop
  execute format('alter table con.%I enable row level security',t.tablename);
  execute format('revoke all on con.%I from public,anon,authenticated',t.tablename);
 end loop;
end $$;
commit;