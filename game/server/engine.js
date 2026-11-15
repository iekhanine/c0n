// C0N Project Reclamation core. Server-side only; never import in browser code.
import { randomInt } from "node:crypto";
const ATTRS = ["strength","intelligence","charisma","agility","endurance","perception"];
const id = value => { if (!/^\d{17,20}$/.test(String(value))) throw Error("Invalid Discord member ID"); return String(value); };
const asInt = (n,min,max,label) => { if(!Number.isSafeInteger(n)||n<min||n>max) throw Error("Invalid "+label); return n; };
async function withTransaction(pool, work) {
 const db=await pool.connect();
 try { await db.query("BEGIN"); const result=await work(db); await db.query("COMMIT"); return result; }
 catch(e){await db.query("ROLLBACK");throw e}finally{db.release()}
}
export async function createCharacter(pool,{discordId,name,profession,attributes}) {
 id(discordId);
 if(typeof name!=="string"||name.trim().length<2||name.trim().length>50)throw Error("Invalid character name");
 if(!attributes || Object.keys(attributes).sort().join(",")!==[...ATTRS].sort().join(","))throw Error("Exactly six attributes required");
 const scores=ATTRS.map(a=>asInt(attributes[a],5,10,a));
 if(scores.reduce((a,b)=>a+b,0)!==50) throw Error("Allocate exactly twenty points");
 return withTransaction(pool,async db=>{
  const found=await db.query("select id from con.game_professions where id=$1 and active=true",[profession]);
  if(!found.rowCount)throw Error("Unknown profession");
  const created=await db.query("insert into con.game_characters(discord_id,name,profession_id) values($1,$2,$3) returning *",[id(discordId),name.trim(),profession]);
  const c=created.rows[0];
  for(let i=0;i<ATTRS.length;i++)await db.query("insert into con.game_character_attributes(character_id,attribute,score) values($1,$2,$3)",[c.id,ATTRS[i],scores[i]]);
  await db.query("insert into con.game_character_skills(character_id,profession_id) values($1,$2)",[c.id,profession]);
  await db.query("insert into con.game_accounts(account_type,character_id,label) values('resident',$1,$2)",[c.id,c.name]);
  await db.query("insert into con.game_storage(storage_type,owner_character_id,capacity) values('carry',$1,20)",[c.id]);
  await db.query("insert into con.game_audit(actor,action,entity,entity_id,after_state) values($1,'character.create','character',$2,$3)",[c.discord_id,c.id,JSON.stringify({name:c.name,profession})]);
  return c;
 });
}
export async function publishTask(pool,overseerId,form) {
 id(overseerId);
 if(!form || typeof form.title!=="string"||!form.title.trim())throw Error("Task title required");
 const allowed=["timer","quiz","dice","collaborative","dm_approval"];
 if(!allowed.includes(form.completionType))throw Error("Invalid completion type");
 const minutes=asInt(form.minutes,0,10080,"time");
 const xp=asInt(form.xp,0,100000,"XP");
 const skillXp=asInt(form.skillXp,0,100000,"profession XP");
 const pay=asInt(form.pay,0,1000000000,"pay");
 return withTransaction(pool,async db=>{
  const row=await db.query(`insert into con.game_task_templates
 (title,profession_id,description,completion_type,duration_minutes,character_xp,profession_xp,pay_credits,materials,rewards,status)
 values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,'published') returning *`,
 [form.title.trim(),form.profession||null,form.description||"",form.completionType,minutes,xp,skillXp,pay,JSON.stringify(form.materials||{}),JSON.stringify(form.rewards||{})]);
  await db.query("insert into con.game_audit(actor,action,entity,entity_id,after_state) values($1,'task.publish','task',$2,$3)",[overseerId,row.rows[0].id,JSON.stringify(row.rows[0])]);
  return row.rows[0];
 });
}
export async function updateTask(pool,overseerId,templateId,form){
 id(overseerId);
 if(!/^[0-9a-f-]{36}$/i.test(String(templateId)))throw Error("Invalid task ID");
 if(!form||typeof form.title!=="string"||!form.title.trim()||form.title.length>200)throw Error("Invalid task title");
 const types=["timer","quiz","dice","collaborative","dm_approval"];
 const states=["draft","published","paused","retired"];
 if(!types.includes(form.completionType)||!states.includes(form.status))throw Error("Invalid task type or status");
 const minutes=asInt(form.minutes,0,10080,"time"),xp=asInt(form.xp,0,100000,"XP"),
 skill=asInt(form.skillXp,0,100000,"profession XP"),pay=asInt(form.pay,0,1000000000,"pay");
 const stamina=form.staminaCost==null?null:asInt(form.staminaCost,0,100,"stamina");
 if(!Number.isSafeInteger(form.version)||form.version<1)throw Error("Task version required");
 return withTransaction(pool,async db=>{
  const previous=await db.query("select * from con.game_task_templates where id=$1 for update",[templateId]);
  if(!previous.rowCount)throw Error("Unknown task");
  if(previous.rows[0].version!==form.version)throw Error("Task changed; refresh before saving");
  const p=previous.rows[0];
  const staminaForUpdate=stamina===null?p.stamina_cost:stamina;
  const r=await db.query(`update con.game_task_templates
   set title=$2,description=$3,profession_id=$4,completion_type=$5,duration_minutes=$6,
   character_xp=$7,profession_xp=$8,pay_credits=$9,stamina_cost=$10,status=$11,version=version+1,updated_at=now()
   where id=$1 returning *`,[templateId,form.title.trim(),String(form.description??"").slice(0,3000),form.profession||null,form.completionType,minutes,xp,skill,pay,staminaForUpdate,form.status]);
  await db.query("insert into con.game_audit(actor,action,entity,entity_id,before_state,after_state) values($1,'task.update','task',$2,$3,$4)",[overseerId,templateId,JSON.stringify(p),JSON.stringify(r.rows[0])]);
  return r.rows[0];
 });
}
export async function acceptTask(pool,discordId,templateId) {
 id(discordId);
 return withTransaction(pool,async db=>{
  const cr=await db.query("select * from con.game_characters where discord_id=$1 for update",[discordId]);
  if(!cr.rowCount)throw Error("Create a character first");
  const c=cr.rows[0];
  const regenRule=await db.query("select value from con.game_settings where key='stamina'");
  const rate=Math.min(100,Math.max(0,Number(regenRule.rows[0]?.value?.regeneration_per_hour??12)));
  const elapsed=Math.max(0,(Date.now()-new Date(c.stamina_updated_at).getTime())/3600000);
  const restored=Math.min(100,c.stamina+Math.floor(elapsed*rate));
  if(restored!==c.stamina)await db.query("update con.game_characters set stamina=$2,stamina_updated_at=now() where id=$1",[c.id,restored]);
  c.stamina=restored;
  const tr=await db.query("select * from con.game_task_templates where id=$1 and status='published'",[templateId]);
  if(!tr.rowCount)throw Error("Task unavailable");
  const t=tr.rows[0];
  if(t.profession_id&&t.profession_id!==c.profession_id)throw Error("Profession does not match");
  if(c.stamina<t.stamina_cost)throw Error("Not enough stamina");
  if(t.cooldown_minutes) {
   const last=await db.query("select accepted_at from con.game_work_orders where character_id=$1 and template_id=$2 order by accepted_at desc limit 1",[c.id,t.id]);
   if(last.rowCount && Date.now()-new Date(last.rows[0].accepted_at).getTime()<t.cooldown_minutes*60000)throw Error("Task cooldown");
  }
  if(t.daily_limit) {
   const count=await db.query("select count(*)::int as n from con.game_work_orders where character_id=$1 and template_id=$2 and accepted_at >= date_trunc('day',now())",[c.id,t.id]);
   if(count.rows[0].n>=t.daily_limit)throw Error("Daily limit reached");
  }
  // Material reservation and inventory deduction must be implemented before paid jobs are enabled.
  if(Object.keys(t.materials||{}).length)throw Error("Material-requiring tasks are not enabled yet");
  await db.query("update con.game_characters set stamina=stamina-$2,stamina_updated_at=now() where id=$1",[c.id,t.stamina_cost]);
  const o=await db.query("insert into con.game_work_orders(template_id,character_id,template_snapshot,status,due_at) values($1,$2,$3::jsonb,'in_progress',now()+($4 * interval '1 minute')) returning *",[t.id,c.id,JSON.stringify(t),t.duration_minutes]);
  return o.rows[0];
 });
}
export async function ledgerTransfer(db,{from,to,amount,key,actor,reason}) {
 asInt(amount,1,1000000000,"transfer");
 const accounts=await db.query("select id,balance from con.game_accounts where id=any($1::uuid[]) order by id for update",[[from,to]]);
 if(from===to||accounts.rowCount!==2)throw Error("Invalid accounts");
 const source=accounts.rows.find(a=>a.id===from);
 if(BigInt(source.balance)<BigInt(amount))throw Error("Treasury insufficient");
 const prior=await db.query("select id from con.game_transactions where reference_key=$1",[key]);
 if(prior.rowCount) return prior.rows[0].id;
 const tx=await db.query("insert into con.game_transactions(reference_key,reason,created_by) values($1,$2,$3) returning id",[key,reason,actor]);
 await db.query("update con.game_accounts set balance=balance-$2 where id=$1",[from,amount]);
 await db.query("update con.game_accounts set balance=balance+$2 where id=$1",[to,amount]);
 await db.query("insert into con.game_entries(transaction_id,account_id,amount) values($1,$2,$3),($1,$4,$5)",[tx.rows[0].id,from,-amount,to,amount]);
 return tx.rows[0].id;
}
export async function submitWorkForReview(pool,discordId,orderId,note=""){
 id(discordId);
 if(!/^[0-9a-f-]{36}$/i.test(String(orderId)))throw Error("Invalid work order");
 if(typeof note!=="string"||note.length>1000)throw Error("Note too long");
 return withTransaction(pool,async db=>{
  const o=(await db.query("select w.* from con.game_work_orders w join con.game_characters c on c.id=w.character_id where w.id=$1 and c.discord_id=$2 for update of w",[orderId,discordId])).rows[0];
  if(!o||o.status!=="in_progress")throw Error("Not an active work order");
  if(o.template_snapshot.completion_type==="timer")throw Error("Timed jobs complete automatically");
  if(new Date(o.due_at)>new Date())throw Error("Work duration has not elapsed");
  return (await db.query("update con.game_work_orders set status='pending_approval',moderator_note=$2 where id=$1 returning id,status",[orderId,note.trim()])).rows[0];
 });
}
export async function completeTimerTask(pool,orderId,{approvedBy=null}={}) {
 return withTransaction(pool,async db=>{
  const order=await db.query("select * from con.game_work_orders where id=$1 for update",[orderId]);
  if(!order.rowCount)throw Error("Unknown order");
  const o=order.rows[0];
  if(o.status==="completed")return {status:"already_completed"};
  const t=o.template_snapshot;
  if(new Date(o.due_at)>new Date())throw Error("Task not ready");
  if(approvedBy){
   if(o.status!=="pending_approval"||t.completion_type==="timer")throw Error("Not awaiting manual approval");
  }else if(o.status!=="in_progress"||t.completion_type!=="timer")throw Error("Manual review required");
  const worker=await db.query("select * from con.game_characters where id=$1 for update",[o.character_id]);
  const c=worker.rows[0];
  const fee=await db.query("select value from con.game_settings where key='rules'");
  const taxPercent=Number(fee.rows[0]?.value?.income_tax_percent??5);
  const gross=Number(t.pay_credits), tax=Math.floor(gross*taxPercent/100), net=gross-tax;
  // Payroll and contract payments are separate: no automatic double-payment for salaried workers.
  const salaried=await db.query("select 1 from con.game_employment where character_id=$1 and active and compensation_type='salary' limit 1",[c.id]);
  let transactionId=null;
  if(!salaried.rowCount&&net>0){
   const acc=await db.query("select id,account_type,character_id from con.game_accounts where account_type='treasury' or character_id=$1",[c.id]);
   const treasury=acc.rows.find(x=>x.account_type==="treasury"),wallet=acc.rows.find(x=>x.character_id===c.id);
   transactionId=await ledgerTransfer(db,{from:treasury.id,to:wallet.id,amount:net,key:"work:"+o.id,actor:"game-engine",reason:"Net task compensation"});
   // Withheld tax stays in treasury; only the net amount is debited.
  }
  await db.query("update con.game_characters set xp=xp+$2 where id=$1",[c.id,t.character_xp]);
  if(t.profession_id)await db.query("insert into con.game_character_skills(character_id,profession_id,xp) values($1,$2,$3) on conflict(character_id,profession_id) do update set xp=con.game_character_skills.xp+excluded.xp",[c.id,t.profession_id,t.profession_xp]);
  // Resource drops are owned by the player, not created in a public channel.
  const drops=Object.entries(t.rewards?.items||{});
  if(drops.length){
   const bag=await db.query("select id,capacity from con.game_storage where storage_type='carry' and owner_character_id=$1 for update",[c.id]);
   if(!bag.rowCount)throw Error("Inventory container missing");
   const used=await db.query("select coalesce(sum(quantity),0)::bigint as n from con.game_inventory where storage_id=$1",[bag.rows[0].id]);
   let added=0;
   for(const [item,quantity] of drops){
    if(!/^[a-z_]{2,40}$/.test(item)||!Number.isSafeInteger(quantity)||quantity<1||quantity>100)throw Error("Invalid item drop");
    added+=quantity;
    const known=await db.query("select id from con.game_items where id=$1",[item]);
    if(!known.rowCount)throw Error("Unknown item drop");
   }
   if(BigInt(used.rows[0].n)+BigInt(added)>BigInt(bag.rows[0].capacity))throw Error("Inventory full: move items to apartment storage");
   for(const [item,quantity] of drops)
    await db.query("insert into con.game_inventory(storage_id,item_id,quantity) values($1,$2,$3) on conflict(storage_id,item_id) do update set quantity=con.game_inventory.quantity+excluded.quantity",[bag.rows[0].id,item,quantity]);
  }
  // Project labor is recorded only once while an active phase is open.
  if(t.project_id && Number(t.rewards?.work_units||0)>0){
   const units=asInt(Number(t.rewards.work_units),1,10000,"work units");
   const project=await db.query("select id from con.game_projects where id=$1 and state='active' for update",[t.project_id]);
   if(project.rowCount)await db.query(`update con.game_projects set progress=jsonb_set(progress,'{work_units}',to_jsonb(least(coalesce((requirements->>'work_units')::bigint,9223372036854775807),coalesce((progress->>'work_units')::bigint,0)+$2::bigint)),true) where id=$1`,[t.project_id,units]);
  }
  await db.query("update con.game_work_orders set status='completed',completed_at=now(),approved_by=$2 where id=$1",[o.id,approvedBy]);
  await db.query("insert into con.game_audit(actor,action,entity,entity_id,after_state) values('game-engine','work.complete','work_order',$1,$2)",[o.id,JSON.stringify({character:c.id,xp:t.character_xp,skillXp:t.profession_xp,netPay:salaried.rowCount?0:net,transactionId})]);
  return {status:"completed",xp:t.character_xp,professionXp:t.profession_xp,paid:salaried.rowCount?0:net};
 });
}
export async function rollDice(pool,{sessionId,characterId,sides,count=1,modifier=0,purpose=""}) {
 if(![4,6,8,10,12,20,100].includes(sides))throw Error("Unsupported die");
 asInt(count,1,20,"dice count");asInt(modifier,-100,100,"modifier");
 if(typeof purpose!=="string"||purpose.length>200)throw Error("Invalid purpose");
 const faces=Array.from({length:count},()=>randomInt(1,sides+1)),total=faces.reduce((s,n)=>s+n,modifier);
 const r=await pool.query("insert into con.game_dice_rolls(session_id,character_id,die_sides,number_of_dice,faces,modifier,total,purpose) values($1,$2,$3,$4,$5,$6,$7,$8) returning *",[sessionId||null,characterId||null,sides,count,faces,modifier,total,purpose]);
 return r.rows[0];
}
