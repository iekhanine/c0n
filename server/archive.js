import {randomUUID} from "node:crypto";
import {database} from "./db.js";
import {json,ORIGIN,readSession} from "./auth.js";
const founders=()=>new Set((process.env.DISCORD_ADMIN_IDS||"").split(",").map(x=>x.trim()).filter(Boolean));
const MAX_AUDIO=2500000;
const schema=[
"CREATE TABLE IF NOT EXISTS con.archive_records(id uuid PRIMARY KEY,collection text NOT NULL CHECK(collection IN ('index','remnants')),title text NOT NULL,subtitle text NOT NULL DEFAULT '',body text NOT NULL DEFAULT '',position integer NOT NULL DEFAULT 0,published boolean NOT NULL DEFAULT false,audio_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())",
"CREATE TABLE IF NOT EXISTS con.archive_audio(id uuid PRIMARY KEY,content_type text NOT NULL,data bytea NOT NULL,original_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())",
"CREATE INDEX IF NOT EXISTS con_archive_records_sort ON con.archive_records(collection,position,created_at)",
"CREATE TABLE IF NOT EXISTS con.archive_meta(key text PRIMARY KEY)",
"ALTER TABLE con.archive_meta ENABLE ROW LEVEL SECURITY",
"REVOKE ALL ON con.archive_meta FROM PUBLIC,anon,authenticated",
"ALTER TABLE con.archive_records ENABLE ROW LEVEL SECURITY",
"ALTER TABLE con.archive_audio ENABLE ROW LEVEL SECURITY",
"REVOKE ALL ON con.archive_records,con.archive_audio FROM PUBLIC,anon,authenticated"
];
const defaultRecords=[
 ["00000000-0000-4000-8000-000000000101","index","The Compound","I / The Discovery","The entrance was found behind a wall that should not have been there. No plaque marked the structure. No boundary appeared on any survey, and nothing in the surviving records suggested that a facility had ever occupied that stretch of ground. The door itself was older than the equipment used to open it.\n\nInside, the air was dry and almost still. Dust had collected in the corners of corridors that seemed to continue farther than the building above could have allowed. Most of the lights had failed. Somewhere beyond the collapsed access wing, a small indicator kept blinking at regular intervals.\n\nThe rooms suggested conflicting histories. One held communications equipment with its identifying plates scraped clean. Another contained storage cabinets, numbered but unlabeled. There were traces of people who had worked there. There was nothing to establish who they were, who employed them, or why they disappeared.\n\nThe first visitors began calling it The Compound. The name appeared nowhere inside.\n\nThen somebody restored power to a damaged terminal. Its screen displayed a single file. The recording had no author, no origin, and no explanation for why it was still there.",1],
 ["00000000-0000-4000-8000-000000000102","index","The Name","II / The Records","The personnel archive contained hundreds of empty jackets and almost no names. Some folders had been opened and carefully emptied; others were sealed as if no one had ever been assigned to them. The drawers were arranged in an order that could not be matched to any surviving roster.\n\nIn a locked cabinet, the recovery team found a stack of identification blanks. They had room for a symbol, a number, and a short designation. There was no space for a first name or a family name. None of the blanks had been issued, or at least none had been returned.\n\nIt was tempting to call this an experiment in anonymity. But the equipment offered another possibility: perhaps the designation was meant to be more durable than the person who carried it.\n\nA second recording was recovered from the same cabinet. It did not identify anybody. It spoke instead about what it might mean to arrive without a history.",2],
 ["00000000-0000-4000-8000-000000000103","index","The Chain","III / The Threshold","No key to the exterior doors was found. Their mechanisms were intact, but the access system required an authorization that could not be generated from the central console. The earliest maintenance notes mentioned visitors who had been admitted by other visitors.\n\nEach entry referred backward to an earlier entry. The chain extended through the incomplete records until it reached a blank space where a beginning ought to have been. Whoever had opened the first door was missing from the archive.\n\nThe restoration team traced a repeated scratch across the metal housings and the interior side of several door frames. The same marking appeared at different depths in the walls, as though it had been renewed long after the original construction.\n\nA third recording mentioned a first door. It offered no location, no map, and no explanation of who had stood on the other side. The final words were not a warning. They sounded more like a request.",3],
 ["00000000-0000-4000-8000-000000000104","remnants","TAPE 004-B: Signal Residue","RECORDING DEGRADED · SOURCE UNKNOWN","A degraded magnetic recording recovered from the communications wing. Electronic hum, damaged tape, intermittent interference and voice-like signals. Its original purpose remains unverified.",1]
];
const init=new WeakMap();
async function setup(db){if(!init.has(db))init.set(db,(async()=>{for(const sql of schema)await db.query(sql);
const first=(await db.query("INSERT INTO con.archive_meta(key) VALUES('original-records-v1') ON CONFLICT DO NOTHING RETURNING key")).rows.length>0;
if(first)for(const record of defaultRecords)await db.query("INSERT INTO con.archive_records(id,collection,title,subtitle,body,position,published) VALUES($1,$2,$3,$4,$5,$6,true) ON CONFLICT(id) DO NOTHING",record);})().catch(e=>{init.delete(db);throw e;}));await init.get(db);}
const clean=(v,n)=>typeof v==="string"?v.trim().slice(0,n):"";
function fail(status,error){const e=Error(error);e.status=status;throw e;}
function validId(value){if(typeof value!=="string"||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value))fail(400,"Invalid record");return value;}
function body(req){const b=typeof req.body==="string"?JSON.parse(req.body):req.body;if(!b||typeof b!=="object"||Array.isArray(b))fail(400,"Invalid request");return b;}
export async function archiveHandler(req,res,dbFactory=database){
 try{
  const user=(await readSession(req))?.user;if(!user?.id)fail(401,"Sign in required");
  const owner=founders().has(user.id),url=new URL(req.url,ORIGIN),action=url.searchParams.get("action");
  const db=dbFactory();await setup(db);
  if(action==="archive_list"){
   if(req.method!=="GET")fail(405,"Use GET");
   const rows=(await db.query("SELECT id,collection,title,subtitle,body,position,published,audio_id,updated_at FROM con.archive_records "+(owner?"":"WHERE published=true ")+"ORDER BY collection,position,created_at")).rows;
   return json(res,200,{records:rows,canEdit:owner});
  }
  if(action==="archive_audio"){
   if(!["GET","HEAD"].includes(req.method))fail(405,"Use GET");
   const audioId=validId(url.searchParams.get("id"));
   const row=(await db.query("SELECT a.data,a.content_type FROM con.archive_audio a JOIN con.archive_records r ON r.audio_id=a.id WHERE a.id=$1 AND (r.published=true OR $2=true) LIMIT 1",[audioId,owner])).rows[0];
   if(!row)fail(404,"Recording unavailable");
   res.statusCode=200;res.setHeader("Content-Type","audio/mpeg");res.setHeader("Content-Length",row.data.length);
   res.setHeader("Content-Disposition","inline");res.setHeader("Cache-Control","private, max-age=60");res.setHeader("X-Content-Type-Options","nosniff");
   return res.end(req.method==="HEAD"?undefined:row.data);
  }
  if(!owner)fail(403,"Only the archive administrator may edit records");
  if(req.method!=="POST")fail(405,"Use POST");
  if(req.headers.origin!==ORIGIN)fail(403,"Invalid origin");
  const b=body(req);
  if(action==="archive_save"){
   const id=b.id?validId(b.id):randomUUID();
   const collection=b.collection;
   if(!["index","remnants"].includes(collection))fail(400,"Invalid archive collection");
   const title=clean(b.title,130),subtitle=clean(b.subtitle,160),content=clean(b.body,12000);
   if(!title)fail(400,"Title required");
   const position=Number.isSafeInteger(b.position)&&b.position>=0&&b.position<=100000?b.position:0;
   const published=b.published===true;
   await db.query("INSERT INTO con.archive_records(id,collection,title,subtitle,body,position,published) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET collection=EXCLUDED.collection,title=EXCLUDED.title,subtitle=EXCLUDED.subtitle,body=EXCLUDED.body,position=EXCLUDED.position,published=EXCLUDED.published,updated_at=now()",[id,collection,title,subtitle,content,position,published]);
   return json(res,200,{id});
  }
  if(action==="archive_upload"){
   const id=validId(b.id),base64=b.data;
   if(typeof base64!=="string"||base64.length>Math.ceil(MAX_AUDIO/3)*4+4||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))fail(400,"Choose an MP3 under 2.5 MB");
   const bytes=Buffer.from(base64,"base64");if(!bytes.length||bytes.length>MAX_AUDIO||bytes.toString("base64")!==base64||!(bytes.subarray(0,3).toString()==="ID3"||bytes[0]===255&&(bytes[1]&224)===224))fail(400,"Invalid MP3 file");
   const filename=clean(b.filename,120)||"recording.mp3";
   const audioId=randomUUID();
   const result=await db.query("SELECT id FROM con.archive_records WHERE id=$1",[id]);if(!result.rows.length)fail(404,"Record does not exist");
   await db.query("INSERT INTO con.archive_audio(id,content_type,data,original_name) VALUES($1,'audio/mpeg',$2,$3)",[audioId,bytes,filename]);
   await db.query("UPDATE con.archive_records SET audio_id=$2,updated_at=now() WHERE id=$1",[id,audioId]);
   return json(res,200,{audioId});
  }
  if(action==="archive_remove"){
   const id=validId(b.id);
   await db.query("DELETE FROM con.archive_records WHERE id=$1",[id]);
   return json(res,200,{ok:true});
  }
  fail(404,"Unknown archive action");
 }catch(e){console.error("Archive operation failed",e.code||e.status||"");return json(res,e.status||503,{error:e.status?e.message:"Archive unavailable"});}
}
