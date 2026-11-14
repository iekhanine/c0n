import {randomUUID} from "node:crypto";
import {database} from "./db.js";
import {json, ORIGIN, readSession} from "./auth.js";
import {ensureMembershipSchema} from "./membership.js";
import {ensureSocial} from "./social.js";

const ownerIDs=()=>new Set((process.env.DISCORD_ADMIN_IDS||"").split(",").map(x=>x.trim()).filter(Boolean));
const items={
 water:{label:"Water allocation · 3 units",cost:6,qty:3},
 rations:{label:"Ration pack · 2 units",cost:8,qty:2},
 equipment:{label:"Maintenance kit",cost:14,qty:1},
 access:{label:"Sector C clearance",cost:22,qty:1}
};
const duties={
 water:{title:"Restore filtration in Sector C",credits:12,xp:20,sector:"water",question:"Valve A OPEN, B CLOSED, C OPEN. Enter valve sequence.",answer:"OCO"},
 archive:{title:"Archive recovery",credits:9,xp:15,sector:"archive",question:"Enter the three-digit catalog number of REM-006.",answer:"006"},
 perimeter:{title:"Perimeter inspection",credits:7,xp:12,sector:"power",question:"The camera points SOUTH. What is the opposite direction?",answer:"NORTH"},
 generator:{title:"Generator maintenance",credits:15,xp:25,sector:"power",question:"Reverse the restart code 4-2-1.",answer:"124"},
 comms:{title:"Communications duty",credits:11,xp:18,sector:"archive",question:"Enter frequency 7.319 without punctuation.",answer:"7319"}
};
function fail(status,error){const e=Error(error);e.status=status;throw e;}
function input(req){let b=req.body;if(typeof b==="string")b=JSON.parse(b);if(!b||typeof b!=="object"||Array.isArray(b)||JSON.stringify(b).length>4000)fail(400,"Invalid request");return b;}
function method(req,expected){if(req.method!==expected)fail(405,"Use "+expected);}
function text(value,max=400){return typeof value==="string"?value.trim().slice(0,max):"";}
const schema=[
"CREATE TABLE IF NOT EXISTS con.facility_transactions(id uuid PRIMARY KEY,user_id text NOT NULL,credits integer NOT NULL DEFAULT 0,xp integer NOT NULL DEFAULT 0,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())",
"CREATE TABLE IF NOT EXISTS con.facility_requests(id uuid PRIMARY KEY,member_id text NOT NULL,sku text NOT NULL,cost integer NOT NULL,status text NOT NULL CHECK(status IN ('pending','assigned','approved','rejected')),note text NOT NULL DEFAULT '',review text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())",
"CREATE TABLE IF NOT EXISTS con.facility_assignments(id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES con.facility_requests(id),member_id text NOT NULL,duty text NOT NULL,status text NOT NULL CHECK(status IN ('assigned','submitted','completed')),report text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now())",
"CREATE TABLE IF NOT EXISTS con.facility_inventory(user_id text NOT NULL,item text NOT NULL,quantity integer NOT NULL DEFAULT 0,PRIMARY KEY(user_id,item))",
"CREATE TABLE IF NOT EXISTS con.facility_grants(id uuid PRIMARY KEY,member_id text NOT NULL,item text NOT NULL,quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100),note text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now())",
"CREATE INDEX IF NOT EXISTS con_facility_grants_member ON con.facility_grants(member_id,created_at DESC)",
"CREATE TABLE IF NOT EXISTS con.facility_config(key text PRIMARY KEY,value text NOT NULL)",
"CREATE TABLE IF NOT EXISTS con.facility_progress(sector text PRIMARY KEY,completed integer NOT NULL DEFAULT 0,goal integer NOT NULL)",
"INSERT INTO con.facility_progress(sector,completed,goal) VALUES ('water',0,20),('power',0,25),('archive',0,25) ON CONFLICT DO NOTHING",
"INSERT INTO con.facility_config(key,value) VALUES('directive','Facility restoration is in progress. Equipment allocation awaits authorization.') ON CONFLICT DO NOTHING",
"CREATE INDEX IF NOT EXISTS con_facility_requests_member ON con.facility_requests(member_id,created_at DESC)",
"CREATE INDEX IF NOT EXISTS con_facility_assignments_member ON con.facility_assignments(member_id,created_at DESC)",
"ALTER TABLE con.facility_transactions ENABLE ROW LEVEL SECURITY",
"ALTER TABLE con.facility_requests ENABLE ROW LEVEL SECURITY",
"ALTER TABLE con.facility_assignments ENABLE ROW LEVEL SECURITY",
"ALTER TABLE con.facility_inventory ENABLE ROW LEVEL SECURITY",
"ALTER TABLE con.facility_grants ENABLE ROW LEVEL SECURITY",
"ALTER TABLE con.facility_config ENABLE ROW LEVEL SECURITY",
"ALTER TABLE con.facility_progress ENABLE ROW LEVEL SECURITY",
"REVOKE ALL ON con.facility_transactions,con.facility_requests,con.facility_assignments,con.facility_inventory,con.facility_grants,con.facility_config,con.facility_progress FROM PUBLIC,anon,authenticated"
];
const init=new WeakMap();
async function setup(db){await ensureMembershipSchema(db);await ensureSocial(db);if(!init.has(db))init.set(db,(async()=>{for(const sql of schema)await db.query(sql);})().catch(e=>{init.delete(db);throw e;}));await init.get(db);}
async function balance(db,id){
 const earned=Number((await db.query("SELECT coalesce(sum(points),0)::int AS n FROM con.reputation_ledger WHERE user_id=$1",[id])).rows[0].n);
 const delta=(await db.query("SELECT coalesce(sum(credits),0)::int AS c,coalesce(sum(xp),0)::int AS xp FROM con.facility_transactions WHERE user_id=$1",[id])).rows[0];
 return {credits:Math.max(0,earned+Number(delta.c)),xp:Number(delta.xp),earnedVotes:earned,reputation:Math.floor(Math.max(0,earned)/5)};
}
function publicJobs(){return Object.entries(duties).map(([id,d])=>({id,title:d.title,credits:d.credits,xp:d.xp,sector:d.sector,question:d.question}));}
async function snapshot(db,id){
 const [wallet,requests,assignments,inventory,config,progress]=await Promise.all([
 balance(db,id),
 db.query("SELECT id,sku,cost,status,note,review,created_at FROM con.facility_requests WHERE member_id=$1 ORDER BY created_at DESC LIMIT 100",[id]),
 db.query("SELECT id,request_id,duty,status,report,created_at FROM con.facility_assignments WHERE member_id=$1 ORDER BY created_at DESC LIMIT 100",[id]),
 db.query("SELECT item,quantity FROM con.facility_inventory WHERE user_id=$1",[id]),
 db.query("SELECT value FROM con.facility_config WHERE key='directive'"),
 db.query("SELECT sector,completed,goal FROM con.facility_progress ORDER BY sector")
 ]);
 return {wallet,requests:requests.rows,assignments:assignments.rows,inventory:inventory.rows,progress:progress.rows,directive:config.rows[0]?.value||"",catalog:Object.entries(items).map(([id,d])=>({id,...d})),duties:publicJobs()};
}
async function tx(db,fn){const c=await db.connect();try{await c.query("BEGIN");const out=await fn(c);await c.query("COMMIT");return out;}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}}
async function lock(c,id){await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",[id]);}
function validId(value){if(typeof value!=="string"||!/^[0-9a-f-]{36}$/i.test(value))fail(400,"Invalid identifier");return value;}
export async function facilityHandler(req,res,dbFactory=database){
 try{
  const user=(await readSession(req))?.user;
  if(!user?.id)fail(401,"Sign in required");
  const url=new URL(req.url,ORIGIN),action=url.searchParams.get("action")||"facility_state";
  if(!action.startsWith("facility_"))fail(404,"Unknown operation");
  const owner=ownerIDs().has(user.id);
  if(req.method!=="GET"&&req.headers.origin!==ORIGIN)fail(403,"Invalid origin");
  const db=dbFactory();await setup(db);
  if(action==="facility_state"){method(req,"GET");return json(res,200,await snapshot(db,user.id));}
  if(action==="facility_control"){method(req,"GET");if(!owner)fail(403,"Forbidden");const [requests,assignments,members,grants]=await Promise.all([
    db.query("SELECT r.id,r.member_id,m.codename AS member_name,r.sku,r.cost,r.status,r.note,r.review,r.created_at FROM con.facility_requests r LEFT JOIN con.memberships m ON m.user_id=r.member_id ORDER BY r.created_at DESC LIMIT 250"),
    db.query("SELECT a.id,a.request_id,a.member_id,m.codename AS member_name,a.duty,a.status,a.report,a.created_at FROM con.facility_assignments a LEFT JOIN con.memberships m ON m.user_id=a.member_id ORDER BY a.created_at DESC LIMIT 250"),
    db.query("SELECT user_id,codename,member_no FROM con.memberships WHERE active=true ORDER BY member_no LIMIT 2000"),
    db.query("SELECT g.id,g.member_id,m.codename AS member_name,g.item,g.quantity,g.note,g.created_at FROM con.facility_grants g LEFT JOIN con.memberships m ON m.user_id=g.member_id ORDER BY g.created_at DESC LIMIT 100")]);
    return json(res,200,{requests:requests.rows,assignments:assignments.rows,members:members.rows,grants:grants.rows});}
  method(req,"POST");const b=input(req);
  if(action==="facility_request"){
   const item=items[b.sku];if(!item)fail(400,"Invalid supply item");
   await tx(db,async c=>{await lock(c,user.id);
    const pending=(await c.query("SELECT count(*)::int AS n FROM con.facility_requests WHERE member_id=$1 AND status IN ('pending','assigned')",[user.id])).rows[0].n;
    if(pending>=10)fail(409,"Too many active requests");
    await c.query("INSERT INTO con.facility_requests(id,member_id,sku,cost,status,note) VALUES($1,$2,$3,$4,'pending',$5)",[randomUUID(),user.id,b.sku,item.cost,text(b.note)]);
   });
   return json(res,201,{ok:true});
  }
  if(action==="facility_submit"){
   const assignment=validId(b.id),answer=text(b.answer,40).replace(/\s+/g,"").toUpperCase(),report=text(b.report,1500);
   if(!report)fail(400,"A completion report is required");
   await tx(db,async c=>{const a=(await c.query("SELECT * FROM con.facility_assignments WHERE id=$1 FOR UPDATE",[assignment])).rows[0];
     if(!a||a.member_id!==user.id||a.status!=="assigned")fail(404,"Assignment unavailable");
     if(duties[a.duty]?.answer!==answer)fail(400,"Verification sequence incorrect");
     await c.query("UPDATE con.facility_assignments SET status='submitted',report=$2 WHERE id=$1",[assignment,report]);});
   return json(res,200,{ok:true});
  }
  if(!owner)fail(403,"Forbidden");
  if(action==="facility_grant"){
    const member=text(b.member_id,25),sku=text(b.sku,25),quantity=b.quantity,note=text(b.note,400);
    if(!/^[0-9]{17,20}$/.test(member))fail(400,"Choose a member");
    if(!Object.hasOwn(items,sku))fail(400,"Choose a valid supply item");
    if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100)fail(400,"Choose 1 to 100 units");
    await tx(db,async c=>{
      const recipient=(await c.query("SELECT 1 FROM con.memberships WHERE user_id=$1 AND active=true",[member])).rows[0];
      if(!recipient)fail(404,"Active member not found");
      await lock(c,member);
      await c.query("INSERT INTO con.facility_inventory(user_id,item,quantity) VALUES($1,$2,$3) ON CONFLICT(user_id,item) DO UPDATE SET quantity=con.facility_inventory.quantity+EXCLUDED.quantity",[member,sku,quantity]);
      await c.query("INSERT INTO con.facility_grants(id,member_id,item,quantity,note) VALUES($1,$2,$3,$4,$5)",[randomUUID(),member,sku,quantity,note]);
    });
    return json(res,201,{ok:true});
  }
  if(action==="facility_assign"){
   const request=validId(b.id);if(!duties[b.duty])fail(400,"Unknown duty");
   await tx(db,async c=>{const r=(await c.query("SELECT * FROM con.facility_requests WHERE id=$1 FOR UPDATE",[request])).rows[0];
    if(!r||r.status!=="pending")fail(409,"Request not pending");
    await c.query("INSERT INTO con.facility_assignments(id,request_id,member_id,duty,status) VALUES($1,$2,$3,$4,'assigned')",[randomUUID(),r.id,r.member_id,b.duty]);
    await c.query("UPDATE con.facility_requests SET status='assigned',updated_at=now() WHERE id=$1",[r.id]);});
   return json(res,200,{ok:true});
  }
  if(action==="facility_review"){
   const assignment=validId(b.id);const approve=b.approve===true;
   await tx(db,async c=>{const a=(await c.query("SELECT * FROM con.facility_assignments WHERE id=$1 FOR UPDATE",[assignment])).rows[0];
    if(!a||a.status!=="submitted")fail(409,"Report not pending");
    if(!approve){await c.query("UPDATE con.facility_assignments SET status='assigned',report='' WHERE id=$1",[a.id]);return;}
    const duty=duties[a.duty];await c.query("UPDATE con.facility_assignments SET status='completed' WHERE id=$1",[a.id]);
    await c.query("INSERT INTO con.facility_transactions(id,user_id,credits,xp,reason) VALUES($1,$2,$3,$4,$5)",[randomUUID(),a.member_id,duty.credits,duty.xp,"Completed "+duty.title]);
    await c.query("UPDATE con.facility_progress SET completed=least(goal,completed+1) WHERE sector=$1",[duty.sector]);
    await c.query("UPDATE con.facility_requests SET status='pending',review='Assignment verified',updated_at=now() WHERE id=$1 AND status='assigned'",[a.request_id]);});
   return json(res,200,{ok:true});
  }
  if(action==="facility_decide"){
   const request=validId(b.id),approve=b.approve===true;
   await tx(db,async c=>{const r=(await c.query("SELECT * FROM con.facility_requests WHERE id=$1 FOR UPDATE",[request])).rows[0];
    if(!r||r.status!=="pending")fail(409,"Request not pending");
    await lock(c,r.member_id);
    if(approve){const available=await balance(c,r.member_id);if(available.credits<r.cost)fail(409,"Member has insufficient credits");
     const item=items[r.sku];if(!item)fail(400,"Unavailable item");
     await c.query("INSERT INTO con.facility_transactions(id,user_id,credits,xp,reason) VALUES($1,$2,$3,0,$4)",[randomUUID(),r.member_id,-r.cost,"Supply allocation: "+r.sku]);
     await c.query("INSERT INTO con.facility_inventory(user_id,item,quantity) VALUES($1,$2,$3) ON CONFLICT(user_id,item) DO UPDATE SET quantity=con.facility_inventory.quantity+EXCLUDED.quantity",[r.member_id,r.sku,item.qty]);}
    await c.query("UPDATE con.facility_requests SET status=$2,review=$3,updated_at=now() WHERE id=$1",[r.id,approve?"approved":"rejected",text(b.note,400)||"Reviewed by Facility Control"]);});
   return json(res,200,{ok:true});
  }
  if(action==="facility_directive"){
   const directive=text(b.directive,1200);if(!directive)fail(400,"Directive required");
   await db.query("UPDATE con.facility_config SET value=$1 WHERE key='directive'",[directive]);return json(res,200,{ok:true});
  }
  fail(404,"Unknown operation");
 }catch(e){console.error("Facility operation failed",e.code||e.status||"");return json(res,e.status||503,{error:e.status?e.message:"Facility system temporarily unavailable"});}
}
