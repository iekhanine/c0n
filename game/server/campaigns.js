import { ledgerTransfer, rollDice } from "./engine.js";
const assertId=(v)=>{if(typeof v!=="string"||!/^[0-9a-f-]{36}$/i.test(v))throw Error("Invalid ID");return v};
const assertSnowflake=v=>{if(typeof v!=="string"||!/^\d{17,20}$/.test(v))throw Error("Invalid Discord ID");return v};
const int=(n,max,label)=>{if(!Number.isSafeInteger(n)||n<0||n>max)throw Error("Invalid "+label);return n};
const text=(v,max,label)=>{if(typeof v!=="string"||!v.trim()||v.length>max)throw Error("Invalid "+label);return v.trim()};
async function tx(pool,fn){const db=await pool.connect();try{await db.query("BEGIN");const result=await fn(db);await db.query("COMMIT");return result}catch(e){await db.query("ROLLBACK");throw e}finally{db.release()}}
async function dmAllowed(db,actor,owner){if(owner)return true;const r=await db.query("select 1 from con.game_dungeon_masters where discord_id=$1 and enabled=true",[actor]);return r.rowCount>0}
async function canRun(db,actor,owner,campaignId){
 if(owner)return true;
 const r=await db.query("select 1 from con.game_campaigns c where c.id=$1 and c.dm_discord_id=$2 and exists(select 1 from con.game_dungeon_masters d where d.discord_id=$2 and d.enabled=true)",[campaignId,actor]);
 return r.rowCount>0;
}
export async function setDungeonMaster(pool,actor,owner,target,enabled){
 if(!owner)throw Error("Overseer only");
 assertSnowflake(target);
 return tx(pool,async db=>{
  const m=await db.query("select 1 from con.discord_members where discord_id=$1 and active=true and is_bot=false limit 1",[target]);
  if(!m.rowCount)throw Error("Discord member not active");
  const result=await db.query("insert into con.game_dungeon_masters(discord_id,enabled,granted_by) values($1,$2,$3) on conflict(discord_id) do update set enabled=$2,granted_by=$3,granted_at=now() returning *",[target,!!enabled,actor]);
  await db.query("insert into con.game_audit(actor,action,entity,entity_id,after_state) values($1,'dm.permission','dungeon_master',$2,$3)",[actor,target,JSON.stringify({enabled:!!enabled})]);
  return result.rows[0];
 });
}
export async function createCampaign(pool,actor,owner,input){
 assertSnowflake(actor);const title=text(input.title,150,"campaign title");
 const synopsis=typeof input.synopsis==="string"?input.synopsis.slice(0,3000):"";
 return tx(pool,async db=>{
  if(!await dmAllowed(db,actor,owner))throw Error("Dungeon Master permission required");
  const r=await db.query("insert into con.game_campaigns(title,synopsis,dm_discord_id) values($1,$2,$3) returning *",[title,synopsis,actor]);
  await db.query("insert into con.game_audit(actor,action,entity,entity_id,after_state) values($1,'campaign.create','campaign',$2,$3)",[actor,r.rows[0].id,JSON.stringify(r.rows[0])]);
  return r.rows[0];
 });
}
export async function changeCampaignState(pool,actor,owner,campaignId,newState){
 assertId(campaignId);
 if(!["draft","active","paused","complete"].includes(newState))throw Error("Invalid campaign state");
 return tx(pool,async db=>{
  if(!await canRun(db,actor,owner,campaignId))throw Error("Dungeon Master permission required");
  const r=await db.query("update con.game_campaigns set state=$2,updated_at=now() where id=$1 returning *",[campaignId,newState]);
  if(!r.rowCount)throw Error("Campaign not found");
  await db.query("insert into con.game_audit(actor,action,entity,entity_id,after_state) values($1,'campaign.state','campaign',$2,$3)",[actor,campaignId,JSON.stringify({state:newState})]);
  return r.rows[0];
 });
}
export async function joinCampaign(pool,actor,campaignId){
 assertId(campaignId);assertSnowflake(actor);
 return tx(pool,async db=>{
  const c=await db.query("select id from con.game_campaigns where id=$1 and state='active'",[campaignId]);
  if(!c.rowCount)throw Error("Campaign is not open");
  const p=await db.query("select id from con.game_characters where discord_id=$1",[actor]);
  if(!p.rowCount)throw Error("Create a character first");
  return (await db.query("insert into con.game_campaign_members(campaign_id,character_id,status) values($1,$2,'joined') on conflict(campaign_id,character_id) do update set status='joined',joined_at=now() returning *",[campaignId,p.rows[0].id])).rows[0];
 });
}
export async function startSession(pool,actor,owner,campaignId){
 assertId(campaignId);
 return tx(pool,async db=>{
  if(!await canRun(db,actor,owner,campaignId))throw Error("Dungeon Master permission required");
  const campaign=await db.query("select id,state from con.game_campaigns where id=$1 for update",[campaignId]);
  if(campaign.rows[0]?.state!=="active")throw Error("Activate campaign first");
  const active=await db.query("select id from con.game_sessions where campaign_id=$1 and started_at is not null and ended_at is null",[campaignId]);
  if(active.rowCount)throw Error("Session already running");
  return (await db.query("insert into con.game_sessions(campaign_id,started_at) values($1,now()) returning *",[campaignId])).rows[0];
 });
}
export async function joinSession(pool,actor,sessionId){
 assertId(sessionId);assertSnowflake(actor);
 return tx(pool,async db=>{
  const session=await db.query("select campaign_id,ended_at from con.game_sessions where id=$1 and started_at is not null",[sessionId]);
  if(!session.rowCount||session.rows[0].ended_at)throw Error("Session closed");
  const p=await db.query("select c.id from con.game_characters c join con.game_campaign_members m on m.character_id=c.id and m.campaign_id=$1 and m.status='joined' where c.discord_id=$2",[session.rows[0].campaign_id,actor]);
  if(!p.rowCount)throw Error("Join the campaign first");
  await db.query("insert into con.game_session_players(session_id,character_id) values($1,$2) on conflict do nothing",[sessionId,p.rows[0].id]);
  return {session_id:sessionId,character_id:p.rows[0].id};
 });
}
export async function rollForSession(pool,actor,sessionId,{sides,count=1,modifier=0,purpose=""}){
 assertId(sessionId);assertSnowflake(actor);
 const p=await pool.query("select c.id from con.game_characters c join con.game_session_players s on s.character_id=c.id join con.game_sessions gs on gs.id=s.session_id where c.discord_id=$1 and s.session_id=$2 and gs.ended_at is null and gs.started_at is not null",[actor,sessionId]);
 if(!p.rowCount)throw Error("Not a participant in an active session");
 return rollDice(pool,{sessionId,characterId:p.rows[0].id,sides,count,modifier,purpose});
}
export async function proposeAward(pool,actor,owner,sessionId,recipient,{xp,credits,items={}}){
 assertId(sessionId);assertSnowflake(recipient);int(xp,10000,"XP");int(credits,100000,"credits");
 if(!items||Array.isArray(items)||typeof items!=="object"||Object.keys(items).length>12)throw Error("Invalid reward items");
 for(const [name,qty] of Object.entries(items)){if(!/^[a-z_]{2,40}$/.test(name))throw Error("Invalid item ID");if(!Number.isInteger(qty)||qty<1||qty>100)throw Error("Invalid item quantity")}
 return tx(pool,async db=>{
  const s=await db.query("select campaign_id from con.game_sessions where id=$1",[sessionId]);if(!s.rowCount)throw Error("Session not found");
  if(!await canRun(db,actor,owner,s.rows[0].campaign_id))throw Error("Dungeon Master permission required");
  const c=await db.query("select id from con.game_characters where discord_id=$1",[recipient]);if(!c.rowCount)throw Error("Recipient needs a character");
  return (await db.query("insert into con.game_dm_awards(session_id,character_id,xp,credits,items,granted_by) values($1,$2,$3,$4,$5::jsonb,$6) returning *",[sessionId,c.rows[0].id,xp,credits,JSON.stringify(items),actor])).rows[0];
 });
}
export async function applyAward(pool,actor,owner,awardId){
 if(!owner)throw Error("Overseer approval required");assertId(awardId);
 return tx(pool,async db=>{
  const q=await db.query("select * from con.game_dm_awards where id=$1 for update",[awardId]);
  if(!q.rowCount)throw Error("Award not found");const award=q.rows[0];
  if(award.status==="applied")return {status:"already_applied"};
  if(award.status!=="pending")throw Error("Award not pending");
  const values=Object.entries(award.items||{});
  const carry=await db.query("select id,capacity from con.game_storage where storage_type='carry' and owner_character_id=$1 for update",[award.character_id]);
  if(!carry.rowCount)throw Error("Recipient carry storage missing");
  const current=await db.query("select coalesce(sum(quantity),0)::bigint total from con.game_inventory where storage_id=$1",[carry.rows[0].id]);
  const added=values.reduce((s,[,n])=>s+Number(n),0);
  if(BigInt(current.rows[0].total)+BigInt(added)>BigInt(carry.rows[0].capacity))throw Error("Recipient inventory full");
  for(const [item,quantity] of values){
   const known=await db.query("select id from con.game_items where id=$1",[item]);if(!known.rowCount)throw Error("Unknown reward item: "+item);
   await db.query("insert into con.game_inventory(storage_id,item_id,quantity) values($1,$2,$3) on conflict(storage_id,item_id) do update set quantity=con.game_inventory.quantity+excluded.quantity",[carry.rows[0].id,item,quantity]);
  }
  if(award.credits>0){
   const wallets=await db.query("select id,account_type,character_id from con.game_accounts where account_type='treasury' or character_id=$1",[award.character_id]);
   const treasury=wallets.rows.find(x=>x.account_type==="treasury"),resident=wallets.rows.find(x=>x.character_id===award.character_id);
   if(!treasury||!resident)throw Error("Accounts missing");
   await ledgerTransfer(db,{from:treasury.id,to:resident.id,amount:Number(award.credits),key:"dm:"+award.id,actor,reason:"Overseer-approved DM award"});
  }
  if(award.xp>0)await db.query("update con.game_characters set xp=xp+$2 where id=$1",[award.character_id,award.xp]);
  await db.query("update con.game_dm_awards set status='applied',approved_by=$2 where id=$1",[award.id,actor]);
  await db.query("insert into con.game_audit(actor,action,entity,entity_id,after_state) values($1,'dm.award.apply','dm_award',$2,$3)",[actor,award.id,JSON.stringify({xp:award.xp,credits:award.credits,items:award.items})]);
  return {status:"applied",xp:award.xp,credits:award.credits,items:award.items};
 });
}
