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
  await client.query("INSERT INTO con.compound_progress_events(source_key,discord_id,source,description,xp_delta,intellect_delta,details) VALUES($1,$2,'trivia',$3,$4,$5,$6) ON CONFLICT(source_key) DO NOTHING",
   ["trivia:"+b.match_id+":"+r.id,r.id,"Trivia: "+r.correct+" correct",xp,intellect,JSON.stringify({match_id:b.match_id,correct:r.correct,max_streak:r.max_streak})]);
  await client.query("UPDATE con.compound_profiles SET trivia_xp=LEAST(1000000,trivia_xp+$2), xp=LEAST(1000000,GREATEST(0,activity_xp+manual_xp+trivia_xp+$2)),intellect=LEAST(100,intellect+$3),updated_at=now() WHERE discord_id=$1",[r.id,xp,intellect]);
 }
 return {ok:true,awarded:b.results.length,match_id:b.match_id};
}
async function audit(db, actor, action, subject, details={}) {
 await db.query("INSERT INTO con.compound_audit(id,actor_id,action,subject_id,details) VALUES ($1,$2,$3,$4,$5)",[randomUUID(),actor,action,subject,JSON.stringify(details)]);
}
// Backfill credits from events the bot recorded even before first website sign-in.
export async function reconcileCompoundProgress(db,userId) {
 if(!snowflake(userId))bad(400,"Invalid Discord ID.");
 try {
  await db.query(`WITH ordered AS (
    SELECT e.guild_id,e.event_id,e.event_type,e.channel_id,e.user_id,e.occurred_at,
    row_number() OVER (
      PARTITION BY e.user_id,e.event_type,(e.occurred_at AT TIME ZONE 'UTC')::date
      ORDER BY e.occurred_at,e.event_id
    ) AS daily_rank
    FROM con.discord_participation_events e
    WHERE e.user_id=$1 AND e.onboarding=false
    AND e.guild_id=(SELECT guild_id FROM con.discord_settings WHERE id=true)
   ), eligible AS (
    SELECT e.*,CASE WHEN event_type='message' THEN r.message_xp ELSE r.reaction_xp END AS amount
    FROM ordered e CROSS JOIN con.compound_rules r
    WHERE r.id=true
      AND ((e.event_type='message' AND e.daily_rank<=r.daily_message_cap)
        OR (e.event_type='reaction' AND e.daily_rank<=r.daily_reaction_cap))
   ), credited AS (
    SELECT e.*,row_number() OVER (PARTITION BY user_id,event_type ORDER BY occurred_at,event_id) AS lifetime_rank
    FROM eligible e
   )
   INSERT INTO con.compound_progress_events
    (source_key,discord_id,source,description,xp_delta,charisma_delta,details,occurred_at)
   SELECT 'discord:'||guild_id||':'||event_type||':'||event_id||':'||user_id,
    user_id,event_type,
    CASE WHEN event_type='message' THEN 'Discord message' ELSE 'Discord reaction' END,
    amount,CASE WHEN event_type='message' AND lifetime_rank % 10=0 THEN 1 ELSE 0 END,
    jsonb_build_object('channel_id',channel_id,'event_id',event_id),occurred_at
   FROM credited ON CONFLICT(source_key) DO NOTHING`,[userId]);
 } catch(e){if(e.code!=="42P01")throw e;}
 await db.query("INSERT INTO con.compound_progress_events(source_key,discord_id,source,description,xp_delta,details) SELECT 'legacy:staff-xp:'||discord_id,discord_id,'admin','Prior staff XP adjustment',manual_xp,jsonb_build_object('previous',true) FROM con.compound_profiles WHERE discord_id=$1 AND manual_xp<>0 ON CONFLICT(source_key) DO NOTHING",[userId]);
 await db.query(`INSERT INTO con.compound_progress_events
 (source_key,discord_id,source,description,xp_delta,intellect_delta,details,occurred_at)
 SELECT 'trivia:'||r.match_id||':'||r.discord_id,r.discord_id,'trivia',
 'Trivia: '||r.correct||' correct',r.xp_awarded,r.intellect_awarded,
 jsonb_build_object('match_id',r.match_id,'correct',r.correct,'max_streak',r.max_streak),
 m.created_at FROM con.compound_trivia_results r JOIN con.compound_trivia_matches m ON m.id=r.match_id
 WHERE r.discord_id=$1 ON CONFLICT(source_key) DO NOTHING`,[userId]);
 return (await db.query(`SELECT
 COALESCE(sum(xp_delta) FILTER(WHERE source IN ('message','reaction')),0)::integer AS activity_xp,
 COALESCE(sum(charisma_delta) FILTER(WHERE source IN ('message','reaction')),0)::integer AS charisma_earned
 FROM con.compound_progress_events WHERE discord_id=$1`,[userId])).rows[0];
}
async function profile(db,user) {
 await db.query("INSERT INTO con.compound_profiles(discord_id,display_name) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET display_name=EXCLUDED.display_name",
  [user.id,simple(user.name||user.username)]);
 const totals=await reconcileCompoundProgress(db,user.id);
 const earned=Math.max(0,Number(totals.activity_xp)||0);
 const charismaEarned=Math.max(0,Number(totals.charisma_earned)||0);
 const {rows}=await db.query(`UPDATE con.compound_profiles SET activity_xp=$2,
 xp=GREATEST(0,LEAST(1000000,$2+manual_xp+trivia_xp)),
 charisma=GREATEST(0,LEAST(100,charisma+$3-charisma_activity_awarded)),
 charisma_activity_awarded=$3,updated_at=now() WHERE discord_id=$1
 RETURNING *, 1+floor(xp/250.0)::integer AS level`,[user.id,earned,charismaEarned]);
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
export async function publicCompoundProfile(db,id) {
 const {rows:[member]}=await db.query(`SELECT dm.discord_id,dm.name,dm.avatar,dm.joined_at FROM con.discord_members dm
 JOIN con.discord_settings ds ON ds.guild_id=dm.guild_id AND ds.id=true
 WHERE dm.discord_id=$1 AND dm.active=true AND dm.is_bot=false`,[id]);
 if(!member)bad(404,"Resident not found.");
 const stats=await profile(db,{id,name:member.name});
 const {rows:[residence]}=await db.query("SELECT apartment_id FROM con.compound_residency WHERE discord_id=$1",[id]);
 let membership=null;
 if((await db.query("SELECT to_regclass('con.memberships') IS NOT NULL AS exists")).rows[0]?.exists){
  membership=(await db.query("SELECT member_no,codename,joined_at,active FROM con.memberships WHERE user_id=$1 AND active=true",[id])).rows[0]||null;
 }
 const {rows:[activeJob]}=await db.query(`SELECT p.title,p.objective,p.job_location,p.channel_id,
  a.state,a.due_at,a.started_at,a.salary_credits,a.xp_reward
  FROM con.workshop_assignments a JOIN con.workshop_job_posts p ON p.id=a.post_id
  WHERE a.discord_id=$1 AND a.state IN ('working','awaiting_confirmation')
  ORDER BY a.started_at DESC LIMIT 1`,[id]);
 return {member:{
  id,display_name:member.name,avatar:member.avatar,
  joined_at:member.joined_at,apartment:residence?.apartment_id||"The Unhoused",
  membership:membership?{member_no:String(membership.member_no).padStart(6,"0"),codename:membership.codename,joined_at:membership.joined_at,verified:true}:null
 },stats:{xp:stats.xp,level:stats.level,health:stats.health,stamina:stats.stamina,
  skill:stats.skill,charisma:stats.charisma,intellect:stats.intellect,luck:stats.luck},
 active_job:activeJob||null};
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
 const rawAction=new URL(req.url,"https://cultofnixon.com").searchParams.get("action")||"compound_me";
 if(rawAction==="compound_public_profile" && req.method==="GET"){
  try {
   const id=new URL(req.url,"https://cultofnixon.com").searchParams.get("id");
   if(!snowflake(id))return json(res,400,{error:"Invalid resident."});
   const db=database();await ensureCompoundSchema(db);
   return json(res,200,await publicCompoundProfile(db,id));
  }catch(e){return json(res,e instanceof Fault?e.status:503,{error:e instanceof Fault?e.message:"Profile temporarily unavailable."});}
 }
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
    return json(res,200,{user:session.user,profile:current,home:home||null,is_admin:isAdmin,is_overseer:access.owner===true});
   }
   if(action==="history"){
    const {rows}=await db.query("SELECT source,description,xp_delta,charisma_delta,intellect_delta,details,occurred_at FROM con.compound_progress_events WHERE discord_id=$1 ORDER BY occurred_at DESC,source_key DESC LIMIT 100",[session.user.id]);
    return json(res,200,{events:rows});
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
  if(action==="claim" || action==="request" || action==="consent" || action==="decision" || action==="adjust" || action==="stats" || action==="rules" || action==="apartment" || action==="place" || action==="unassign"){
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
    } else if(action==="stats"){
      // Only the Overseer may replace the complete stat sheet of another resident.
      if(access.owner!==true)bad(403,"Overseer permission required.");
      if(!snowflake(body.discord_id))bad(400,"Invalid member ID.");
      const fields=["xp","health","stamina","skill","charisma","intellect","luck"];
      const values=body.values;
      if(!values||typeof values!=="object"||Array.isArray(values)||Object.keys(values).length!==fields.length||fields.some(f=>!Object.prototype.hasOwnProperty.call(values,f)))bad(400,"All seven character statistics are required.");
      for(const f of fields){
        const value=values[f],max=f==="xp"?1000000:100;
        if(!Number.isInteger(value)||value<0||value>max)bad(400,"Invalid "+f+". Values must be between 0 and "+max+".");
      }
      const previous=(await client.query("SELECT xp,health,stamina,skill,charisma,intellect,luck,activity_xp,trivia_xp FROM con.compound_profiles WHERE discord_id=$1 FOR UPDATE",[body.discord_id])).rows[0];
      if(!previous)bad(404,"Resident not found.");
      const changed=fields.filter(f=>Number(previous[f])!==values[f]);
      if(changed.length){
        // Preserve auto-earned XP; manual_xp is the offset needed for the requested total.
        await client.query(`UPDATE con.compound_profiles SET
         xp=$2,manual_xp=$2-activity_xp-trivia_xp,
         health=$3,stamina=$4,skill=$5,charisma=$6,intellect=$7,luck=$8,updated_at=now()
         WHERE discord_id=$1`,[body.discord_id,...fields.map(f=>values[f])]);
        for(const field of changed){
          const delta=values[field]-Number(previous[field]);
          await client.query(`INSERT INTO con.compound_progress_events
           (source_key,discord_id,source,description,xp_delta,charisma_delta,intellect_delta,details)
           VALUES($1,$2,'admin',$3,$4,$5,$6,$7)`,[
           "admin:"+randomUUID(),body.discord_id,"Overseer set "+field.toUpperCase(),
           field==="xp"?delta:0,field==="charisma"?delta:0,field==="intellect"?delta:0,
           JSON.stringify({field,previous:Number(previous[field]),current:values[field],actor_id:session.user.id,mode:"absolute"})
          ]);
        }
        await audit(client,session.user.id,"profile.stats_set",body.discord_id,{before:Object.fromEntries(fields.map(f=>[f,previous[f]])),after:values,changed});
      }
      result={ok:true,changed,stats:values,level:1+Math.floor(values.xp/250)};
    } else if(action==="adjust"){
      if(!isAdmin)bad(403,"Staff access required.");
      if(!snowflake(body.discord_id))bad(400,"Invalid member ID.");
      const allowed=["xp","health","stamina","skill","charisma","intellect","luck"];
      if(!allowed.includes(body.field)||!Number.isInteger(body.value))bad(400,"Invalid attribute.");
      const max=body.field==="xp"?1000000:100;
      if(body.value<0||body.value>max)bad(400,"Attribute outside allowed range.");
      const field=body.field;
      const oldValue=(await client.query("SELECT "+field+" AS value FROM con.compound_profiles WHERE discord_id=$1 FOR UPDATE",[body.discord_id])).rows[0];
      if(!oldValue)bad(404,"Member not found.");
      const {rowCount}=field==="xp"
        ? await client.query("UPDATE con.compound_profiles SET manual_xp=$2-activity_xp-trivia_xp,xp=$2,updated_at=now() WHERE discord_id=$1",[body.discord_id,body.value])
        : await client.query("UPDATE con.compound_profiles SET "+field+"=$2,updated_at=now() WHERE discord_id=$1",[body.discord_id,body.value]);
      if(!rowCount)bad(404,"Member not found.");
      const delta=body.value-Number(oldValue.value);
      await client.query("INSERT INTO con.compound_progress_events(source_key,discord_id,source,description,xp_delta,charisma_delta,intellect_delta,details) VALUES($1,$2,'admin',$3,$4,$5,$6,$7)",[
       "admin:"+randomUUID(),body.discord_id,"Staff adjustment: "+field.toUpperCase(),
       field==="xp"?delta:0,field==="charisma"?delta:0,field==="intellect"?delta:0,
       JSON.stringify({field,previous:Number(oldValue.value),current:body.value,actor_id:session.user.id})
      ]);
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
