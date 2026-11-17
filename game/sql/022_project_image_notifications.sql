-- C0N Compound: owner-only construction visualization reminders.
-- Events are queued transactionally with the existing project.complete audit event.
create table if not exists con.project_image_notifications (
 project_id uuid primary key references con.game_projects(id),
 overseer_discord_id text not null check (overseer_discord_id ~ '^[0-9]{17,20}$'),
 payload jsonb not null,
 status text not null default 'pending' check (status in ('pending','leased','sent')),
 lease_token uuid,
 lease_until timestamptz,
 attempts integer not null default 0 check (attempts >= 0),
 dm_message_id text,
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists project_image_notifications_pending_idx
 on con.project_image_notifications(status,lease_until,created_at)
 where status<>'sent';
revoke all on con.project_image_notifications from public, anon, authenticated;
do $migration$
begin
 if exists(select 1 from pg_roles where rolname='con_bot_profile_reader') then
  execute 'revoke all on con.project_image_notifications from con_bot_profile_reader';
 end if;
end $migration$;

create table if not exists con.project_image_preferences (
 singleton boolean primary key default true check (singleton),
 overseer_discord_id text not null check (overseer_discord_id ~ '^[0-9]{17,20}$'),
 style_notes text not null default 'Gritty, grounded post-collapse industrial photography: repaired scrap vehicles, welded oxidized metal, improvised electrical panels, weathered bunker doors, atmospheric underground workshops, lived-in survivor settlements. Functional and practical, not glossy sci-fi or cartoonish. Match the real photographic references chosen by the Overseer.'
);
revoke all on con.project_image_preferences from public, anon, authenticated;
insert into con.project_image_preferences(singleton,overseer_discord_id)
values(true,'267489014922215434')
on conflict(singleton) do nothing;

create or replace function con.enqueue_project_image_notification()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,con
as $fn$
declare
 p con.game_projects%rowtype;
 pref record;
 next_title text;
 location_name text;
 authors jsonb;
begin
 if new.action <> 'project.complete' or new.entity <> 'project' then return new; end if;
 select * into p from con.game_projects where id::text=new.entity_id and state='complete';
 if not found then return new; end if;
 select overseer_discord_id,style_notes into pref from con.project_image_preferences where singleton=true;
 if not found then return new; end if;
 select title into next_title from con.game_projects
  where id=(new.after_state->>'next_phase')::uuid;
 select name into location_name from con.game_locations where id=p.location_id;
 select coalesce(jsonb_agg(distinct actor), '[]'::jsonb) into authors
   from con.game_audit
   where action='project.contribute' and entity_id=p.id::text;
 insert into con.project_image_notifications(project_id,overseer_discord_id,payload)
 values(p.id,pref.overseer_discord_id,
  jsonb_build_object(
   'project_id',p.id,
   'title',p.title,
   'phase',p.phase,
   'location',coalesce(location_name,p.location_id),
   'required_materials',coalesce(p.requirements,'{}'::jsonb),
   'delivered_materials',coalesce(p.progress,'{}'::jsonb),
   'contributors',authors,
   'unlocked_location',coalesce(location_name,p.location_id),
   'next_project',coalesce(next_title,'Underground access and new restoration opportunities'),
   'style_notes',pref.style_notes
  ));
 return new;
end
$fn$;
revoke all on function con.enqueue_project_image_notification() from public, anon, authenticated;
drop trigger if exists queue_project_image_on_completion on con.game_audit;
create trigger queue_project_image_on_completion
 after insert on con.game_audit
 for each row when (new.action='project.complete' and new.entity='project')
 execute function con.enqueue_project_image_notification();

create or replace function con.bot_project_image_claim()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,con
as $fn$
declare job record;
 token uuid;
begin
 select * into job
 from con.project_image_notifications
 where (status='pending' or (status='leased' and lease_until<now()))
   and attempts<12
 order by created_at,project_id
 limit 1 for update skip locked;
 if not found then return null; end if;
 token:=gen_random_uuid();
 update con.project_image_notifications
 set status='leased',lease_token=token,lease_until=now()+interval '3 minutes',
     attempts=attempts+1,updated_at=now()
 where project_id=job.project_id;
 return jsonb_build_object(
  'project_id',job.project_id,
  'lease_token',token,
  'overseer_discord_id',job.overseer_discord_id,
  'payload',job.payload,
  'attempts',job.attempts+1
 );
end
$fn$;

create or replace function con.bot_project_image_ack(
 project uuid, token uuid, message_id text
) returns boolean
language plpgsql
security definer
set search_path=pg_catalog,con
as $fn$
begin
 if message_id is null or message_id !~ '^[0-9]{17,20}$' then
  raise exception 'Invalid Discord message id';
 end if;
 update con.project_image_notifications
 set status='sent',dm_message_id=message_id,sent_at=now(),
     lease_token=null,lease_until=null,updated_at=now()
 where project_id=project and lease_token=token and status='leased';
 return found;
end
$fn$;

revoke all on function con.bot_project_image_claim() from public, anon, authenticated;
revoke all on function con.bot_project_image_ack(uuid,uuid,text) from public, anon, authenticated;
do $permissions$
begin
 if exists(select 1 from pg_roles where rolname='con_bot_profile_reader') then
  execute 'grant execute on function con.bot_project_image_claim() to con_bot_profile_reader';
  execute 'grant execute on function con.bot_project_image_ack(uuid,uuid,text) to con_bot_profile_reader';
 end if;
end $permissions$;
