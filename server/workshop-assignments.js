// Workshop jobs: atomic exclusive claims, warehouse issue, reminder receipts,
// and payroll. Called ONLY through the signed Discord bridge.
const bad=(status,message)=>{throw Object.assign(new Error(message),{status})};
const snow=x=>typeof x==="string"&&/^\d{17,20}$/.test(x);
const uid=x=>typeof x==="string"&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(x);
const SUPPLIES={
 "Job Board":{},
 "Carpentry":{toolkit:1,lumber:4},
 "Metalworking":{toolkit:1,scrap:3},
 "Medical":{toolkit:1,medical_supplies:2},
 "Agriculture":{toolkit:1,seeds:2},
 "Engineering":{toolkit:1,electrical_parts:3},
 "Scavenging":{toolkit:1,scrap:2},
 "Payroll":{}
};
const LOCATIONS={
 "Job Board":"the Overseer's operations desk near the central lift",
 "Carpentry":"the eastern shelter beside the old loading dock",
 "Metalworking":"the surface forge and damaged blast-door frame",
 "Medical":"the deserted infirmary on the upper service level",
 "Agriculture":"the greenhouse plots beyond the perimeter fence",
 "Engineering":"the sealed power junction beneath the south service stairs",
 "Scavenging":"the abandoned supply depot beyond the west fence",
 "Payroll":"the Compound's administration office"
};
const member=async(db,guild,id)=>{
 const r=(await db.query("select name from con.discord_members where guild_id=$1 and discord_id=$2 and active=true and is_bot=false",[guild,id])).rows[0];
 if(!r)bad(403,"Active Compound membership required");
 return r;
};
export async function claimExclusiveWorkshop(db,b,guild){
 if(!snow(b.user_id)||!snow(b.channel_id)||!snow(b.message_id))bad(400,"Invalid member or channel");
 const m=await member(db,guild,b.user_id);
 const job=(await db.query(`select p.*,r.label from con.workshop_job_posts p
 join con.workshop_job_rotations r on r.channel_id=p.channel_id
 where p.channel_id=$1 and p.message_id=$2 and p.state='posted' for update of p`,[b.channel_id,b.message_id])).rows[0];
 if(!job)bad(409,"Only the latest active pinned Workshop objective can be claimed.");
 if(job.assigned_discord_id)bad(409,"This objective is already assigned to <@"+job.assigned_discord_id+">.");
 const occupied=await db.query("select post_id from con.workshop_assignments where discord_id=$1 and state in ('working','awaiting_confirmation') limit 1",[b.user_id]);
 if(occupied.rowCount)bad(409,"You already have an active Workshop shift. Finish it first.");
 const requirements=SUPPLIES[job.label];
 if(!requirements)bad(409,"This Workshop channel is not configured for stockroom assignments.");
 const stock=(await db.query("select id from con.game_storage where storage_type='warehouse' order by id limit 1 for update")).rows[0];
 if(!stock)bad(503,"The Compound stockroom is not available.");
 for(const [item,quantity] of Object.entries(requirements)){
  const res=await db.query(`update con.game_inventory set quantity=quantity-$3
  where storage_id=$1 and item_id=$2 and quantity >=$3 returning quantity`,[stock.id,item,quantity]);
  if(!res.rowCount)bad(409,"Stockroom is short of "+item+". Notify the Overseer.");
 }
 const credits=Math.min(10000,Math.max(0,job.salary_credits||job.xp_reward*10));
 const location=LOCATIONS[job.label];
 const minutes=Math.max(5,job.min_minutes);
 const reserved=(await db.query(`update con.workshop_job_posts set assigned_discord_id=$2,assigned_at=now(),
 salary_credits=$3,job_location=$4,required_supplies=$5::jsonb
 where id=$1 and assigned_discord_id is null returning *`,
 [job.id,b.user_id,credits,location,JSON.stringify(requirements)])).rows[0];
 if(!reserved)bad(409,"Another resident claimed that job first.");
 const assignment=(await db.query(`insert into con.workshop_assignments
 (post_id,discord_id,due_at,issued_items,salary_credits,xp_reward)
 values($1,$2,now()+make_interval(mins=>$3),$4::jsonb,$5,$6)
 returning *`,[job.id,b.user_id,minutes,JSON.stringify(requirements),credits,job.xp_reward])).rows[0];
 await db.query(`insert into con.game_audit(actor,action,entity,entity_id,after_state)
 values($1,'workshop.claim','workshop_job',$2,$3::jsonb)`,
 [b.user_id,job.id,JSON.stringify({location,issued:requirements,credits,xp:job.xp_reward,due_at:assignment.due_at})]);
 return {job_id:job.id,user_id:b.user_id,title:job.title,objective:job.objective,channel_id:job.channel_id,
  location,supplies:requirements,due_at:assignment.due_at,credits,xp:job.xp_reward,
  name:m.name,minutes};
}
export async function dueWorkshopReminders(db){
 const a=(await db.query(`select a.post_id,a.discord_id,a.due_at,a.salary_credits,a.xp_reward,p.channel_id,p.title,p.objective,p.job_location,
 p.message_id from con.workshop_assignments a join con.workshop_job_posts p on p.id=a.post_id
 where a.state='working' and a.due_at<=now()
 order by a.due_at limit 1`)).rows[0];
 return {assignment:a||null};
}
export async function recordWorkshopReminder(db,b){
 if(!uid(b.job_id)||!snow(b.user_id)||!snow(b.message_id))bad(400,"Invalid reminder receipt.");
 const a=(await db.query("select a.*,p.channel_id from con.workshop_assignments a join con.workshop_job_posts p on p.id=a.post_id where a.post_id=$1 for update",[b.job_id])).rows[0];
 if(!a||a.discord_id!==b.user_id||a.channel_id!==b.channel_id)bad(404,"Assignment not found");
 if(a.state==='awaiting_confirmation' && a.reminder_message_id===b.message_id)return {ok:true,already_recorded:true};
 if(a.state!=='working'||new Date(a.due_at)>new Date())bad(409,"Reminder is not due.");
 await db.query(`update con.workshop_assignments set state='awaiting_confirmation',reminded_at=now(),
 reminder_message_id=$2,updated_at=now() where post_id=$1`,[a.post_id,b.message_id]);
 return {ok:true};
}
export async function answerWorkshopReminder(db,b,guild){
 if(!uid(b.job_id)||!snow(b.user_id)||!['yes','no'].includes(b.answer))bad(400,"Invalid confirmation.");
 await member(db,guild,b.user_id);
 const a=(await db.query("select * from con.workshop_assignments where post_id=$1 for update",[b.job_id])).rows[0];
 if(!a||a.discord_id!==b.user_id)bad(403,"This job belongs to another resident.");
 if(a.state==='completed')return {ok:true,already_completed:true,credits:a.salary_credits,xp:a.xp_reward};
 if(a.state!=='awaiting_confirmation'||new Date(a.due_at)>new Date())bad(409,"This job is not awaiting confirmation.");
 if(b.answer==='no'){
  await db.query(`update con.workshop_assignments set state='working',due_at=now()+interval '30 minutes',
   reminder_message_id=null,reminded_at=null,updated_at=now() where post_id=$1`,[a.post_id]);
  return {ok:true,extended:true,minutes:30};
 }
 const p=(await db.query("select * from con.workshop_job_posts where id=$1",[a.post_id])).rows[0];
 // Lock balance rows in stable ID order to avoid competing payroll deadlocks.
 const accounts=(await db.query(`select id,account_type,balance from con.game_accounts
 where account_type in ('treasury','system') order by id for update`)).rows;
 const treasury=accounts.find(x=>x.account_type==='treasury'), clearing=accounts.find(x=>x.account_type==='system');
 if(!treasury||!clearing||BigInt(treasury.balance)<BigInt(a.salary_credits))bad(409,"Compound treasury has insufficient credits.");
 const receipt=(await db.query(`insert into con.game_transactions(reference_key,reason,created_by,metadata)
 values($1,$2,$3,$4::jsonb) returning id`,
 ['workshop:salary:'+a.post_id,'Workshop contract: '+p.title,b.user_id,JSON.stringify({job_id:a.post_id,beneficiary:b.user_id})])).rows[0];
 if(a.salary_credits>0){
  await db.query("update con.game_accounts set balance=balance-$2 where id=$1",[treasury.id,a.salary_credits]);
  await db.query("update con.game_accounts set balance=balance+$2 where id=$1",[clearing.id,a.salary_credits]);
  await db.query(`insert into con.game_entries(transaction_id,account_id,amount) values($1,$2,$3),($1,$4,$5)`,
   [receipt.id,treasury.id,-a.salary_credits,clearing.id,a.salary_credits]);
 }
 await db.query(`insert into con.workshop_wallets(discord_id,balance) values($1,$2)
 on conflict(discord_id) do update set balance=con.workshop_wallets.balance+excluded.balance,updated_at=now()`,[b.user_id,a.salary_credits]);
 await db.query("insert into con.workshop_salary_receipts(post_id,discord_id,credits,transaction_id) values($1,$2,$3,$4)",[a.post_id,b.user_id,a.salary_credits,receipt.id]);
 const name=(await member(db,guild,b.user_id)).name;
 await db.query("insert into con.compound_profiles(discord_id,display_name) values($1,$2) on conflict(discord_id) do nothing",[b.user_id,name.slice(0,80)]);
 const profile=(await db.query(`update con.compound_profiles set xp=least(1000000,xp+$2),
 manual_xp=manual_xp+$2,updated_at=now() where discord_id=$1 returning xp`,[b.user_id,a.xp_reward])).rows[0];
 await db.query(`insert into con.compound_progress_events(source_key,discord_id,source,description,xp_delta,details)
 values($1,$2,'workshop',$3,$4,$5::jsonb) on conflict(source_key) do nothing`,
 ['workshop:exclusive:'+a.post_id,b.user_id,p.title,a.xp_reward,JSON.stringify({job_id:a.post_id,credits:a.salary_credits,confirmed_by:b.user_id})]);
 // Tools are checked back in after completion. Consumables remain deducted.
 const stock=(await db.query("select id from con.game_storage where storage_type='warehouse' order by id limit 1 for update")).rows[0];
 for(const [item,qty] of Object.entries(a.issued_items||{})){
  if(item==='toolkit')await db.query(`insert into con.game_inventory(storage_id,item_id,quantity) values($1,$2,$3)
   on conflict(storage_id,item_id) do update set quantity=con.game_inventory.quantity+excluded.quantity`,[stock.id,item,qty]);
 }
 await db.query("update con.workshop_assignments set state='completed',completed_at=now(),updated_at=now() where post_id=$1",[a.post_id]);
 await db.query(`insert into con.game_audit(actor,action,entity,entity_id,after_state)
 values($1,'workshop.complete','workshop_job',$2,$3::jsonb)`,[b.user_id,a.post_id,JSON.stringify({credits:a.salary_credits,xp:a.xp_reward})]);
 return {ok:true,completed:true,title:p.title,credits:a.salary_credits,xp:a.xp_reward,total_xp:profile.xp};
}
