create or replace function con.bot_heist_attempt(p_attacker text,p_victim text,p_key text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog,con,pg_temp
as $$
declare
 a_balance bigint;
 v_balance bigint;
 member_count integer;
 raid_amount bigint;
 fine bigint := 0;
 success boolean;
 txn uuid;
 previous record;
 rules jsonb;
 success_percent integer;
 steal_percent integer;
 maximum_theft bigint;
 failure_penalty bigint;
 attacker_cooldown_minutes integer;
 victim_protection_minutes integer;
 minimum_target_balance bigint;
 now_time timestamptz := clock_timestamp();
begin
 if p_attacker !~ '^[0-9]{17,20}$' or p_victim !~ '^[0-9]{17,20}$'
    or p_attacker=p_victim then raise exception 'Invalid heist participants'; end if;
 if p_key !~ '^heist:[0-9]{17,20}$' then raise exception 'Invalid heist request'; end if;

 select value into rules from con.game_settings where key='heist';
 if rules is null then raise exception 'Heist settings missing'; end if;
 if (rules->>'enabled')::boolean is distinct from true then raise exception 'The Heist is currently disabled'; end if;
 success_percent:=(rules->>'success_percent')::int;
 steal_percent:=(rules->>'steal_percent')::int;
 maximum_theft:=(rules->>'maximum_theft')::bigint;
 failure_penalty:=(rules->>'failure_penalty')::bigint;
 attacker_cooldown_minutes:=(rules->>'attacker_cooldown_minutes')::int;
 victim_protection_minutes:=(rules->>'victim_protection_minutes')::int;
 minimum_target_balance:=(rules->>'minimum_target_balance')::bigint;
 if success_percent not between 0 and 100 or steal_percent not between 1 and 100 or
    maximum_theft not between 1 and 1000000 or failure_penalty not between 0 and 1000000 or
    attacker_cooldown_minutes not between 0 and 10080 or
    victim_protection_minutes not between 0 and 10080 or
    minimum_target_balance not between 1 and 1000000 then raise exception 'Invalid heist settings'; end if;

 -- Only active, non-bot residents in this server can participate.
 select count(distinct discord_id) into member_count
 from con.discord_members
 where discord_id in (p_attacker,p_victim)
 and guild_id=(select guild_id from con.discord_settings where id=true)
 and active=true and not is_bot;
 if member_count<>2 then raise exception 'Both players must be active Compound members'; end if;

 -- Advisory locks serialize attempts by either member, even when accounts are empty.
 perform pg_advisory_xact_lock(hashtextextended('heist:'||least(p_attacker,p_victim),0));
 perform pg_advisory_xact_lock(hashtextextended('heist:'||greatest(p_attacker,p_victim),0));

 select h.* into previous from con.game_heists h where h.request_key=p_key;
 if found then return jsonb_build_object('status','already_processed','succeeded',previous.succeeded,'amount',previous.amount,'penalty',previous.penalty,'attacker_cooldown_minutes',attacker_cooldown_minutes,'victim_protection_minutes',victim_protection_minutes); end if;

 if exists(select 1 from con.game_heists where attacker_discord_id=p_attacker and created_at>now_time-(attacker_cooldown_minutes * interval '1 minute'))
 then raise exception 'Your crew is on cooldown'; end if;
 if exists(select 1 from con.game_heists where victim_discord_id=p_victim and created_at>now_time-(victim_protection_minutes * interval '1 minute'))
 then raise exception 'Target is under temporary protection'; end if;

 -- Workshop Dollars are the source of truth for /wallet. No game_character required.
 -- Missing wallet means $0; ensure both active members have a row.
 insert into con.workshop_wallets(discord_id,balance) values(p_attacker,0),(p_victim,0)
 on conflict(discord_id) do nothing;
 perform discord_id from con.workshop_wallets
 where discord_id in (p_attacker,p_victim) order by discord_id for update;
 select balance into a_balance from con.workshop_wallets where discord_id=p_attacker;
 select balance into v_balance from con.workshop_wallets where discord_id=p_victim;
 if v_balance<minimum_target_balance then raise exception 'Target has too little cash to rob'; end if;

 success := random() < (success_percent::numeric/100);
 if success then
    raid_amount:=least(maximum_theft,greatest(1,v_balance*steal_percent/100));
 else
    raid_amount:=0;
    fine:=least(failure_penalty,a_balance);
 end if;

 if raid_amount>0 or fine>0 then
    insert into con.game_transactions(reference_key,reason,created_by,metadata)
    values(p_key,case when success then 'Heist theft' else 'Failed heist restitution' end,p_attacker,
      jsonb_build_object('attacker',p_attacker,'victim',p_victim,'succeeded',success))
    returning id into txn;
    if success then
      update con.workshop_wallets set balance=balance-raid_amount,updated_at=now() where discord_id=p_victim;
      update con.workshop_wallets set balance=balance+raid_amount,updated_at=now() where discord_id=p_attacker;
      insert into con.game_heist_wallet_entries(transaction_id,discord_id,amount)
      values(txn,p_victim,-raid_amount),(txn,p_attacker,raid_amount);
    else
      update con.workshop_wallets set balance=balance-fine,updated_at=now() where discord_id=p_attacker;
      update con.workshop_wallets set balance=balance+fine,updated_at=now() where discord_id=p_victim;
      insert into con.game_heist_wallet_entries(transaction_id,discord_id,amount)
      values(txn,p_attacker,-fine),(txn,p_victim,fine);
    end if;
 end if;

 insert into con.game_heists(attacker_discord_id,victim_discord_id,request_key,succeeded,amount,penalty,transaction_id,created_at)
 values(p_attacker,p_victim,p_key,success,raid_amount,fine,txn,now_time);
 insert into con.game_audit(actor,action,entity,entity_id,after_state)
 values(p_attacker,'heist.attempt','game_heist',p_key,jsonb_build_object('victim',p_victim,'success',success,'amount',raid_amount,'penalty',fine));
 return jsonb_build_object('status','completed','succeeded',success,'amount',raid_amount,'penalty',fine,'attacker_cooldown_minutes',attacker_cooldown_minutes,'victim_protection_minutes',victim_protection_minutes);
end
$$;
revoke all on function con.bot_heist_attempt(text,text,text) from public;
grant execute on function con.bot_heist_attempt(text,text,text) to con_bot_profile_reader;
