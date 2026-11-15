// Project Reclamation: consume salvaged materials, complete shared milestones, unlock the next sector.
const uuid=v=>{if(typeof v!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))throw Error("Invalid project ID");return v};
const snowflake=v=>{if(typeof v!=="string"||!/^\d{17,20}$/.test(v))throw Error("Invalid member");return v};
const qty=v=>{if(!Number.isSafeInteger(v)||v<1||v>1000)throw Error("Invalid donation quantity");return v};
async function trx(pool,work){const c=await pool.connect();try{await c.query("BEGIN");const r=await work(c);await c.query("COMMIT");return r}catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}}
const sufficient=p=>Object.entries(p.requirements||{}).every(([key,need])=>Number(p.progress?.[key]||0)>=Number(need));
async function conclude(db,project,actor){
 if(!sufficient(project))return {completed:false};
 const updated=(await db.query("update con.game_projects set state='complete' where id=$1 and state='active' returning *",[project.id])).rows[0];
 if(!updated)return {completed:false};
 await db.query("update con.game_locations set state='accessible' where id=$1 and state in ('damaged','sealed')",[project.location_id]);
 const next=(await db.query("select id from con.game_projects where state='locked' and phase>$1 order by phase limit 1 for update",[project.phase])).rows[0];
 if(next)await db.query("update con.game_projects set state='active' where id=$1",[next.id]);
 else await db.query("update con.game_settings set value=jsonb_set(value,'{underground_open}','true'::jsonb,true),updated_at=now() where key='story'");
 await db.query("insert into con.game_world_events(title,description,event_type,location_id,state,created_by,published_at) values($1,$2,'construction',$3,'published',$4,now())",[project.title+" completed","The workforce has finished this phase of restoring the abandoned bunker.",project.location_id,actor]);
 await db.query("insert into con.game_audit(actor,action,entity,entity_id,after_state) values($1,'project.complete','project',$2,$3)",[actor,project.id,JSON.stringify({next_phase:next?.id||null})]);
 return {completed:true,next_project:next?.id||null};
}
export async function donateMaterial(pool,discordId,{projectId,item,quantity}){
 snowflake(discordId);uuid(projectId);qty(quantity);
 if(typeof item!=="string"||!/^[a-z_]{2,40}$/.test(item))throw Error("Invalid resource");
 return trx(pool,async db=>{
  const character=(await db.query("select id from con.game_characters where discord_id=$1",[discordId])).rows[0];
  if(!character)throw Error("Create your character before contributing");
  const bag=(await db.query("select id from con.game_storage where storage_type='carry' and owner_character_id=$1 for update",[character.id])).rows[0];
  if(!bag)throw Error("Carry inventory not found");
  const project=(await db.query("select * from con.game_projects where id=$1 for update",[projectId])).rows[0];
  if(!project||project.state!=="active")throw Error("Project not accepting contributions");
  const required=project.requirements?.[item];
  if(!Number.isSafeInteger(required)||required<=0)throw Error("This resource is not needed");
  const current=Number(project.progress?.[item]||0),remaining=required-current;
  if(remaining<=0)throw Error("Resource requirement already satisfied");
  if(quantity>remaining)throw Error("Only "+remaining+" more units required");
  const available=(await db.query("select quantity from con.game_inventory where storage_id=$1 and item_id=$2 for update",[bag.id,item])).rows[0];
  if(!available||BigInt(available.quantity)<BigInt(quantity))throw Error("Insufficient material in carry inventory");
  await db.query("update con.game_inventory set quantity=quantity-$3 where storage_id=$1 and item_id=$2",[bag.id,item,quantity]);
  await db.query("delete from con.game_inventory where storage_id=$1 and item_id=$2 and quantity=0",[bag.id,item]);
  const r=(await db.query("update con.game_projects set progress=jsonb_set(progress,ARRAY[$2],to_jsonb(coalesce((progress->>$2)::bigint,0)+$3::bigint),true) where id=$1 returning *",[project.id,item,quantity])).rows[0];
  await db.query("insert into con.game_storage_events(actor_discord_id,source_storage,item_id,quantity,purpose) values($1,$2,$3,$4,$5)",[discordId,bag.id,item,quantity,"Project construction: "+project.id]);
  await db.query("insert into con.game_audit(actor,action,entity,entity_id,after_state) values($1,'project.contribute','project',$2,$3)",[discordId,project.id,JSON.stringify({item,quantity})]);
  return {project_id:project.id,item,quantity,...await conclude(db,r,discordId)};
 });
}
export async function finalizeProject(pool,actor,owner,projectId){
 if(!owner)throw Error("Overseer only");uuid(projectId);
 return trx(pool,async db=>{
  const p=(await db.query("select * from con.game_projects where id=$1 for update",[projectId])).rows[0];
  if(!p||p.state!=="active")throw Error("Project not active");
  if(!sufficient(p))throw Error("Requirements have not been met");
  return conclude(db,p,actor);
 });
}
