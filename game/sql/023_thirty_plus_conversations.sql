-- Thirty Plus: opt-in resident conversations, rotating 50 original prompts every 30m.
-- Restricted answers: no exposed REST access; bot uses only the four functions below.
create table if not exists con.thirty_plus_state(
 id boolean primary key default true check(id=true),
 guild_id text not null,
 channel_id text,
 next_seq bigint not null default 0 check(next_seq>=0),
 active_seq bigint,
 active_question integer check(active_question between 1 and 50),
 active_message_id text,
 active_posted_at timestamptz,
 next_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 updated_at timestamptz not null default now()
);
insert into con.thirty_plus_state(id,guild_id)
select true,guild_id from con.discord_settings where id=true
on conflict(id) do nothing;
create table if not exists con.thirty_plus_answers(
 question_seq bigint not null,
 question_index integer not null check(question_index between 1 and 50),
 guild_id text not null,
 channel_id text not null,
 user_id text not null check(user_id ~ '^[0-9]{17,20}$'),
 message_id text not null check(message_id ~ '^[0-9]{17,20}$'),
 answer_text text,
 occurred_at timestamptz not null default now(),
 charisma_awarded integer not null default 0 check(charisma_awarded in (0,1)),
 primary key(question_seq,user_id),
 unique(message_id)
);
create index if not exists thirty_plus_answers_by_user on con.thirty_plus_answers(user_id,occurred_at desc);
revoke all on con.thirty_plus_state,con.thirty_plus_answers from PUBLIC,anon,authenticated;
do $grants$
begin
 if exists(select 1 from pg_roles where rolname='con_bot_profile_reader') then
  execute 'revoke all on con.thirty_plus_state,con.thirty_plus_answers from con_bot_profile_reader';
 end if;
end $grants$;

create or replace function con.bot_thirty_plus_bind(guild text, channel text)
returns boolean language plpgsql security definer set search_path=pg_catalog,con as $fn$
begin
 if guild !~ '^[0-9]{17,20}$' or channel !~ '^[0-9]{17,20}$' then return false; end if;
 update con.thirty_plus_state s
 set channel_id=channel,updated_at=now()
 where s.id=true and s.guild_id=guild
   and exists(select 1 from con.discord_settings d where d.id=true and d.guild_id=guild);
 return found;
end $fn$;

