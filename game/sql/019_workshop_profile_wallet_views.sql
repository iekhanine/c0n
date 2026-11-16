begin;
create or replace view con.bot_public_profiles as
select p.discord_id,p.display_name,dm.avatar,
 coalesce(r.apartment_id,'The Unhoused') as apartment,
 m.member_no,coalesce(nullif(m.codename,''),nullif(m.display_name,''),p.display_name) as codename,
 m.joined_at as member_joined_at,p.xp,
 (1+floor(p.xp::numeric/250.0))::integer as level,
 p.health,p.stamina,p.skill,p.charisma,p.intellect,p.luck,
 active_work.title as active_job_title,
 active_work.job_location as active_job_location,
 active_work.state as active_job_state,
 active_work.due_at as active_job_due_at,
 active_work.channel_id as active_job_channel_id
from con.compound_profiles p
left join con.compound_residency r on r.discord_id=p.discord_id
left join con.memberships m on m.user_id=p.discord_id and m.active=true
left join lateral (select d.avatar from con.discord_members d
 where d.discord_id=p.discord_id and d.active=true and not d.is_bot
 order by d.joined_at desc nulls last limit 1) dm on true
left join lateral (
 select j.title,j.job_location,a.state,a.due_at,j.channel_id
 from con.workshop_assignments a join con.workshop_job_posts j on j.id=a.post_id
 where a.discord_id=p.discord_id and a.state in ('working','awaiting_confirmation')
 order by a.started_at desc limit 1
) active_work on true;
grant select on con.bot_public_profiles to con_bot_profile_reader;
create or replace function con.bot_workshop_wallet(member_id text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,con,pg_temp as $$
declare bal bigint; lifetime bigint;
begin
 if member_id !~ '^[0-9]{17,20}$' then raise exception 'Invalid member identifier'; end if;
 if not exists(select 1 from con.discord_members d join con.discord_settings s on s.id=true and s.guild_id=d.guild_id
 where d.discord_id=member_id and d.active and not d.is_bot)
 then raise exception 'Resident is not an active member'; end if;
 select coalesce((select w.balance from con.workshop_wallets w where w.discord_id=member_id),0) into bal;
 select coalesce(sum(credits),0) into lifetime from con.workshop_salary_receipts where discord_id=member_id;
 return jsonb_build_object('balance',bal,'earned',lifetime,'unit','Compound Credits');
end $$;
create or replace function con.bot_workshop_treasury()
returns jsonb language sql security definer
set search_path=pg_catalog,con,pg_temp as $$
 select jsonb_build_object('balance',coalesce(sum(balance),0),'unit','Compound Credits')
 from con.game_accounts where account_type='treasury'
$$;
revoke all on function con.bot_workshop_wallet(text) from public,anon,authenticated;
revoke all on function con.bot_workshop_treasury() from public,anon,authenticated;
grant execute on function con.bot_workshop_wallet(text) to con_bot_profile_reader;
grant execute on function con.bot_workshop_treasury() to con_bot_profile_reader;
commit;