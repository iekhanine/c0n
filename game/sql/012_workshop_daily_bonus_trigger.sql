begin;
create or replace function con.workshop_credit_daily_activity()
returns trigger language plpgsql security invoker set search_path=con,pg_temp as $$
declare v_post record; v_claim record; v_name text;
begin
 if new.event_type<>'message'
    or new.occurred_at<now()-interval '10 minutes'
    or new.occurred_at>now()+interval '2 minutes' then return new; end if;
 select p.* into v_post from con.workshop_job_posts p
 join con.workshop_job_rotations r on r.channel_id=p.channel_id
 where p.channel_id=new.channel_id and p.state='posted' and not r.active
 and p.posted_at<=new.occurred_at order by p.posted_at desc limit 1;
 if v_post.id is null then return new; end if;
 select m.name into v_name from con.discord_members m
 join con.discord_settings s on s.guild_id=m.guild_id and s.id=true
 where m.discord_id=new.user_id and m.active and not m.is_bot;
 if v_name is null then return new; end if;
 perform pg_advisory_xact_lock(hashtext('workshop:'||v_post.id::text||new.user_id));
 insert into con.workshop_job_claims(post_id,discord_id,started_at)
 values(v_post.id,new.user_id,new.occurred_at) on conflict do nothing;
 select * into v_claim from con.workshop_job_claims
 where post_id=v_post.id and discord_id=new.user_id for update;
 if v_claim.completed_at is not null
 or new.occurred_at<v_claim.started_at+make_interval(mins=>v_post.min_minutes) then return new; end if;
 insert into con.compound_profiles(discord_id,display_name)
 values(new.user_id,left(v_name,80)) on conflict(discord_id) do nothing;
 update con.compound_profiles set
 xp=least(1000000,xp+v_post.xp_reward),
 manual_xp=manual_xp+v_post.xp_reward,
 skill=case when v_post.attribute='skill' then least(100,skill+v_post.attribute_reward) else skill end,
 charisma=case when v_post.attribute='charisma' then least(100,charisma+v_post.attribute_reward) else charisma end,
 intellect=case when v_post.attribute='intellect' then least(100,intellect+v_post.attribute_reward) else intellect end,
 luck=case when v_post.attribute='luck' then least(100,luck+v_post.attribute_reward) else luck end,
 updated_at=now() where discord_id=new.user_id;
 update con.workshop_job_claims set completed_at=now(),evidence='Two channel messages at least '||v_post.min_minutes||' minutes apart'
 where post_id=v_post.id and discord_id=new.user_id;
 insert into con.compound_progress_events
 (source_key,discord_id,source,description,xp_delta,charisma_delta,intellect_delta,details)
 values('workshop:'||v_post.id||':'||new.user_id,new.user_id,'workshop',
 v_post.title,v_post.xp_reward,
 case when v_post.attribute='charisma' then v_post.attribute_reward else 0 end,
 case when v_post.attribute='intellect' then v_post.attribute_reward else 0 end,
 jsonb_build_object('channel_id',new.channel_id,'job_id',v_post.id,
 'attribute',v_post.attribute,'attribute_reward',v_post.attribute_reward,'automated',true))
 on conflict(source_key) do nothing;
 return new;
exception when others then
 raise warning 'Workshop XP awarding failed: %',SQLERRM;
 return new;
end $$;
drop trigger if exists workshop_daily_activity on con.discord_participation_events;
create trigger workshop_daily_activity after insert on con.discord_participation_events
for each row execute function con.workshop_credit_daily_activity();
revoke all on function con.workshop_credit_daily_activity() from public,anon,authenticated;
commit;