create or replace function con.bot_thirty_plus_claim(guild text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,con as $fn$
declare s con.thirty_plus_state%rowtype; token uuid;
begin
 select * into s from con.thirty_plus_state where id=true and guild_id=guild for update;
 if not found or s.channel_id is null or s.next_at>now() or (s.lease_until is not null and s.lease_until>now()) then return null; end if;
 -- Forget free-text answers after 30 days. The awarded progression remains.
 update con.thirty_plus_answers set answer_text=null where answer_text is not null and occurred_at<now()-interval '30 days';
 token:=gen_random_uuid();
 update con.thirty_plus_state set lease_token=token,lease_until=now()+interval '2 minutes',updated_at=now()
 where id=true;
 return jsonb_build_object('seq',s.next_seq,'index',(s.next_seq%50)::integer+1,
  'channel_id',s.channel_id,'lease_token',token);
end $fn$;

create or replace function con.bot_thirty_plus_ack(
 guild text, seq bigint, token uuid, message text
) returns boolean language plpgsql security definer set search_path=pg_catalog,con as $fn$
declare s con.thirty_plus_state%rowtype;
begin
 if message !~ '^[0-9]{17,20}$' then return false; end if;
 select * into s from con.thirty_plus_state where id=true and guild_id=guild for update;
 if not found or s.next_seq<>seq or s.lease_token is distinct from token then return false; end if;
 update con.thirty_plus_state set active_seq=seq,active_question=(seq%50)::integer+1,
 active_message_id=message,active_posted_at=now(),next_seq=seq+1,
 next_at=now()+interval '30 minutes',lease_token=null,lease_until=null,updated_at=now()
 where id=true;
 return true;
end $fn$;

create or replace function con.bot_thirty_plus_active(guild text)
returns jsonb language sql security definer set search_path=pg_catalog,con as $fn$
 select case when s.guild_id=guild and s.active_seq is not null then
 jsonb_build_object('seq',s.active_seq,'index',s.active_question,'channel_id',s.channel_id,
 'message_id',s.active_message_id,'posted_at',s.active_posted_at,'next_at',s.next_at)
 else null end
 from con.thirty_plus_state s where id=true
$fn$;

create or replace function con.bot_thirty_plus_answer(
 guild text, channel text, member text, message text, response text, happened timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog,con as $fn$
declare s con.thirty_plus_state%rowtype; reward integer; n integer; member_name text;
begin
 if guild !~ '^[0-9]{17,20}$' or channel !~ '^[0-9]{17,20}$'
 or member !~ '^[0-9]{17,20}$' or message !~ '^[0-9]{17,20}$'
 or length(btrim(coalesce(response,'')))<25 or length(response)>1500
 or array_length(regexp_split_to_array(btrim(response),'\s+'),1)<4 then
  return jsonb_build_object('recorded',false,'reason','short_or_invalid');
 end if;
 if happened is null or happened<now()-interval '1 hour' or happened>now()+interval '2 minutes' then
  return jsonb_build_object('recorded',false,'reason','invalid_time');
 end if;
 select * into s from con.thirty_plus_state where id=true and guild_id=guild for update;
 if not found or s.channel_id is distinct from channel or s.active_seq is null
 or happened<s.active_posted_at or happened>=s.next_at or now()>=s.next_at then
  return jsonb_build_object('recorded',false,'reason','inactive');
 end if;
 select name into member_name from con.discord_members
 where guild_id=guild and discord_id=member and active=true and is_bot=false;
 if not found then return jsonb_build_object('recorded',false,'reason','not_member'); end if;
 if exists(select 1 from con.thirty_plus_answers where question_seq=s.active_seq and user_id=member) then
  return jsonb_build_object('recorded',false,'reason','already_answered');
 end if;
 select count(*) into n from con.thirty_plus_answers
 where user_id=member and charisma_awarded=1 and (occurred_at at time zone 'UTC')::date=(now() at time zone 'UTC')::date;
 reward:=case when n<8 then 1 else 0 end;
 insert into con.thirty_plus_answers(question_seq,question_index,guild_id,channel_id,user_id,message_id,answer_text,occurred_at,charisma_awarded)
 values(s.active_seq,s.active_question,guild,channel,member,message,left(btrim(response),1500),happened,reward)
 on conflict do nothing;
 if not found then return jsonb_build_object('recorded',false,'reason','duplicate_message'); end if;
 if reward>0 then
  insert into con.compound_profiles(discord_id,display_name) values(member,left(member_name,120))
   on conflict(discord_id) do nothing;
  insert into con.compound_progress_events(source_key,discord_id,source,description,xp_delta,charisma_delta,details,occurred_at)
  values('thirty-plus:'||s.active_seq||':'||member,member,'thirty_plus',
   'Thirty Plus conversation: question '||s.active_question,0,1,
   jsonb_build_object('question',s.active_question,'seq',s.active_seq,'channel_id',channel,'message_id',message),happened)
  on conflict(source_key) do nothing;
  update con.compound_profiles set charisma=least(100,charisma+1),
   charisma_activity_awarded=charisma_activity_awarded+1,updated_at=now() where discord_id=member;
  update con.game_character_attributes a set training_xp=training_xp+1
   from con.game_characters c where a.character_id=c.id and c.discord_id=member and a.attribute='charisma';
 end if;
 return jsonb_build_object('recorded',true,'question',s.active_question,'charisma',reward,'daily_awarded',n+reward);
end $fn$;

revoke all on function con.bot_thirty_plus_bind(text,text),
 con.bot_thirty_plus_claim(text),
 con.bot_thirty_plus_ack(text,bigint,uuid,text),
 con.bot_thirty_plus_active(text),
 con.bot_thirty_plus_answer(text,text,text,text,text,timestamptz) from PUBLIC,anon,authenticated;
do $grants$
begin
 if exists(select 1 from pg_roles where rolname='con_bot_profile_reader') then
  grant execute on function con.bot_thirty_plus_bind(text,text) to con_bot_profile_reader;
  grant execute on function con.bot_thirty_plus_claim(text) to con_bot_profile_reader;
  grant execute on function con.bot_thirty_plus_ack(text,bigint,uuid,text) to con_bot_profile_reader;
  grant execute on function con.bot_thirty_plus_active(text) to con_bot_profile_reader;
  grant execute on function con.bot_thirty_plus_answer(text,text,text,text,text,timestamptz) to con_bot_profile_reader;
 end if;
end $grants$;
