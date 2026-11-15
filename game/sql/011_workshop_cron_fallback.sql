begin;
alter table con.workshop_job_posts add column if not exists fallback_command_id uuid;
alter table con.workshop_job_posts add column if not exists fallback_pin_command_id uuid;
-- Disabled rows are handled by the database scheduler until the signed game API is deployed.
update con.workshop_job_rotations set active=false where active=true;

create or replace function con.workshop_fallback_tick()
returns void language plpgsql security invoker set search_path=con,pg_temp as $$
declare p record; r record; v_new uuid; v_command uuid; v_old text; v_body text; v_next timestamptz; v_guild text;
begin
 select guild_id into v_guild from con.discord_settings where id=true;
 if v_guild is null then return; end if;
 perform pg_advisory_xact_lock(hashtext('workshop-fallback-tick'));
 -- Finalize successful sends, record posted message IDs and pin new objectives.
 for p in
  select x.*,c.state as command_state,c.result as command_result
  from con.workshop_job_posts x join con.discord_commands c on c.id=x.fallback_command_id
  where x.state='posting' and x.fallback_command_id is not null
  order by x.created_at
 loop
  if p.command_state='succeeded' and p.command_result->>'id' ~ '^[0-9]{17,20}$' then
   select * into r from con.workshop_job_rotations where channel_id=p.channel_id for update;
   if r.cycle<>p.cycle then continue; end if;
   v_old:=r.last_message_id;
   update con.workshop_job_posts set state='expired'
    where channel_id=p.channel_id and state='posted';
   update con.workshop_job_posts set state='posted',message_id=p.command_result->>'id',posted_at=now()
    where id=p.id;
   v_next:=case when r.cycle=0
     then r.launch_at+interval '24 hours'+make_interval(mins=>r.stagger_minutes)
     else r.next_at+interval '24 hours' end;
   -- Do not flood a backlog if the service was offline for several days.
   v_next:=greatest(v_next,now()+interval '1 minute');
   update con.workshop_job_rotations set cycle=cycle+1,next_at=v_next,last_post_id=p.id,
    last_message_id=p.command_result->>'id',updated_at=now() where channel_id=p.channel_id;
   v_command:=gen_random_uuid();
   insert into con.discord_commands(id,guild_id,actor_id,actor_name,operation,payload)
   values(v_command,v_guild,'267489014922215434','1van','messages.pin',
    jsonb_build_object('channel_id',p.channel_id,'message_id',p.command_result->>'id',
    'pinned',true,'reason','Pin current daily Workshop objective'));
   update con.workshop_job_posts set fallback_pin_command_id=v_command where id=p.id;
   if v_old is not null and v_old<>p.command_result->>'id' then
    insert into con.discord_commands(id,guild_id,actor_id,actor_name,operation,payload)
    values(gen_random_uuid(),v_guild,'267489014922215434','1van','messages.pin',
     jsonb_build_object('channel_id',p.channel_id,'message_id',v_old,
      'pinned',false,'reason','Unpin replaced daily Workshop objective'));
   end if;
  elsif p.command_state='failed' then
   raise warning 'Workshop webhook send failed for channel %: %',p.channel_id,
     (select error from con.discord_commands where id=p.fallback_command_id);
  end if;
 end loop;
 -- Queue one edition per due channel. The first eight are all due together.
 for r in select ro.* from con.workshop_job_rotations ro
   where not ro.active and ro.next_at<=now()
   and not exists(select 1 from con.workshop_job_posts existing
    where existing.channel_id=ro.channel_id and existing.cycle=ro.cycle)
   order by ro.stagger_minutes for update skip locked
 loop
  if not exists(select 1 from con.webhooks w where w.channel_id=r.channel_id and w.enabled) then
   raise warning 'Workshop channel % missing webhook',r.channel_id;
   continue;
  end if;
  v_new:=gen_random_uuid();
  insert into con.workshop_job_posts(id,channel_id,cycle,title,objective,xp_reward,attribute,attribute_reward,min_minutes,state)
  values(v_new,r.channel_id,r.cycle,r.label||' / Objective '||(r.cycle+1),
   r.objectives->>(r.cycle%jsonb_array_length(r.objectives)),r.xp_reward,r.attribute,r.attribute_reward,r.min_minutes,'posting');
  v_body:='📌 **THE WORKSHOP · DAILY OBJECTIVE**'||chr(10)||
    '**'||r.label||' / Objective '||(r.cycle+1)||'**'||chr(10)||
    (r.objectives->>(r.cycle%jsonb_array_length(r.objectives)))||chr(10)||chr(10)||
    '🏅 **Reward: +'||r.xp_reward||' XP · +'||r.attribute_reward||' '||upper(r.attribute)||'**'||chr(10)||
    '⏱️ **Shift: minimum '||r.min_minutes||' minutes**'||chr(10)||
    '**How to earn it:** Post a starting plan in this channel. After at least '||r.min_minutes||
    ' minutes, post a second update describing your completed work. Your one-time job bonus is credited automatically.'||chr(10)||
    'Regular Discord activity XP is also awarded. This objective stays active until replaced tomorrow.'||chr(10)||chr(10)||
    'Job reference: `workshop:'||v_new||'`';
  v_command:=gen_random_uuid();
  insert into con.discord_commands(id,guild_id,actor_id,actor_name,operation,payload)
  select v_command,v_guild,'267489014922215434','1van','webhooks.send',
   jsonb_build_object('id',w.discord_id,'content',v_body,
   'reason','Publish rotating daily Workshop objective')
   from con.webhooks w where w.channel_id=r.channel_id and w.enabled limit 1;
  update con.workshop_job_posts set fallback_command_id=v_command where id=v_new;
 end loop;
end $$;
revoke all on function con.workshop_fallback_tick() from public,anon,authenticated;
commit;