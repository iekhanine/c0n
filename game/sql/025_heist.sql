-- C0N Heist: all money moves through the existing dollar wallet and double-entry ledger.
create table if not exists con.game_heists (
 id uuid primary key default gen_random_uuid(),
 attacker_discord_id text not null check (attacker_discord_id ~ '^[0-9]{17,20}$'),
 victim_discord_id text not null check (victim_discord_id ~ '^[0-9]{17,20}$'),
 request_key text not null unique,
 succeeded boolean not null,
 amount bigint not null default 0 check (amount>=0),
 penalty bigint not null default 0 check (penalty>=0),
 transaction_id uuid references con.game_transactions(id),
 created_at timestamptz not null default now(),
 check (attacker_discord_id <> victim_discord_id)
);
create index if not exists game_heists_attacker_time on con.game_heists(attacker_discord_id,created_at desc);
create index if not exists game_heists_victim_time on con.game_heists(victim_discord_id,created_at desc);
alter table con.game_heists enable row level security;
revoke all on con.game_heists from public,anon,authenticated;

-- Caller supplies authenticated Discord identity, NEVER a user-entered attacker.
-- The restricted bot role can execute the function but cannot change wallets directly.
create or replace function con.bot_heist_attempt(p_attacker text,p_victim text,p_key text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog,con
as $$
declare
 a record;
 v record;
 first_id uuid;
 second_id uuid;
 raid_amount bigint;
 fine bigint := 0;
 success boolean;
 txn uuid;
 previous record;
 now_time timestamptz := clock_timestamp();
begin
 if p_attacker !~ '^[0-9]{17,20}$' or p_victim !~ '^[0-9]{17,20}$'
    or p_attacker=p_victim then raise exception 'Invalid heist participants'; end if;
 if p_key !~ '^heist:[0-9]{17,20}$' then raise exception 'Invalid heist request'; end if;

 -- Advisory locks serialize attempts by either member, even when accounts are empty.
 perform pg_advisory_xact_lock(hashtextextended('heist:'||least(p_attacker,p_victim),0));
 perform pg_advisory_xact_lock(hashtextextended('heist:'||greatest(p_attacker,p_victim),0));

 select h.* into previous from con.game_heists h where h.request_key=p_key;
 if found then return jsonb_build_object('status','already_processed','succeeded',previous.succeeded,'amount',previous.amount,'penalty',previous.penalty); end if;

 if exists(select 1 from con.game_heists where attacker_discord_id=p_attacker and created_at>now_time-interval '2 hours')
 then raise exception 'Your crew is on cooldown for 2 hours'; end if;
 if exists(select 1 from con.game_heists where victim_discord_id=p_victim and created_at>now_time-interval '30 minutes')
 then raise exception 'Target is under temporary protection'; end if;

 select w.id,w.balance into a from con.game_accounts w
 join con.game_characters c on c.id=w.character_id
 where c.discord_id=p_attacker and w.account_type='resident';
 select w.id,w.balance into v from con.game_accounts w
 join con.game_characters c on c.id=w.character_id
 where c.discord_id=p_victim and w.account_type='resident';
 if a.id is null or v.id is null then raise exception 'Both members need Compound wallets'; end if;

 -- Lock wallets in deterministic order, then reload balances under lock.
 first_id:=least(a.id,v.id); second_id:=greatest(a.id,v.id);
 perform 1 from con.game_accounts where id in (first_id,second_id) order by id for update;
 select balance into a.balance from con.game_accounts where id=a.id;
 select balance into v.balance from con.game_accounts where id=v.id;
 if v.balance<10 then raise exception 'Target has too little cash to rob'; end if;

 success := random()<0.45;
 if success then
    raid_amount:=least(500,greatest(1,v.balance/10));
 else
    raid_amount:=0;
    fine:=least(50,a.balance);
 end if;

 if raid_amount>0 or fine>0 then
    insert into con.game_transactions(reference_key,reason,created_by,metadata)
    values(p_key,case when success then 'Heist theft' else 'Failed heist restitution' end,p_attacker,
      jsonb_build_object('attacker',p_attacker,'victim',p_victim,'succeeded',success))
    returning id into txn;
    if success then
      update con.game_accounts set balance=balance-raid_amount where id=v.id;
      update con.game_accounts set balance=balance+raid_amount where id=a.id;
      insert into con.game_entries(transaction_id,account_id,amount)
      values(txn,v.id,-raid_amount),(txn,a.id,raid_amount);
    else
      update con.game_accounts set balance=balance-fine where id=a.id;
      update con.game_accounts set balance=balance+fine where id=v.id;
      insert into con.game_entries(transaction_id,account_id,amount)
      values(txn,a.id,-fine),(txn,v.id,fine);
    end if;
 end if;

 insert into con.game_heists(attacker_discord_id,victim_discord_id,request_key,succeeded,amount,penalty,transaction_id,created_at)
 values(p_attacker,p_victim,p_key,success,raid_amount,fine,txn,now_time);
 insert into con.game_audit(actor,action,entity,entity_id,after_state)
 values(p_attacker,'heist.attempt','game_heist',p_key,jsonb_build_object('victim',p_victim,'success',success,'amount',raid_amount,'penalty',fine));
 return jsonb_build_object('status','completed','succeeded',success,'amount',raid_amount,'penalty',fine);
end
$$;
revoke all on function con.bot_heist_attempt(text,text,text) from public;
grant execute on function con.bot_heist_attempt(text,text,text) to con_bot_profile_reader;
