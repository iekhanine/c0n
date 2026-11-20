-- Owner-controlled Discord wallet inspection and treasury disbursements.
-- Bot must check guild owner identity before invoking either function.
create or replace function con.bot_wallet_inspect(p_member text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,con,pg_temp as $$
declare bal bigint; earnings bigint;
begin
 if p_member !~ '^[0-9]{17,20}$' then raise exception 'Invalid member identifier'; end if;
 if not exists (
   select 1 from con.discord_members d
   join con.discord_settings s on s.id=true and s.guild_id=d.guild_id
   where d.discord_id=p_member and d.active and not d.is_bot
 ) then raise exception 'Target is not an active Compound member'; end if;
 select coalesce((select balance from con.workshop_wallets where discord_id=p_member),0) into bal;
 select coalesce(sum(credits),0) into earnings from con.workshop_salary_receipts where discord_id=p_member;
 return jsonb_build_object('balance',bal,'earned',earnings,'unit','Compound Dollars');
end
$$;
revoke all on function con.bot_wallet_inspect(text) from public,anon,authenticated;
grant execute on function con.bot_wallet_inspect(text) to con_bot_profile_reader;

create or replace function con.bot_treasury_send(p_actor text,p_target text,p_amount bigint,p_key text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,con,pg_temp as $$
declare treasury uuid; clearing uuid; available bigint; txn uuid; prior record; newbalance bigint;
begin
 if p_actor !~ '^[0-9]{17,20}$' or p_target !~ '^[0-9]{17,20}$'
   or p_key !~ '^send:[0-9]{17,20}$' or p_amount is null or p_amount<1 or p_amount>1000000 then
   raise exception 'Invalid treasury transfer request'; end if;
 -- Defense in depth: the Discord guild owner is the sole authorized issuer.
 -- The ID is saved in an owner-managed config record, not supplied by the slash command.
 if p_actor is distinct from (select value from con.game_settings where key='treasury_owner_discord_id') #>> '{}' then
   raise exception 'Treasury payments restricted to the owner'; end if;
 if not exists (
  select 1 from con.discord_members d join con.discord_settings s on s.id=true and s.guild_id=d.guild_id
  where d.discord_id=p_target and d.active and not d.is_bot
 ) then raise exception 'Recipient must be an active Compound member'; end if;
 perform pg_advisory_xact_lock(hashtextextended('treasury-send:'||p_key,0));
 select t.id into prior from con.game_transactions t where t.reference_key=p_key;
 if found then return jsonb_build_object('status','already_processed','transaction_id',prior.id); end if;
 -- Acquire the accounts in a stable order alongside Workshop payroll.
 perform id from con.game_accounts where account_type in ('treasury','system') order by id for update;
 select id,balance into treasury,available from con.game_accounts where account_type='treasury';
 select id into clearing from con.game_accounts where account_type='system';
 if treasury is null or clearing is null then raise exception 'Compound Treasury accounts unavailable'; end if;
 if available<p_amount then raise exception 'Insufficient Compound Treasury funds'; end if;
 insert into con.game_transactions(reference_key,reason,created_by,metadata)
 values(p_key,'Owner treasury grant',p_actor,jsonb_build_object('recipient',p_target,'amount',p_amount))
 returning id into txn;
 update con.game_accounts set balance=balance-p_amount where id=treasury;
 update con.game_accounts set balance=balance+p_amount where id=clearing;
 insert into con.game_entries(transaction_id,account_id,amount)
 values(txn,treasury,-p_amount),(txn,clearing,p_amount);
 insert into con.workshop_wallets(discord_id,balance) values(p_target,p_amount)
 on conflict(discord_id) do update
 set balance=con.workshop_wallets.balance+excluded.balance,updated_at=now();
 select balance into newbalance from con.workshop_wallets where discord_id=p_target;
 insert into con.game_audit(actor,action,entity,entity_id,after_state)
 values(p_actor,'treasury.send','transaction',txn::text,
 jsonb_build_object('recipient',p_target,'amount',p_amount,'new_balance',newbalance));
 return jsonb_build_object('status','completed','transaction_id',txn,'amount',p_amount,'recipient_balance',newbalance);
end
$$;
revoke all on function con.bot_treasury_send(text,text,bigint,text) from public,anon,authenticated;
grant execute on function con.bot_treasury_send(text,text,bigint,text) to con_bot_profile_reader;
