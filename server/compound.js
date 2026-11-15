import { randomUUID } from "node:crypto";
import { readSession, accessFor, json } from "./auth.js";
import { database } from "./db.js";
import { hasActiveMembership } from "./membership.js";
const GAME_ORIGIN = "https://thecompound.cultofnixon.com";
class Fault extends Error { constructor(status, message) { super(message); this.status=status; } }
const bad=(status,message)=>{throw new Fault(status,message);};
const snowflake = value => typeof value==="string" && /^\d{17,20}$/.test(value);
const unit = value => typeof value==="string" && /^F[1-4]-0[1-8]$/.test(value);
const simple = value => String(value||"").slice(0,80);
const admin = access => access.owner === true || (access.authorized && ["admin","moderator"].includes(access.access));
let schemaReady;
async function schema(db) {
 await db.query(`CREATE SCHEMA IF NOT EXISTS con;
 CREATE TABLE IF NOT EXISTS con.compound_profiles (
 discord_id text PRIMARY KEY, display_name text NOT NULL,
 xp integer NOT NULL DEFAULT 0 CHECK(xp>=0), activity_xp integer NOT NULL DEFAULT 0, manual_xp integer NOT NULL DEFAULT 0, trivia_xp integer NOT NULL DEFAULT 0, health integer NOT NULL DEFAULT 100 CHECK(health BETWEEN 0 AND 100),
 stamina integer NOT NULL DEFAULT 100 CHECK(stamina BETWEEN 0 AND 100),
 skill integer NOT NULL DEFAULT 5 CHECK(skill BETWEEN 0 AND 100),
 charisma integer NOT NULL DEFAULT 5 CHECK(charisma BETWEEN 0 AND 100),
 intellect integer NOT NULL DEFAULT 5 CHECK(intellect BETWEEN 0 AND 100),
 luck integer NOT NULL DEFAULT 5 CHECK(luck BETWEEN 0 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
 ALTER TABLE con.compound_profiles ADD COLUMN IF NOT EXISTS activity_xp integer NOT NULL DEFAULT 0;
 ALTER TABLE con.compound_profiles ADD COLUMN IF NOT EXISTS manual_xp integer NOT NULL DEFAULT 0;
 ALTER TABLE con.compound_profiles ADD COLUMN IF NOT EXISTS trivia_xp integer NOT NULL DEFAULT 0;
 ALTER TABLE con.compound_profiles ADD COLUMN IF NOT EXISTS charisma_activity_awarded integer NOT NULL DEFAULT 0;
 CREATE TABLE IF NOT EXISTS con.compound_rules (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), message_xp integer NOT NULL DEFAULT 5 CHECK(message_xp BETWEEN 0 AND 100),
 reaction_xp integer NOT NULL DEFAULT 1 CHECK(reaction_xp BETWEEN 0 AND 100),
 daily_message_cap integer NOT NULL DEFAULT 20 CHECK(daily_message_cap BETWEEN 0 AND 500),
 daily_reaction_cap integer NOT NULL DEFAULT 15 CHECK(daily_reaction_cap BETWEEN 0 AND 500));
 INSERT INTO con.compound_rules(id) VALUES(true) ON CONFLICT DO NOTHING;
 CREATE TABLE IF NOT EXISTS con.compound_apartments (
 id text PRIMARY KEY, floor integer NOT NULL, unit integer NOT NULL,
 capacity integer NOT NULL DEFAULT 2 CHECK(capacity BETWEEN 1 AND 8),
 locked boolean NOT NULL DEFAULT false);
 CREATE TABLE IF NOT EXISTS con.compound_residency (
 discord_id text PRIMARY KEY REFERENCES con.compound_profiles(discord_id) ON DELETE CASCADE,
 apartment_id text NOT NULL REFERENCES con.compound_apartments(id),
 assigned_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS compound_residence_apartment ON con.compound_residency(apartment_id);
 CREATE TABLE IF NOT EXISTS con.compound_requests (
 id uuid PRIMARY KEY, requester_id text NOT NULL REFERENCES con.compound_profiles(discord_id),
 apartment_id text NOT NULL REFERENCES con.compound_apartments(id),
 kind text NOT NULL CHECK(kind IN ('transfer','roommate')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),
 staff_approved boolean NOT NULL DEFAULT false,
 consents jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz);
 CREATE INDEX IF NOT EXISTS compound_requests_open ON con.compound_requests(status, created_at);
 CREATE TABLE IF NOT EXISTS con.compound_audit (
 id uuid PRIMARY KEY, actor_id text NOT NULL, action text NOT NULL, subject_id text,
 details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS con.compound_progress_events (
 source_key text PRIMARY KEY, discord_id text NOT NULL REFERENCES con.compound_profiles(discord_id),
 source text NOT NULL, description text NOT NULL,
 xp_delta integer NOT NULL DEFAULT 0, charisma_delta integer NOT NULL DEFAULT 0,
 intellect_delta integer NOT NULL DEFAULT 0,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 recorded_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS compound_progress_history ON con.compound_progress_events(discord_id,occurred_at DESC);
 CREATE TABLE IF NOT EXISTS con.compound_trivia_matches (
 id uuid PRIMARY KEY, guild_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS con.compound_trivia_results (
 match_id uuid NOT NULL REFERENCES con.compound_trivia_matches(id),
 discord_id text NOT NULL REFERENCES con.compound_profiles(discord_id),
 correct integer NOT NULL CHECK(correct BETWEEN 0 AND 100),
 max_streak integer NOT NULL CHECK(max_streak BETWEEN 0 AND 100),
 xp_awarded integer NOT NULL CHECK(xp_awarded BETWEEN 0 AND 525),
 intellect_awarded integer NOT NULL CHECK(intellect_awarded BETWEEN 0 AND 33),
 PRIMARY KEY(match_id,discord_id));
 ALTER TABLE con.compound_profiles ENABLE ROW LEVEL SECURITY;
 ALTER TABLE con.compound_rules ENABLE ROW LEVEL SECURITY;
 ALTER TABLE con.compound_apartments ENABLE ROW LEVEL SECURITY;
 ALTER TABLE con.compound_residency ENABLE ROW LEVEL SECURITY;
 ALTER TABLE con.compound_requests ENABLE ROW LEVEL SECURITY;
 ALTER TABLE con.compound_audit ENABLE ROW LEVEL SECURITY;
 ALTER TABLE con.compound_progress_events ENABLE ROW LEVEL SECURITY;
 ALTER TABLE con.compound_trivia_results DROP CONSTRAINT IF EXISTS compound_trivia_results_correct_check;
 ALTER TABLE con.compound_trivia_results DROP CONSTRAINT IF EXISTS compound_trivia_results_max_streak_check;
 ALTER TABLE con.compound_trivia_results DROP CONSTRAINT IF EXISTS compound_trivia_results_xp_awarded_check;
 ALTER TABLE con.compound_trivia_results DROP CONSTRAINT IF EXISTS compound_trivia_results_intellect_awarded_check;
 ALTER TABLE con.compound_trivia_results ADD CONSTRAINT compound_trivia_results_correct_check CHECK(correct BETWEEN 0 AND 100);
 ALTER TABLE con.compound_trivia_results ADD CONSTRAINT compound_trivia_results_max_streak_check CHECK(max_streak BETWEEN 0 AND 100);
 ALTER TABLE con.compound_trivia_results ADD CONSTRAINT compound_trivia_results_xp_awarded_check CHECK(xp_awarded BETWEEN 0 AND 525);
 ALTER TABLE con.compound_trivia_results ADD CONSTRAINT compound_trivia_results_intellect_awarded_check CHECK(intellect_awarded BETWEEN 0 AND 33);
 ALTER TABLE con.compound_trivia_matches ENABLE ROW LEVEL SECURITY;
 ALTER TABLE con.compound_trivia_results ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON con.compound_profiles,con.compound_rules,con.compound_apartments,con.compound_residency,con.compound_requests,con.compound_audit,con.compound_progress_events,con.compound_trivia_matches,con.compound_trivia_results FROM PUBLIC, anon, authenticated;
`);
 await db.query("INSERT INTO con.compound_apartments(id,floor,unit) SELECT 'F'||f||'-0'||n,f,n FROM generate_series(1,4) AS f CROSS JOIN generate_series(1,8) AS n ON CONFLICT DO NOTHING");
}
export async function ensureCompoundSchema(db){
 if(!schemaReady)schemaReady=schema(db).catch(e=>{schemaReady=null;throw e;});
 return schemaReady;
}
export async function applyTriviaResults(db,client,b){
 if(typeof b.match_id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.match_id))
  bad(400,"Invalid match identifier.");
 if(!Array.isArray(b.results)||b.results.length>100)bad(400,"Invalid trivia results.");
 const ids=new Set();
 for(const r of b.results){
  if(!snowflake(r.id)||typeof r.name!=="string"||!r.name.trim()||r.name.length>80||!Number.isInteger(r.correct)||r.correct<0||r.correct>100
    ||!Number.isInteger(r.max_streak)||r.max_streak<0||r.max_streak>r.correct||ids.has(r.id))bad(400,"Invalid trivia player result.");
  ids.add(r.id);
 }
 const first=await client.query("INSERT INTO con.compound_trivia_matches(id,guild_id)VALUES($1,$2)ON CONFLICT DO NOTHING RETURNING id",[b.match_id,b.guild_id]);
 if(!first.rowCount)return {ok:true,duplicate:true,awarded:0};
 const high=Math.max(0,...b.results.map(r=>r.correct));
 for(const r of b.results){
  const xp=r.correct*5+(high>0&&r.correct===high?25:0);
  const intellect=Math.floor(r.max_streak/3);
  await client.query("INSERT INTO con.compound_profiles(discord_id,display_name)VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET display_name=EXCLUDED.display_name",[r.id,r.name.trim()]);
  await client.query("INSERT INTO con.compound_trivia_results(match_id,discord_id,correct,max_streak,xp_awarded,intellect_awarded)VALUES($1,$2,$3,$4,$5,$6)",[b.match_id,r.id,r.correct,r.max_streak,xp,intellect]);
  await client.query("UPDATE con.compound_profiles SET trivia_xp=LEAST(1000000,trivia_xp+$2), xp=LEAST(1000000,GREATEST(0,activity_xp+manual_xp+trivia_xp+$2)),intellect=LEAST(100,intellect+$3),updated_at=now() WHERE discord_id=$1",[r.id,xp,intellect]);
 }
 return {ok:true,awarded:b.results.length,match_id:b.match_id};
}
async function audit(db, actor, action, subject, details={}) {
 await db.query("INSERT INTO con.compound_audit(id,actor_id,action,subject_id,details) VALUES ($1,$2,$3,$4,$5)",[randomUUID(),actor,action,subject,JSON.stringify(details)]);
}
async function profile(db,user) {
 await db.query("INSERT INTO con.compound_profiles(discord_id,display_name) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET display_name=EXCLUDED.display_name",
  [user.id,simple(user.name||user.username)]);
 let earned=0;
 try {
  const {rows}=await db.query(`WITH rules AS (SELECT * FROM con.compound_rules WHERE id=true),
  daily AS (SELECT date_trunc('day',e.occurred_at) AS day,
  LEAST(count(*) FILTER(WHERE e.event_type='message'),max(r.daily_message_cap))::integer AS messages,
  LEAST(count(*) FILTER(WHERE e.event_type='reaction'),max(r.daily_reaction_cap))::integer AS reactions,
  max(r.message_xp)::integer AS mxp,max(r.reaction_xp)::integer AS rxp
  FROM con.discord_participation_events e CROSS JOIN rules r
  WHERE e.user_id=$1 AND e.onboarding=false
  AND e.guild_id=(SELECT guild_id FROM con.discord_settings WHERE id=true)
  GROUP BY date_trunc('day',e.occurred_at))
  SELECT coalesce(sum(messages*mxp+reactions*rxp),0)::integer AS earned FROM daily`,[user.id]);
  earned=Math.max(0,Number(rows[0]?.earned)||0);
 } catch(e) {
  if(e.code!=="42P01")throw e;
  // Bot participation tables not initialized yet; keep previously earned XP.
  const prev=await db.query("SELECT activity_xp FROM con.compound_profiles WHERE discord_id=$1",[user.id]);
  earned=Number(prev.rows[0]?.activity_xp)||0;
 }
 const {rows}=await db.query(`UPDATE con.compound_profiles SET activity_xp=$2,
 xp=GREATEST(0,LEAST(1000000,$2+manual_xp+trivia_xp)),updated_at=now() WHERE discord_id=$1
 RETURNING *, 1+floor(xp/250.0)::integer AS level`,[user.id,earned]);
 return rows[0];
}
async function occupants(db,apt) {
 const {rows}=await db.query(`SELECT r.discord_id,p.display_name,p.xp FROM con.compound_residency r
 JOIN con.compound_profiles p ON p.discord_id=r.discord_id WHERE r.apartment_id=$1 ORDER BY r.assigned_at`,[apt]);
 return rows;
}
async function finalize(db,request,actor) {
 if(!request.staff_approved || request.status!=="pending") return false;
 const people=await occupants(db,request.apartment_id);
 if(request.kind==="roommate" && people.some(p=>request.consents[p.discord_id]!==true))return false;
 const {rows:[apt]}=await db.query("SELECT capacity,locked FROM con.compound_apartments WHERE id=$1 FOR UPDATE",[request.apartment_id]);
 if(!apt || apt.locked || people.length>=apt.capacity)bad(409,"The apartment is unavailable or full.");
 await db.query("INSERT INTO con.compound_residency(discord_id,apartment_id) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET apartment_id=EXCLUDED.apartment_id,assigned_at=now()",[request.requester_id,request.apartment_id]);
 await db.query("UPDATE con.compound_requests SET status='approved',decided_at=now() WHERE id=$1",[request.id]);
 await audit(db,actor,"housing.approved",request.requester_id,{request_id:request.id,apartment_id:request.apartment_id});
 return true;
}
export default async function compoundHandler(req,res) {
 const origin=req.headers.origin;
 res.setHeader("Vary","Origin, Cookie");
 res.setHeader("Cache-Control","private, no-store");
 if(origin===GAME_ORIGIN) {
  res.setHeader("Access-Control-Allow-Origin",GAME_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials","true");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
 }
 if(req.method==="OPTIONS"){res.statusCode=origin===GAME_ORIGIN?204:403;return res.end();}
 if(!["GET","POST"].includes(req.method))return json(res,405,{error:"Unsupported method."});
 if(req.method==="POST" && origin!==GAME_ORIGIN)return json(res,403,{error:"Invalid request origin."});
 const session=await readSession(req);
 if(!session)return json(res,401,{error:"Sign in with Discord first.",login_url:"https://cultofnixon.com/api/auth/discord/login?next=compound"});
 try {
  const access=await accessFor(session);
  const isAdmin=admin(access);
  const db=database();
  await ensureCompoundSchema(db);
  if (!access.owner) {
    const botMember=await db.query("SELECT 1 FROM con.discord_members WHERE discord_id=$1 AND active=true AND is_bot=false LIMIT 1",[session.user.id]).catch(e=>{if(e.code==="42P01")return {rows:[]};throw e;});
    if(!botMember.rows.length && !await hasActiveMembership(session.user,db))return json(res,403,{error:"An active C0N membership or verified Discord server membership is required."});
  }
  const current=await profile(db,session.user);
  const rawAction=new URL(req.url,"https://cultofnixon.com").searchParams.get("action")||"compound_me";
  const action=rawAction.startsWith("compound_")?rawAction.slice(9):rawAction;
  if(req.method==="GET") {
   if(action==="me"){
    const {rows:[home]}=await db.query("SELECT apartment_id,assigned_at FROM con.compound_residency WHERE discord_id=$1",[session.user.id]);
    return json(res,200,{user:session.user,profile:current,home:home||null,is_admin:isAdmin});
   }
   if(action==="apartments"){
    const {rows}=await db.query(`SELECT a.*,COALESCE(json_agg(json_build_object('id',p.discord_id,'name',p.display_name,'xp',p.xp)) FILTER(WHERE p.discord_id IS NOT NULL),'[]'::json) AS occupants
    FROM con.compound_apartments a LEFT JOIN con.compound_residency r ON r.apartment_id=a.id
    LEFT JOIN con.compound_profiles p ON p.discord_id=r.discord_id GROUP BY a.id ORDER BY a.floor DESC,a.unit`);
    return json(res,200,{apartments:rows});
   }
   if(action==="requests"){
    const {rows}=await db.query(`SELECT q.*,p.display_name AS requester_name FROM con.compound_requests q JOIN con.compound_profiles p ON p.discord_id=q.requester_id
    WHERE $1::boolean OR q.requester_id=$2 OR EXISTS(SELECT 1 FROM con.compound_residency r WHERE r.apartment_id=q.apartment_id AND r.discord_id=$2)
    ORDER BY q.created_at DESC LIMIT 150`,[isAdmin,session.user.id]);
    return json(res,200,{requests:rows});
   }
   if(action==="residents"){
    if(!isAdmin)bad(403,"Staff access required.");
    await db.query(`INSERT INTO con.compound_profiles(discord_id,display_name)
      SELECT dm.discord_id,dm.name FROM con.discord_members dm
      JOIN con.discord_settings ds ON ds.guild_id=dm.guild_id AND ds.id=true
      WHERE dm.active=true AND dm.is_bot=false
      ON CONFLICT(discord_id) DO NOTHING`).catch(e=>{if(e.code!=="42P01")throw e;});
    const {rows}=await db.query(`SELECT p.*,1+floor(p.xp/250.0)::integer AS level,r.apartment_id FROM con.compound_profiles p LEFT JOIN con.compound_residency r ON r.discord_id=p.discord_id ORDER BY p.display_name LIMIT 500`);
    return json(res,200,{residents:rows});
   }
   if(action==="rules"){
    const {rows:[rules]}=await db.query("SELECT message_xp,reaction_xp,daily_message_cap,daily_reaction_cap FROM con.compound_rules WHERE id=true");
    return json(res,200,{rules});
   }
   if(action==="audit"){
    if(!isAdmin)bad(403,"Staff access required.");
    const {rows}=await db.query("SELECT * FROM con.compound_audit ORDER BY created_at DESC LIMIT 150");
    return json(res,200,{events:rows});
   }
   bad(404,"Unknown operation.");
  }
  const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):req.body||{};
  if(JSON.stringify(body).length>5000)bad(413,"Request too large.");
  if(action==="claim" || action==="request" || action==="consent" || action==="decision" || action==="adjust" || action==="rules" || action==="apartment" || action==="place" || action==="unassign"){
   const client=await db.connect();
   try {
    await client.query("BEGIN");
    let result={ok:true};
    if(action==="apartment"){
      if(!isAdmin)bad(403,"Staff access required.");
      if(!unit(body.apartment_id)||typeof body.locked!=="boolean"||!Number.isInteger(body.capacity)||body.capacity<1||body.capacity>8)bad(400,"Invalid apartment settings.");
      const {rows:[a]}=await client.query("SELECT * FROM con.compound_apartments WHERE id=$1 FOR UPDATE",[body.apartment_id]);
      if(!a)bad(404,"Apartment not found.");
      const people=await occupants(client,body.apartment_id);
      if(people.length>body.capacity)bad(409,"Capacity cannot be smaller than current occupancy.");
      await client.query("UPDATE con.compound_apartments SET capacity=$2,locked=$3 WHERE id=$1",[body.apartment_id,body.capacity,body.locked]);
      await audit(client,session.user.id,"apartment.updated",null,{apartment_id:body.apartment_id,capacity:body.capacity,locked:body.locked});
    } else if(action==="place"){
      if(!isAdmin)bad(403,"Staff access required.");
      if(!unit(body.apartment_id)||!snowflake(body.discord_id))bad(400,"Invalid resident or apartment.");
      const {rows:[a]}=await client.query("SELECT * FROM con.compound_apartments WHERE id=$1 FOR UPDATE",[body.apartment_id]);
      if(!a||a.locked)bad(409,"Apartment unavailable.");
      const people=await occupants(client,body.apartment_id);
      if(people.length)bad(409,"Occupied apartments require unanimous roommate approval. Use a housing request.");
      const exists=await client.query("SELECT 1 FROM con.compound_profiles WHERE discord_id=$1",[body.discord_id]);
      if(!exists.rowCount)bad(404,"Resident not found.");
      await client.query("INSERT INTO con.compound_residency(discord_id,apartment_id) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET apartment_id=EXCLUDED.apartment_id,assigned_at=now()",[body.discord_id,body.apartment_id]);
      await audit(client,session.user.id,"housing.staff_assigned",body.discord_id,{apartment_id:body.apartment_id});
    } else if(action==="unassign"){
      if(!isAdmin)bad(403,"Staff access required.");
      if(!snowflake(body.discord_id))bad(400,"Invalid resident.");
      const old=await client.query("DELETE FROM con.compound_residency WHERE discord_id=$1 RETURNING apartment_id",[body.discord_id]);
      if(!old.rowCount)bad(404,"Resident has no apartment.");
      await audit(client,session.user.id,"housing.unassigned",body.discord_id,{apartment_id:old.rows[0].apartment_id});
    } else     if(action==="rules"){
      if(!isAdmin)bad(403,"Staff access required.");
      const fields=["message_xp","reaction_xp","daily_message_cap","daily_reaction_cap"];
      for(const field of fields)if(!Number.isInteger(body[field])||body[field]<0||body[field]>(field.includes("cap")?500:100))bad(400,"Invalid XP rule.");
      await client.query("UPDATE con.compound_rules SET message_xp=$1,reaction_xp=$2,daily_message_cap=$3,daily_reaction_cap=$4 WHERE id=true",fields.map(f=>body[f]));
      await audit(client,session.user.id,"rules.updated",null,body);
    } else if(action==="claim"){
      if(!unit(body.apartment_id))bad(400,"Invalid apartment.");
      const apt=body.apartment_id;
      const {rows:[a]}=await client.query("SELECT * FROM con.compound_apartments WHERE id=$1 FOR UPDATE",[apt]);
      if(!a||a.locked)bad(409,"Apartment unavailable.");
      const {rows:[existing]}=await client.query("SELECT apartment_id FROM con.compound_residency WHERE discord_id=$1 FOR UPDATE",[session.user.id]);
      if(existing)bad(409,"You already have an apartment. Request a transfer instead.");
      const people=await occupants(client,apt);
      if(people.length)bad(409,"Occupied apartments require a roommate request.");
      await client.query("INSERT INTO con.compound_residency(discord_id,apartment_id) VALUES($1,$2)",[session.user.id,apt]);
      await audit(client,session.user.id,"housing.claimed",session.user.id,{apartment_id:apt});
    } else if(action==="request"){
      if(!unit(body.apartment_id))bad(400,"Invalid apartment.");
      const apt=body.apartment_id;
      const {rows:[a]}=await client.query("SELECT * FROM con.compound_apartments WHERE id=$1 FOR UPDATE",[apt]);
      if(!a||a.locked)bad(409,"Apartment unavailable.");
      const people=await occupants(client,apt);
      if(people.some(p=>p.discord_id===session.user.id))bad(409,"You already occupy this apartment.");
      if(people.length>=a.capacity)bad(409,"Apartment full.");
      const {rows:[pending]}=await client.query("SELECT id FROM con.compound_requests WHERE requester_id=$1 AND status='pending' FOR UPDATE",[session.user.id]);
      if(pending)bad(409,"You already have a pending housing request.");
      const kind=people.length?"roommate":"transfer";
      const id=randomUUID();
      await client.query("INSERT INTO con.compound_requests(id,requester_id,apartment_id,kind) VALUES($1,$2,$3,$4)",[id,session.user.id,apt,kind]);
      await audit(client,session.user.id,"housing.requested",session.user.id,{request_id:id,kind,apartment_id:apt});
      result.request_id=id;
    } else if(action==="consent" || action==="decision"){
      if(typeof body.id!=="string"||! /^[0-9a-f-]{36}$/i.test(body.id))bad(400,"Invalid request ID.");
      const {rows:[q]}=await client.query("SELECT * FROM con.compound_requests WHERE id=$1 FOR UPDATE",[body.id]);
      if(!q||q.status!=="pending")bad(409,"Request is no longer pending.");
      await client.query("SELECT id FROM con.compound_apartments WHERE id=$1 FOR UPDATE",[q.apartment_id]);
      if(action==="consent"){
        const people=await occupants(client,q.apartment_id);
        if(!people.some(p=>p.discord_id===session.user.id)||q.requester_id===session.user.id)bad(403,"Only existing occupants may consent.");
        if(body.approve!==true){await client.query("UPDATE con.compound_requests SET status='denied',decided_at=now() WHERE id=$1",[q.id]);await audit(client,session.user.id,"housing.denied",q.requester_id,{request_id:q.id});}
        else{const consents={...q.consents,[session.user.id]:true};await client.query("UPDATE con.compound_requests SET consents=$2 WHERE id=$1",[q.id,JSON.stringify(consents)]);q.consents=consents;result.finalized=await finalize(client,q,session.user.id);}
      } else {
        if(!isAdmin)bad(403,"Staff approval required.");
        if(body.approve!==true){await client.query("UPDATE con.compound_requests SET status='denied',decided_at=now() WHERE id=$1",[q.id]);await audit(client,session.user.id,"housing.denied",q.requester_id,{request_id:q.id});}
        else{await client.query("UPDATE con.compound_requests SET staff_approved=true WHERE id=$1",[q.id]);q.staff_approved=true;result.finalized=await finalize(client,q,session.user.id);}
      }
    } else if(action==="adjust"){
      if(!isAdmin)bad(403,"Staff access required.");
      if(!snowflake(body.discord_id))bad(400,"Invalid member ID.");
      const allowed=["xp","health","stamina","skill","charisma","intellect","luck"];
      if(!allowed.includes(body.field)||!Number.isInteger(body.value))bad(400,"Invalid attribute.");
      const max=body.field==="xp"?1000000:100;
      if(body.value<0||body.value>max)bad(400,"Attribute outside allowed range.");
      const field=body.field;
      const {rowCount}=field==="xp"
        ? await client.query("UPDATE con.compound_profiles SET manual_xp=$2-activity_xp-trivia_xp,xp=$2,updated_at=now() WHERE discord_id=$1",[body.discord_id,body.value])
        : await client.query("UPDATE con.compound_profiles SET "+field+"=$2,updated_at=now() WHERE discord_id=$1",[body.discord_id,body.value]);
      if(!rowCount)bad(404,"Member not found.");
      await audit(client,session.user.id,"profile.adjusted",body.discord_id,{field,value:body.value});
    }
    await client.query("COMMIT");
    return json(res,200,result);
   }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  }
  bad(404,"Unknown operation.");
 }catch(e) {
  if(!(e instanceof Fault))console.error("Compound operation failure",{code:e?.code||"unknown"});
  return json(res,e instanceof Fault?e.status:503,{error:e instanceof Fault?e.message:"Compound service unavailable. Try again."});
 }
}
