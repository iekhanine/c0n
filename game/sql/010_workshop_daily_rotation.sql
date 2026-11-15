begin;
create table if not exists con.workshop_job_rotations (
 channel_id text primary key check(channel_id ~ '^[0-9]{17,20}$'),
 label text not null,
 profession_id text references con.game_professions(id),
 objectives jsonb not null check(jsonb_typeof(objectives)='array' and jsonb_array_length(objectives)>=2),
 xp_reward integer not null check(xp_reward between 1 and 100),
 attribute text not null check(attribute in ('skill','charisma','intellect','luck')),
 attribute_reward integer not null default 1 check(attribute_reward between 0 and 5),
 min_minutes integer not null default 10 check(min_minutes between 5 and 120),
 stagger_minutes integer not null check(stagger_minutes between 0 and 1380),
 launch_at timestamptz not null default now(),
 next_at timestamptz not null default now(),
 cycle integer not null default 0 check(cycle>=0),
 active boolean not null default true,
 last_post_id uuid,
 last_message_id text,
 updated_at timestamptz not null default now()
);
create table if not exists con.workshop_job_posts (
 id uuid primary key default gen_random_uuid(),
 channel_id text not null references con.workshop_job_rotations(channel_id),
 cycle integer not null,
 title text not null,
 objective text not null,
 xp_reward integer not null check(xp_reward between 1 and 100),
 attribute text not null,
 attribute_reward integer not null,
 min_minutes integer not null,
 state text not null default 'posting' check(state in ('posting','posted','expired')),
 message_id text,
 created_at timestamptz not null default now(),
 posted_at timestamptz,
 unique(channel_id,cycle)
);
create index if not exists workshop_post_pending on con.workshop_job_posts(state,created_at);
create table if not exists con.workshop_job_claims(
 post_id uuid not null references con.workshop_job_posts(id),
 discord_id text not null check(discord_id ~ '^[0-9]{17,20}$'),
 started_at timestamptz not null default now(),
 completed_at timestamptz,
 evidence text,
 primary key(post_id,discord_id)
);
create index if not exists workshop_claim_user on con.workshop_job_claims(discord_id,started_at desc);
do $$ declare v text; begin
 foreach v in array array['workshop_job_rotations','workshop_job_posts','workshop_job_claims'] loop
  execute format('alter table con.%I enable row level security',v);
  execute format('revoke all on con.%I from public,anon,authenticated',v);
 end loop;
end $$;
commit;