import { readSession, accessFor, json, ORIGIN } from "./auth.js";
import { database } from "./db.js";
import { createCharacter, acceptTask, completeTimerTask, publishTask, rollDice } from "../game/server/engine.js";
const fail=(code,message)=>{throw Object.assign(new Error(message),{status:code})};
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
async function payload(req) {
 const chunks=[];let size=0;
 for await (const chunk of req){size+=chunk.length;if(size>16384)fail(413,"Request too large");chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString("utf8"))}catch{fail(400,"Invalid JSON")}
}
async function snapshot(pool,discordId,owner){
 const [c,t,p,w,a,settings]=await Promise.all([
  pool.query(`select c.id,c.name,c.profession_id,c.level,c.xp,c.health,c.stamina,c.state,
   coalesce((select jsonb_object_agg(attribute,score) from con.game_character_attributes where character_id=c.id),'{}'::jsonb) attributes,
   coalesce((select jsonb_object_agg(profession_id,xp) from con.game_character_skills where character_id=c.id),'{}'::jsonb) skills
   from con.game_characters c where c.discord_id=$1`,[discordId]),
  pool.query(`select id,title,description,profession_id,completion_type,duration_minutes,character_xp,profession_xp,pay_credits,stamina_cost,materials,rewards,cooldown_minutes,daily_limit
   from con.game_task_templates where status='published' order by profession_id,title limit 150`),
  pool.query("select id,title,phase,state,requirements,progress from con.game_projects order by phase"),
  pool.query(`select a.balance from con.game_accounts a join con.game_characters c on a.character_id=c.id where c.discord_id=$1`,[discordId]),
  pool.query(`select w.id,w.status,w.accepted_at,w.due_at,w.completed_at,w.template_snapshot->>'title' as title
   from con.game_work_orders w join con.game_characters c on c.id=w.character_id
   where c.discord_id=$1 order by w.accepted_at desc limit 40`,[discordId]),
  pool.query("select key,value from con.game_settings where key in ('rules','story')")
 ]);
 const result={character:c.rows[0]||null,tasks:t.rows,projects:p.rows,wallet:w.rows[0]?.balance||"0",orders:a.rows,settings:Object.fromEntries(settings.rows.map(x=>[x.key,x.value]))};
 if(owner){
  const [treasury,allTasks]=await Promise.all([
   pool.query("select balance from con.game_accounts where account_type='treasury'"),
   pool.query("select id,title,profession_id,completion_type,duration_minutes,character_xp,profession_xp,pay_credits,stamina_cost,status from con.game_task_templates order by updated_at desc limit 200")
  ]);
  result.overseer={treasury:treasury.rows[0]?.balance,taskTemplates:allTasks.rows};
 }
 return result;
}
export async function reclamationHandler(req,res,poolFactory=database){
 try{
  if(!["GET","POST"].includes(req.method))return json(res,405,{error:"Method not allowed"});
  const session=await readSession(req);
  if(!session?.user?.id)fail(401,"Discord sign-in required");
  const access=await accessFor(session);
  const owner=access.owner===true;
  const url=new URL(req.url,ORIGIN);
  const action=url.searchParams.get("action")||"state";
  const pool=poolFactory();
  if(req.method==="GET"){
   if(action!=="state")fail(404,"Unknown operation");
   return json(res,200,await snapshot(pool,session.user.id,owner));
  }
  if(req.headers.origin!==ORIGIN)fail(403,"Invalid request origin");
  if(!String(req.headers["content-type"]||"").startsWith("application/json"))fail(415,"JSON required");
  const data=await payload(req);
  let result;
  if(action==="character.create"){
   result=await createCharacter(pool,{discordId:session.user.id,name:data.name,profession:data.profession,attributes:data.attributes});
  }else if(action==="task.accept"){
   if(!uuid(data.id))fail(400,"Invalid task ID");
   result=await acceptTask(pool,session.user.id,data.id);
  }else if(action==="task.complete"){
   if(!uuid(data.id))fail(400,"Invalid order ID");
   const owned=await pool.query(`select 1 from con.game_work_orders w join con.game_characters c on c.id=w.character_id where w.id=$1 and c.discord_id=$2`,[data.id,session.user.id]);
   if(!owned.rowCount)fail(403,"Not your work order");
   result=await completeTimerTask(pool,data.id);
  }else if(action==="task.publish"){
   if(!owner)fail(403,"Overseer only");
   result=await publishTask(pool,session.user.id,data);
  }else if(action==="dice.roll"){
   if(!Number.isInteger(data.sides)||!Number.isInteger(data.count)||!Number.isInteger(data.modifier))fail(400,"Invalid dice");
   const character=await pool.query("select id from con.game_characters where discord_id=$1",[session.user.id]);
   if(!character.rowCount)fail(409,"Create your character first");
   result=await rollDice(pool,{characterId:character.rows[0].id,sides:data.sides,count:data.count,modifier:data.modifier,purpose:String(data.purpose||"").slice(0,200)});
  }else fail(404,"Unknown operation");
  return json(res,200,{result});
 }catch(err){
  const code=err?.code;
  const status=err?.status||((code==="23505")?409:(code==="23503"||code==="23514")?400:500);
  if(status===500)console.error("Reclamation operation failed",{code:code||"server"});
  return json(res,status,{error:status===500?"Game operation unavailable":err.message});
 }
}
