import { ledgerTransfer } from "./engine.js";
const positive=(n,max,label)=>{if(!Number.isSafeInteger(n)||n<1||n>max)throw Error("Invalid "+label);return n};
const snowflake=v=>{if(typeof v!=="string"||!/^\d{17,20}$/.test(v))throw Error("Invalid member ID");return v};
const uuid=v=>{if(typeof v!=="string"||!/^[0-9a-f-]{36}$/i.test(v))throw Error("Invalid identifier");return v};
async function tx(pool,fn){const c=await pool.connect();try{await c.query("BEGIN");const r=await fn(c);await c.query("COMMIT");return r}catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}}
export async function setCompensation(pool,actor,owner,{discordId,profession,type="salary",weekly=0,requiredUnits=0}){
 if(!owner)throw Error("Overseer only");snowflake(discordId);
 if(!["salary","contract"].includes(type))throw Error("Invalid compensation type");
 if(!Number.isSafeInteger(weekly)||weekly<0||weekly>100000000)throw Error("Invalid salary");
 if(!Number.isInteger(requiredUnits)||requiredUnits<0||requiredUnits>100)throw Error("Invalid quota");
 return tx(pool,async db=>{
  const member=await db.query("select id,profession_id from con.game_characters where discord_id=$1",[discordId]);
  if(!member.rowCount)throw Error("Member has no character");
  const result=await db.query("select id from con.game_professions where id=$1 and active=true",[profession]);
  if(!result.rowCount)throw Error("Unknown profession");
  await db.query("update con.game_employment set active=false where character_id=$1 and active=true",[member.rows[0].id]);
  const appointment=await db.query("insert into con.game_employment(character_id,profession_id,compensation_type,salary_weekly,required_units,appointed_by) values($1,$2,$3,$4,$5,$6) returning *",[member.rows[0].id,profession,type,weekly,requiredUnits,actor]);
  await db.query("insert into con.game_audit(actor,action,entity,entity_id,after_state) values($1,'employment.appoint','employment',$2,$3)",[actor,appointment.rows[0].id,JSON.stringify(appointment.rows[0])]);
  return appointment.rows[0];
 });
}
export async function setTaxes(pool,actor,owner,{income,sales}){
 if(!owner)throw Error("Overseer only");
 for(const v of [income,sales])if(!Number.isInteger(v)||v<0||v>25)throw Error("Tax rate must be 0 to 25 percent");
 return tx(pool,async db=>{
  const q=await db.query(`update con.game_settings set value=jsonb_set(jsonb_set(value,'{income_tax_percent}',to_jsonb($1::int),true),'{sales_tax_percent}',to_jsonb($2::int),true),updated_at=now() where key='rules' returning value`,[income,sales]);
  await db.query("insert into con.game_audit(actor,action,entity,after_state) values($1,'taxes.update','settings',$2)",[actor,JSON.stringify({income,sales})]);
  return q.rows[0]?.value;
 });
}
export async function transferCredits(pool,actor,target,amount,referenceKey){
 snowflake(actor);snowflake(target);positive(amount,100000000,"credits");
 if(actor===target)throw Error("Cannot pay yourself");
 if(typeof referenceKey!=="string"||!/^[a-zA-Z0-9-]{10,100}$/.test(referenceKey))throw Error("Invalid transfer key");
 return tx(pool,async db=>{
  const rate=await db.query("select (value->>'sales_tax_percent')::int as rate from con.game_settings where key='rules'");
  const tax=Math.floor(amount*Math.max(0,Math.min(25,Number(rate.rows[0]?.rate??5)))/100);
  const wallets=await db.query(`select a.id,a.balance,c.discord_id,a.account_type from con.game_accounts a left join con.game_characters c on c.id=a.character_id where c.discord_id=any($1::text[]) or a.account_type='treasury'`,[[actor,target]]);
  const from=wallets.rows.find(w=>w.discord_id===actor),to=wallets.rows.find(w=>w.discord_id===target),treasury=wallets.rows.find(w=>w.account_type==="treasury");
  if(!from||!to||!treasury)throw Error("Wallet unavailable");
  const ids=[from.id,to.id,treasury.id].sort();
  await db.query("select id from con.game_accounts where id=any($1::uuid[]) order by id for update",[ids]);
  const prev=await db.query("select id from con.game_transactions where reference_key=$1",["trade:"+referenceKey]);
  if(prev.rowCount)return {status:"already_processed",id:prev.rows[0].id};
  const net=amount+tax;
  const b=await db.query("select balance from con.game_accounts where id=$1",[from.id]);
  if(BigInt(b.rows[0].balance)<BigInt(net))throw Error("Insufficient credits including tax");
  const transaction=await db.query("insert into con.game_transactions(reference_key,reason,created_by,metadata) values($1,'Resident transfer',$2,$3::jsonb) returning id",["trade:"+referenceKey,actor,JSON.stringify({seller:target,amount,tax})]);
  const id=transaction.rows[0].id;
  await db.query("update con.game_accounts set balance=balance-$2 where id=$1",[from.id,net]);
  await db.query("update con.game_accounts set balance=balance+$2 where id=$1",[to.id,amount]);
  if(tax>0)await db.query("update con.game_accounts set balance=balance+$2 where id=$1",[treasury.id,tax]);
  await db.query("insert into con.game_entries(transaction_id,account_id,amount) values($1,$2,$3),($1,$4,$5)",[id,from.id,-net,to.id,amount]);
  if(tax>0)await db.query("insert into con.game_entries(transaction_id,account_id,amount) values($1,$2,$3)",[id,treasury.id,tax]);
  return {status:"completed",id,amount,tax};
 });
}
function period(dateStr){
 if(typeof dateStr!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(dateStr))throw Error("Use YYYY-MM-DD");
 const d=new Date(dateStr+"T00:00:00Z");if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==dateStr)throw Error("Invalid date");
 if(d.getUTCDay()!==1)throw Error("Pay period must begin Monday");
 return {start:dateStr,end:new Date(d.getTime()+7*86400000).toISOString().slice(0,10)};
}
export async function runPayroll(pool,actor,owner,monday){
 if(!owner)throw Error("Overseer only");
 const p=period(monday);
 return tx(pool,async db=>{
  await db.query("select pg_advisory_xact_lock(hashtext($1))",["con-game-payroll:"+monday]);
  const jobs=await db.query(`select e.*,c.discord_id,a.id wallet_id from con.game_employment e join con.game_characters c on c.id=e.character_id join con.game_accounts a on a.character_id=c.id where e.active=true and e.compensation_type='salary' order by e.id`);
  const rules=await db.query("select (value->>'income_tax_percent')::int as rate from con.game_settings where key='rules'");
  const taxRate=Math.max(0,Math.min(25,Number(rules.rows[0]?.rate??5)));
  const treasury=(await db.query("select id from con.game_accounts where account_type='treasury'")).rows[0]?.id;
  if(!treasury)throw Error("Treasury unavailable");
  let paid=0,skipped=0,total=0;
  for(const e of jobs.rows){
   const previous=await db.query("select id from con.game_payroll where employment_id=$1 and period_start=$2 and period_end=$3",[e.id,p.start,p.end]);
   if(previous.rowCount){skipped++;continue}
   const work=await db.query(`select count(*)::int as units from con.game_work_orders where character_id=$1 and status='completed' and completed_at >= $2::date and completed_at < $3::date`,[e.character_id,p.start,p.end]);
   const units=Number(work.rows[0].units);
   if(units<e.required_units){skipped++;continue}
   const gross=Number(e.salary_weekly),tax=Math.floor(gross*taxRate/100),net=gross-tax;
   const record=await db.query("insert into con.game_payroll(employment_id,period_start,period_end,gross,tax,work_units,status) values($1,$2,$3,$4,$5,$6,'pending') returning id",[e.id,p.start,p.end,gross,tax,units]);
   let transactionId=null;
   if(net>0)transactionId=await ledgerTransfer(db,{from:treasury,to:e.wallet_id,amount:net,key:"payroll:"+record.rows[0].id,actor,reason:"Weekly salary after tax"});
   await db.query("update con.game_payroll set status='paid',transaction_id=$2 where id=$1",[record.rows[0].id,transactionId]);
   paid++;total+=net;
  }
  await db.query("insert into con.game_audit(actor,action,entity,entity_id,after_state) values($1,'payroll.run','payroll',$2,$3)",[actor,monday,JSON.stringify({paid,skipped,total})]);
  return {period_start:p.start,period_end:p.end,paid,skipped,total_net:total};
 });
}
export async function payOverseerStipend(pool,actor,owner,amount,key){
 if(!owner)throw Error("Overseer only");
 positive(amount,1000000,"Overseer stipend");
 if(typeof key!=="string"||!/^[a-z0-9-]{10,100}$/i.test(key))throw Error("Invalid payment key");
 return tx(pool,async db=>{
  const r=await db.query("select id,account_type from con.game_accounts where account_type in ('treasury','overseer')");
  const treasury=r.rows.find(x=>x.account_type==="treasury"),privateAccount=r.rows.find(x=>x.account_type==="overseer");
  if(!treasury||!privateAccount)throw Error("Government accounts unavailable");
  const transaction_id=await ledgerTransfer(db,{from:treasury.id,to:privateAccount.id,amount,key:"overseer:"+key,actor,reason:"Overseer salary"});
  await db.query("insert into con.game_audit(actor,action,entity,entity_id,after_state) values($1,'overseer.salary','transaction',$2,$3)",[actor,transaction_id,JSON.stringify({amount})]);
  return {transaction_id,amount};
 });
}
