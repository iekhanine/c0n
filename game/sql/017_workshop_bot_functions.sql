BEGIN;
-- SECURITY DEFINER is restricted to the Discord worker's dedicated login.
-- All identities are checked against the live Discord guild snapshot.
CREATE OR REPLACE FUNCTION con.bot_workshop_claim(guild text,member_id text,channel text,discord_message text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,con,pg_temp AS $$
DECLARE j record; name text; items jsonb; loc text; stock uuid; item text; qty integer; credits integer; due_time timestamptz;
BEGIN
 IF guild IS NULL OR guild<>(SELECT guild_id FROM con.discord_settings WHERE id=true)
  OR member_id !~ '^[0-9]{17,20}$' OR channel !~ '^[0-9]{17,20}$'
  OR discord_message !~ '^[0-9]{17,20}$' THEN RAISE EXCEPTION 'Invalid Workshop request'; END IF;
 SELECT m.name INTO name FROM con.discord_members m WHERE m.guild_id=guild AND m.discord_id=member_id AND m.active AND NOT m.is_bot;
 IF name IS NULL THEN RAISE EXCEPTION 'You must be an active member of the Compound'; END IF;
 SELECT p.*,r.label INTO j FROM con.workshop_job_posts p
 JOIN con.workshop_job_rotations r ON r.channel_id=p.channel_id
 WHERE p.channel_id=channel AND p.state='posted' ORDER BY p.posted_at DESC LIMIT 1 FOR UPDATE OF p;
 IF j.id IS NULL THEN RAISE EXCEPTION 'No active Workshop job in this channel'; END IF;
 IF j.assigned_discord_id IS NOT NULL THEN RAISE EXCEPTION 'This Workshop objective is already assigned'; END IF;
 IF EXISTS (SELECT 1 FROM con.workshop_assignments WHERE discord_id=member_id AND state IN ('working','awaiting_confirmation')) THEN
  RAISE EXCEPTION 'Finish your assigned shift before taking another'; END IF;
 items:=CASE j.label
 WHEN 'Carpentry' THEN '{"toolkit":1,"lumber":4}'::jsonb
 WHEN 'Metalworking' THEN '{"toolkit":1,"scrap":3}'::jsonb
 WHEN 'Medical' THEN '{"toolkit":1,"medical_supplies":2}'::jsonb
 WHEN 'Agriculture' THEN '{"toolkit":1,"seeds":2}'::jsonb
 WHEN 'Engineering' THEN '{"toolkit":1,"electrical_parts":3}'::jsonb
 WHEN 'Scavenging' THEN '{"toolkit":1,"scrap":2}'::jsonb
 WHEN 'Job Board' THEN '{}'::jsonb
 WHEN 'Payroll' THEN '{}'::jsonb
 ELSE NULL END;
 IF items IS NULL THEN RAISE EXCEPTION 'Unsupported Workshop profession'; END IF;
 loc:=CASE j.label
 WHEN 'Carpentry' THEN 'the eastern shelter beside the old loading dock'
 WHEN 'Metalworking' THEN 'the surface forge and damaged blast-door frame'
 WHEN 'Medical' THEN 'the deserted infirmary on the upper service level'
 WHEN 'Agriculture' THEN 'the greenhouse plots beyond the perimeter fence'
 WHEN 'Engineering' THEN 'the sealed power junction beneath the south service stairs'
 WHEN 'Scavenging' THEN 'the abandoned supply depot beyond the west fence'
 WHEN 'Payroll' THEN 'the Compound administration office'
 ELSE 'the Overseer operations desk near the central lift' END;
 SELECT id INTO stock FROM con.game_storage WHERE storage_type='warehouse' ORDER BY id LIMIT 1 FOR UPDATE;
 IF stock IS NULL THEN RAISE EXCEPTION 'The Compound stockroom is not available'; END IF;
 FOR item,qty IN SELECT key,value::integer FROM jsonb_each_text(items)
 LOOP
  UPDATE con.game_inventory SET quantity=quantity-qty WHERE storage_id=stock AND item_id=item AND quantity>=qty;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stockroom shortage: %',item; END IF;
 END LOOP;
 credits:=LEAST(10000,GREATEST(0,CASE WHEN j.salary_credits>0 THEN j.salary_credits ELSE j.xp_reward*10 END));
 due_time:=now()+make_interval(mins=>GREATEST(5,j.min_minutes));
 UPDATE con.workshop_job_posts SET assigned_discord_id=member_id,assigned_at=now(),
 salary_credits=credits,job_location=loc,required_supplies=items WHERE id=j.id;
 INSERT INTO con.workshop_assignments(post_id,discord_id,due_at,issued_items,salary_credits,xp_reward)
 VALUES(j.id,member_id,due_time,items,credits,j.xp_reward);
 INSERT INTO con.game_audit(actor,action,entity,entity_id,after_state)
 VALUES(member_id,'workshop.claim','workshop_job',j.id::text,
 jsonb_build_object('supplies',items,'location',loc,'salary',credits,'due_at',due_time,'discord_message',discord_message));
 RETURN jsonb_build_object('job_id',j.id,'user_id',member_id,'title',j.title,'objective',j.objective,
 'channel_id',j.channel_id,'name',name,'location',loc,'supplies',items,
 'credits',credits,'xp',j.xp_reward,'due_at',due_time,'minutes',GREATEST(5,j.min_minutes));
END $$;
CREATE OR REPLACE FUNCTION con.bot_workshop_due(guild text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,con,pg_temp AS $$
DECLARE j record;
BEGIN
 IF guild IS NULL OR guild<>(SELECT guild_id FROM con.discord_settings WHERE id=true) THEN RAISE EXCEPTION 'Invalid guild'; END IF;
 SELECT a.post_id,a.discord_id,a.due_at,a.salary_credits,a.xp_reward,
 p.channel_id,p.title,p.objective,p.job_location
 INTO j FROM con.workshop_assignments a JOIN con.workshop_job_posts p ON p.id=a.post_id
 WHERE a.state='working' AND a.due_at<=now()
 ORDER BY a.due_at LIMIT 1;
 IF j.post_id IS NULL THEN RETURN jsonb_build_object('assignment',NULL); END IF;
 RETURN jsonb_build_object('assignment',to_jsonb(j));
END $$;
CREATE OR REPLACE FUNCTION con.bot_workshop_reminder_sent(guild text,job uuid,member_id text,channel text,message text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,con,pg_temp AS $$
DECLARE a record;
BEGIN
 IF guild IS NULL OR guild<>(SELECT guild_id FROM con.discord_settings WHERE id=true)
  OR member_id !~ '^[0-9]{17,20}$' OR channel !~ '^[0-9]{17,20}$' OR message !~ '^[0-9]{17,20}$'
 THEN RAISE EXCEPTION 'Invalid reminder receipt'; END IF;
 SELECT a1.*,p.channel_id INTO a FROM con.workshop_assignments a1
 JOIN con.workshop_job_posts p ON p.id=a1.post_id WHERE a1.post_id=job FOR UPDATE OF a1;
 IF a.post_id IS NULL OR a.discord_id<>member_id OR a.channel_id<>channel THEN RAISE EXCEPTION 'Assignment mismatch'; END IF;
 IF a.state='awaiting_confirmation' AND a.reminder_message_id=message THEN RETURN '{"ok":true,"already_recorded":true}'::jsonb; END IF;
 IF a.state<>'working' OR a.due_at>now() THEN RAISE EXCEPTION 'Reminder not due'; END IF;
 UPDATE con.workshop_assignments SET state='awaiting_confirmation',reminder_message_id=message,
 reminded_at=now(),updated_at=now() WHERE post_id=job;
 RETURN '{"ok":true}'::jsonb;
END $$;
CREATE OR REPLACE FUNCTION con.bot_workshop_answer(guild text,job uuid,member_id text,choice text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,con,pg_temp AS $$
DECLARE a record; p record; w record; tx uuid; treasury uuid; clearing uuid; available bigint;
 profile_xp integer; stock uuid; prof text; character uuid; kit_qty integer; cname text;
BEGIN
 IF guild IS NULL OR guild<>(SELECT guild_id FROM con.discord_settings WHERE id=true)
  OR member_id !~ '^[0-9]{17,20}$' OR choice NOT IN ('yes','no')
 THEN RAISE EXCEPTION 'Invalid completion request'; END IF;
 SELECT m.name INTO cname FROM con.discord_members m
 WHERE m.guild_id=guild AND m.discord_id=member_id AND m.active AND NOT m.is_bot;
 IF cname IS NULL THEN RAISE EXCEPTION 'Active membership required'; END IF;
 SELECT * INTO a FROM con.workshop_assignments WHERE post_id=job FOR UPDATE;
 IF a.post_id IS NULL OR a.discord_id<>member_id THEN RAISE EXCEPTION 'This job belongs to another resident'; END IF;
 IF a.state='completed' THEN
  RETURN jsonb_build_object('ok',true,'already_completed',true,'credits',a.salary_credits,'xp',a.xp_reward);
 END IF;
 IF a.state<>'awaiting_confirmation' OR a.due_at>now() THEN RAISE EXCEPTION 'The shift is not awaiting confirmation'; END IF;
 IF choice='no' THEN
  UPDATE con.workshop_assignments SET state='working',due_at=now()+interval '30 minutes',
   reminded_at=NULL,reminder_message_id=NULL,updated_at=now() WHERE post_id=job;
  RETURN '{"ok":true,"extended":true,"minutes":30}'::jsonb;
 END IF;
 SELECT * INTO p FROM con.workshop_job_posts WHERE id=job;
 -- Lock both treasury and system clearing balances in deterministic order.
 PERFORM id FROM con.game_accounts WHERE account_type IN ('treasury','system') ORDER BY id FOR UPDATE;
 SELECT id,balance INTO treasury,available FROM con.game_accounts WHERE account_type='treasury';
 SELECT id INTO clearing FROM con.game_accounts WHERE account_type='system';
 IF treasury IS NULL OR clearing IS NULL OR available<a.salary_credits THEN RAISE EXCEPTION 'Insufficient treasury funds'; END IF;
 INSERT INTO con.game_transactions(reference_key,reason,created_by,metadata)
 VALUES('workshop:salary:'||job,'Workshop contract: '||p.title,member_id,jsonb_build_object('job_id',job,'resident',member_id))
 RETURNING id INTO tx;
 IF a.salary_credits>0 THEN
  UPDATE con.game_accounts SET balance=balance-a.salary_credits WHERE id=treasury;
  UPDATE con.game_accounts SET balance=balance+a.salary_credits WHERE id=clearing;
  INSERT INTO con.game_entries(transaction_id,account_id,amount)
  VALUES(tx,treasury,-a.salary_credits),(tx,clearing,a.salary_credits);
 END IF;
 INSERT INTO con.workshop_wallets(discord_id,balance) VALUES(member_id,a.salary_credits)
 ON CONFLICT(discord_id) DO UPDATE SET balance=con.workshop_wallets.balance+excluded.balance,updated_at=now();
 INSERT INTO con.workshop_salary_receipts(post_id,discord_id,credits,transaction_id)
 VALUES(job,member_id,a.salary_credits,tx);
 INSERT INTO con.compound_profiles(discord_id,display_name) VALUES(member_id,left(cname,80))
 ON CONFLICT(discord_id) DO NOTHING;
 UPDATE con.compound_profiles SET
 xp=least(1000000,xp+a.xp_reward),manual_xp=manual_xp+a.xp_reward,
 skill=case when p.attribute='skill' then least(100,skill+p.attribute_reward) else skill end,
 charisma=case when p.attribute='charisma' then least(100,charisma+p.attribute_reward) else charisma end,
 intellect=case when p.attribute='intellect' then least(100,intellect+p.attribute_reward) else intellect end,
 luck=case when p.attribute='luck' then least(100,luck+p.attribute_reward) else luck end,
 updated_at=now() WHERE discord_id=member_id RETURNING xp INTO profile_xp;
 INSERT INTO con.compound_progress_events(source_key,discord_id,source,description,xp_delta,charisma_delta,intellect_delta,details)
 VALUES('workshop:exclusive:'||job,member_id,'workshop',p.title,a.xp_reward,
 case when p.attribute='charisma' then p.attribute_reward else 0 end,
 case when p.attribute='intellect' then p.attribute_reward else 0 end,
 jsonb_build_object('job_id',job,'salary',a.salary_credits,'attribute',p.attribute,'attribute_reward',p.attribute_reward));
 SELECT id INTO character FROM con.game_characters WHERE discord_id=member_id FOR UPDATE;
 IF character IS NOT NULL THEN
  UPDATE con.game_characters SET xp=xp+a.xp_reward WHERE id=character;
  SELECT profession_id INTO prof FROM con.workshop_job_rotations WHERE channel_id=p.channel_id;
  IF prof IS NOT NULL THEN
   INSERT INTO con.game_character_skills(character_id,profession_id,xp) VALUES(character,prof,a.xp_reward)
   ON CONFLICT(character_id,profession_id) DO UPDATE SET xp=con.game_character_skills.xp+excluded.xp;
  END IF;
 END IF;
 kit_qty:=COALESCE((a.issued_items->>'toolkit')::integer,0);
 IF kit_qty>0 THEN
  SELECT id INTO stock FROM con.game_storage WHERE storage_type='warehouse' ORDER BY id LIMIT 1 FOR UPDATE;
  INSERT INTO con.game_inventory(storage_id,item_id,quantity) VALUES(stock,'toolkit',kit_qty)
  ON CONFLICT(storage_id,item_id) DO UPDATE SET quantity=con.game_inventory.quantity+excluded.quantity;
 END IF;
 UPDATE con.workshop_assignments SET state='completed',completed_at=now(),updated_at=now() WHERE post_id=job;
 INSERT INTO con.game_audit(actor,action,entity,entity_id,after_state)
 VALUES(member_id,'workshop.complete','workshop_job',job::text,
  jsonb_build_object('credits',a.salary_credits,'xp',a.xp_reward,'transaction',tx));
 RETURN jsonb_build_object('ok',true,'completed',true,'title',p.title,'credits',a.salary_credits,
 'xp',a.xp_reward,'attribute',p.attribute,'attribute_reward',p.attribute_reward,'total_xp',profile_xp);
END $$;
-- Restrict even read-only access through these narrow privileged entrypoints.
REVOKE ALL ON FUNCTION con.bot_workshop_claim(text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION con.bot_workshop_due(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION con.bot_workshop_reminder_sent(text,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION con.bot_workshop_answer(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION con.bot_workshop_claim(text,text,text,text) TO con_bot_profile_reader;
GRANT EXECUTE ON FUNCTION con.bot_workshop_due(text) TO con_bot_profile_reader;
GRANT EXECUTE ON FUNCTION con.bot_workshop_reminder_sent(text,uuid,text,text,text) TO con_bot_profile_reader;
GRANT EXECUTE ON FUNCTION con.bot_workshop_answer(text,uuid,text,text) TO con_bot_profile_reader;
COMMIT;