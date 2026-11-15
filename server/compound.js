import { randomUUID } from "node:crypto";
import { readSession, accessFor, json } from "./auth.js";
import { database } from "./db.js";
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
 xp integer NOT NULL DEFAULT 0 CHECK(xp>=0), health integer NOT NULL DEFAULT 100 CHECK(health BETWEEN 0 AND 100),
 stamina integer NOT NULL DEFAULT 100 CHECK(stamina BETWEEN 0 AND 100),
 skill integer NOT NULL DEFAULT 5 CHECK(skill BETWEEN 0 AND 100),
 charisma integer NOT NULL DEFAULT 5 CHECK(charisma BETWEEN 0 AND 100),
 intellect integer NOT NULL DEFAULT 5 CHECK(intellect BETWEEN 0 AND 100),
 luck integer NOT NULL DEFAULT 5 CHECK(luck BETWEEN 0 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
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
`);
 await db.query("INSERT INTO con.compound_apartments(id,floor,unit) SELECT 'F'||f||'-0'||n,f,n FROM generate_series(1,4) AS f CROSS JOIN generate_series(1,8) AS n ON CONFLICT DO NOTHING");
}
async function audit(db, actor, action, subject, details={}) {
 await db.query("INSERT INTO con.compound_audit(id,actor_id,action,subject_id,details) VALUES ($1,$2,$3,$4,$5)",[randomUUID(),actor,action,subject,JSON.stringify(details)]);
}
async function profile(db,user) {
 const {rows}=await db.query(`INSERT INTO con.compound_profiles(discord_id,display_name)
 VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET display_name=EXCLUDED.display_name
 RETURNING *, 1+floor(xp/250.0)::integer AS level`,[user.id,simple(user.name||user.username)]);
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
  if (!schemaReady) schemaReady = schema(db).catch(e=>{schemaReady=null; throw e;});
  await schemaReady;
  const current=await profile(db,session.user);
  const action=new URL(req.url,"https://cultofnixon.com").searchParams.get("action")||"me";
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
    const {rows}=await db.query(`SELECT p.*,1+floor(p.xp/250.0)::integer AS level,r.apartment_id FROM con.compound_profiles p LEFT JOIN con.compound_residency r ON r.discord_id=p.discord_id ORDER BY p.display_name LIMIT 500`);
    return json(res,200,{residents:rows});
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
  if(action==="claim" || action==="request" || action==="consent" || action==="decision" || action==="adjust"){
   const client=await db.connect();
   try {
    await client.query("BEGIN");
    let result={ok:true};
    if(action==="claim"){
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
      const {rowCount}=await client.query("UPDATE con.compound_profiles SET "+field+"=$2,updated_at=now() WHERE discord_id=$1",[body.discord_id,body.value]);
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
