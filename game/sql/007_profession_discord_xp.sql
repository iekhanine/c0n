begin;
create table if not exists con.game_skill_events (
 source_key text primary key,
 discord_id text not null,
 character_id uuid not null references con.game_characters(id) on delete cascade,
 profession_id text not null references con.game_professions(id),
 event_type text not null check(event_type in ('message','reaction','training','work')),
 xp integer not null check(xp between 0 and 5000),
 occurred_at timestamptz not null,
 recorded_at timestamptz not null default now()
);
create index if not exists game_skill_events_user_day on con.game_skill_events(character_id,profession_id,occurred_at desc);
alter table con.game_skill_events enable row level security;
revoke all on con.game_skill_events from public,anon,authenticated;
insert into con.game_settings(key,value) values ('participation',
 '{"message_profession_xp":2,"reaction_profession_xp":1,"daily_cap":20,"message_min_seconds":60}'::jsonb)
on conflict(key) do nothing;
create or replace function con.game_record_profession_activity()
returns trigger
language plpgsql
security invoker
set search_path=con,pg_temp
as $$
declare
 v_character uuid;
 v_profession text;
 v_settings jsonb;
 v_xp int;
 v_cap int;
 v_today int;
 v_gap int;
 v_last timestamptz;
 v_added text;
 v_key text;
begin
 -- Do not replay imported events or award non-member activity.
 if new.occurred_at < now()-interval '5 minutes'
 or new.occurred_at > now()+interval '2 minutes' then return new; end if;
 if new.event_type not in ('message','reaction') then return new; end if;
 if not exists(select 1 from con.discord_settings where guild_id=new.guild_id) then return new; end if;
 select c.id,c.profession_id into v_character,v_profession
 from con.game_characters c
 join con.game_professions p on p.id=c.profession_id
 where c.discord_id=new.user_id and p.channel_id=new.channel_id and p.active=true;
 if v_character is null then return new; end if;
 perform pg_advisory_xact_lock(hashtext(v_character::text||':'||v_profession));
 select value into v_settings from con.game_settings where key='participation';
 v_xp:=case when new.event_type='message'
 then greatest(0,least(20,coalesce((v_settings->>'message_profession_xp')::int,2)))
 else greatest(0,least(20,coalesce((v_settings->>'reaction_profession_xp')::int,1))) end;
 v_cap:=greatest(0,least(200,coalesce((v_settings->>'daily_cap')::int,20)));
 v_gap:=greatest(0,least(3600,coalesce((v_settings->>'message_min_seconds')::int,60)));
 select coalesce(sum(xp),0) into v_today from con.game_skill_events
 where character_id=v_character and profession_id=v_profession
 and event_type in ('message','reaction')
 and occurred_at>=date_trunc('day',new.occurred_at at time zone 'UTC') at time zone 'UTC'
 and occurred_at<(date_trunc('day',new.occurred_at at time zone 'UTC')+interval '1 day') at time zone 'UTC';
 if v_today>=v_cap then return new; end if;
 if new.event_type='message' then
  select max(occurred_at) into v_last from con.game_skill_events
  where character_id=v_character and profession_id=v_profession and event_type='message';
  if v_last is not null and new.occurred_at-v_last < make_interval(secs=>v_gap) then return new; end if;
 end if;
 v_xp:=least(v_xp,v_cap-v_today);
 if v_xp<=0 then return new; end if;
 v_key:='discord:'||new.guild_id||':'||new.event_type||':'||new.event_id||':'||new.user_id;
 insert into con.game_skill_events(source_key,discord_id,character_id,profession_id,event_type,xp,occurred_at)
 values(v_key,new.user_id,v_character,v_profession,new.event_type,v_xp,new.occurred_at)
 on conflict(source_key) do nothing returning source_key into v_added;
 if v_added is not null then
  insert into con.game_character_skills(character_id,profession_id,xp) values(v_character,v_profession,v_xp)
  on conflict(character_id,profession_id) do update set xp=con.game_character_skills.xp+excluded.xp;
 end if;
 return new;
exception when others then
 raise warning 'Game profession XP event not awarded: %',SQLSTATE;
 return new;
end $$;
drop trigger if exists game_profession_activity on con.discord_participation_events;
create trigger game_profession_activity
after insert on con.discord_participation_events
for each row execute function con.game_record_profession_activity();
commit;