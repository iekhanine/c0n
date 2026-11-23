import { randomBytes, randomUUID, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { database } from "./db.js";
import { json, ORIGIN, requireStaff } from "./auth.js";

const digest = v => createHash("sha256").update(v).digest("hex");
const emailOkay = v => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
const token = () => randomBytes(24).toString("base64url");
const err = (status, message) => Object.assign(new Error(message), { status });
const MAX_BYTES = 3 * 1024 * 1024;
const CUES = [
  ["my-take", "And now, from the questionable judgment department…"],
  ["plot-thickens", "Well. The plot thickens."],
  ["transmission", "Incoming response from Patient Zero."],
  ["unfiltered", "Let's make this wonderfully uncomfortable."]
];
async function schema(db) {
  await db.query('CREATE SCHEMA IF NOT EXISTS con');
  await db.query('CREATE TABLE IF NOT EXISTS con.open_line_codes (email text PRIMARY KEY, code_hash text, expires_at timestamptz, attempts integer NOT NULL DEFAULT 0, last_sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())');
  await db.query('CREATE TABLE IF NOT EXISTS con.open_line_grants (token_hash text PRIMARY KEY, email text NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz)');
  await db.query('CREATE TABLE IF NOT EXISTS con.open_line_messages (id uuid PRIMARY KEY, email text NOT NULL, alias text NOT NULL DEFAULT \'\', mime text NOT NULL, audio bytea NOT NULL, status text NOT NULL DEFAULT \'new\', created_at timestamptz NOT NULL DEFAULT now(), response_mime text, response_audio bytea, response_note text, cue_id text, reply_token_hash text UNIQUE, replied_at timestamptz, emailed_at timestamptz)');
  await db.query('CREATE TABLE IF NOT EXISTS con.open_line_cues (id text PRIMARY KEY, label text NOT NULL, mime text NOT NULL, audio bytea NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
  for(const table of ["open_line_codes","open_line_grants","open_line_messages","open_line_cues"]) {
    await db.query('ALTER TABLE con.'+table+' ENABLE ROW LEVEL SECURITY');
    await db.query('REVOKE ALL ON con.'+table+' FROM PUBLIC');
  }
}
const validAudio = input => {
  if (!input || typeof input.data !== "string" || input.data.length > Math.ceil(MAX_BYTES / 3) * 4 + 8) throw err(413,"Recording is too large (3 MB maximum).");
  if (!["audio/webm","audio/mp4","audio/wav","audio/ogg"].includes(input.mime)) throw err(400,"Unsupported audio format.");
  const bytes = Buffer.from(input.data,"base64");
  if (!bytes.length || bytes.length > MAX_BYTES || bytes.toString("base64").replace(/=+$/,"") !== input.data.replace(/=+$/,"")) throw err(400,"Invalid audio data.");
  const header = bytes.subarray(0,16);
  const webm = bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
  const mp4 = header.subarray(4,8).toString()==="ftyp";
  const wav = header.subarray(0,4).toString()==="RIFF" && header.subarray(8,12).toString()==="WAVE";
  const ogg = header.subarray(0,4).toString()==="OggS";
  if (!({ "audio/webm":webm,"audio/mp4":mp4,"audio/wav":wav,"audio/ogg":ogg })[input.mime]) throw err(400,"Recording type does not match its contents.");
  return bytes;
};
const body = req => typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
function audioResponse(res, row, disposition="inline") {
  res.setHeader("Cache-Control","private, no-store");
  res.setHeader("Content-Type",row.mime);
  res.setHeader("Content-Disposition",disposition+'; filename="cbn-'+row.id+'.'+({ "audio/mp4":"m4a","audio/webm":"webm","audio/wav":"wav","audio/ogg":"ogg" }[row.mime] || "audio")+'"');
  res.setHeader("X-Content-Type-Options","nosniff");
  return res.status(200).end(row.audio);
}
async function emailSend(to, subject, html) {
  if (!process.env.RESEND_API_KEY || !process.env.CBN_EMAIL_FROM) throw err(503,"Email delivery is not configured.");
  const r = await fetch("https://api.resend.com/emails",{
    method:"POST",headers:{"Authorization":"Bearer "+process.env.RESEND_API_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({from:process.env.CBN_EMAIL_FROM,to:[to],subject,html})
  });
  if (!r.ok) { console.error("CBN mail send failed",r.status); throw err(502,"Could not send email. Please retry."); }
}
function hmac(value) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw err(503,"Verification unavailable.");
  return createHmac("sha256",process.env.SESSION_SECRET).update(value).digest("hex");
}
function equal(a,b) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a),Buffer.from(b));
}
export default async function openLine(req,res) {
  try {
    const action = new URL(req.url,ORIGIN).searchParams.get("open_line") || "";
    if (!["GET","POST"].includes(req.method)) throw err(405,"Method not allowed");
    if (req.method === "POST" && req.headers.origin !== ORIGIN) throw err(403,"Invalid origin");
    const db = database();
    await schema(db);
    if (action === "challenge" && req.method === "GET") {
      const choices = ["C","B","N","0","X","7"];
      const sequence = Array.from({length:4},()=>choices[randomBytes(1)[0] % choices.length]);
      const nonce = token(), expires = Date.now()+120000;
      return json(res,200,{choices,sequence,challenge:Buffer.from(JSON.stringify({sequence,nonce,expires})).toString("base64url")+"."+hmac(sequence.join("")+"|"+nonce+"|"+expires)});
    }
    if (action === "request" && req.method === "POST") {
      const b=body(req), email=String(b.email||"").toLowerCase().trim();
      if(!emailOkay(email))throw err(400,"Enter a valid email address.");
      let challenge;
      try {
        const [data,sig]=String(b.challenge||"").split(".");
        challenge=JSON.parse(Buffer.from(data,"base64url").toString());
        if(Date.now()>challenge.expires || challenge.expires>Date.now()+120000 || !equal(sig,hmac(challenge.sequence.join("")+"|"+challenge.nonce+"|"+challenge.expires)))throw Error("bad");
      }catch{throw err(403,"Challenge expired. Try again.");}
      if (!Array.isArray(b.sequence)||b.sequence.join("")!==challenge.sequence.join(""))throw err(403,"Incorrect sequence.");
      const ip=digest(String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0].trim());
      // Sliding rate window for requests across email and originating IP.
      await db.query('CREATE TABLE IF NOT EXISTS con.open_line_limits (id text PRIMARY KEY, count integer NOT NULL, reset_at timestamptz NOT NULL)');
      await db.query('ALTER TABLE con.open_line_limits ENABLE ROW LEVEL SECURITY');
      await db.query('REVOKE ALL ON con.open_line_limits FROM PUBLIC');
      for(const k of ["ip:"+ip,"email:"+digest(email)]) {
        const {rows}=await db.query('INSERT INTO con.open_line_limits(id,count,reset_at) VALUES($1,1,now()+interval \'1 hour\') ON CONFLICT(id) DO UPDATE SET count=CASE WHEN con.open_line_limits.reset_at<now() THEN 1 ELSE con.open_line_limits.count+1 END,reset_at=CASE WHEN con.open_line_limits.reset_at<now() THEN now()+interval \'1 hour\' ELSE con.open_line_limits.reset_at END RETURNING count',[k]);
        if(rows[0].count> (k.startsWith("ip:")?12:3))throw err(429,"Too many requests. Try again later.");
      }
      const code=String(randomBytes(4).readUInt32BE()%1000000).padStart(6,"0");
      await db.query('INSERT INTO con.open_line_codes(email,code_hash,expires_at,attempts,last_sent_at) VALUES($1,$2,now()+interval \'10 minutes\',0,now()) ON CONFLICT(email) DO UPDATE SET code_hash=$2, expires_at=now()+interval \'10 minutes\',attempts=0,last_sent_at=now()',[email,hmac(email+"|"+code)]);
      await emailSend(email,"Your CBN Open Line access code",'<p>Your recording code is <strong>'+code+'</strong>.</p><p>It expires in 10 minutes. Never share it.</p>');
      return json(res,200,{ok:true});
    }
    if (action==="verify" && req.method==="POST") {
      const b=body(req), email=String(b.email||"").toLowerCase().trim(),code=String(b.code||"");
      if(!emailOkay(email)||!/^\d{6}$/.test(code))throw err(400,"Invalid code.");
      const q=await db.query('UPDATE con.open_line_codes SET attempts=attempts+1 WHERE email=$1 AND expires_at>now() AND attempts<5 RETURNING code_hash',[email]);
      if(!q.rows[0] || !equal(q.rows[0].code_hash,hmac(email+"|"+code)))throw err(403,"Incorrect or expired code.");
      await db.query('DELETE FROM con.open_line_codes WHERE email=$1',[email]);
      const grant=token();
      await db.query('INSERT INTO con.open_line_grants(token_hash,email,expires_at) VALUES($1,$2,now()+interval \'20 minutes\')',[digest(grant),email]);
      return json(res,200,{grant});
    }
    if (action==="submit" && req.method==="POST") {
      const b=body(req);
      if(b.consent!==true)throw err(400,"Consent is required.");
      const bytes=validAudio(b.audio);
      const alias=String(b.alias||"Anonymous").trim().slice(0,60);
      const q=await db.query('UPDATE con.open_line_grants SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING email',[digest(String(b.grant||""))]);
      if(!q.rows[0])throw err(403,"Recording authorization expired or was already used.");
      const id=randomUUID();
      await db.query('INSERT INTO con.open_line_messages(id,email,alias,mime,audio) VALUES($1,$2,$3,$4,$5)',[id,q.rows[0].email,alias,b.audio.mime,bytes]);
      return json(res,201,{ok:true,id});
    }
    if (action==="listen" && req.method==="GET") {
      const b=new URL(req.url,ORIGIN).searchParams;
      const staff=await requireStaff(req,res); if(!staff)return;
      if(!staff.owner)throw err(403,"Owner access only.");
      const what=b.get("type")||"original";
      if(what==="cue") {
        const q=await db.query('SELECT id,mime,audio FROM con.open_line_cues WHERE id=$1',[b.get("id")]);
        if(!q.rows[0])throw err(404,"Clip not found");
        return audioResponse(res,q.rows[0]);
      }
      const q=await db.query('SELECT id,mime,audio,response_mime,response_audio FROM con.open_line_messages WHERE id=$1',[b.get("id")]);
      if(!q.rows[0])throw err(404,"Message not found");
      const row=q.rows[0];
      if(what==="reply") {if(!row.response_audio)throw err(404,"No reply");return audioResponse(res,{id:row.id,mime:row.response_mime,audio:row.response_audio});}
      return audioResponse(res,row);
    }
    if(action==="public-reply" && req.method==="GET") {
      const b=new URL(req.url,ORIGIN).searchParams;
      const q=await db.query('SELECT id,response_mime AS mime,response_audio AS audio FROM con.open_line_messages WHERE reply_token_hash=$1 AND emailed_at IS NOT NULL',[digest(b.get("token")||"")]);
      if(!q.rows[0]?.audio)throw err(404,"Recording unavailable.");
      return audioResponse(res,q.rows[0]);
    }
    if(["list","cues","save-cue","reply","resend"].includes(action)) {
      const staff=await requireStaff(req,res);if(!staff)return;
      if(!staff.owner)throw err(403,"Only the owner can access Open Line.");
      if(action==="list" && req.method==="GET") {
        const q=await db.query('SELECT id,alias,email,status,mime,created_at,reply_token_hash IS NOT NULL AS has_reply,emailed_at FROM con.open_line_messages ORDER BY created_at DESC LIMIT 150');
        return json(res,200,{messages:q.rows});
      }
      if(action==="cues" && req.method==="GET") {
        const q=await db.query('SELECT id,label FROM con.open_line_cues');
        return json(res,200,{cues:CUES.map(([id,label])=>({id,label,recorded:q.rows.some(x=>x.id===id)}))});
      }
      if(action==="save-cue" && req.method==="POST") {
        const b=body(req),label=CUES.find(x=>x[0]===b.id)?.[1];
        if(!label)throw err(400,"Invalid interlude");
        const bytes=validAudio(b.audio);
        await db.query('INSERT INTO con.open_line_cues(id,label,mime,audio) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET mime=$3,audio=$4,updated_at=now()',[b.id,label,b.audio.mime,bytes]);
        return json(res,200,{ok:true});
      }
      if(action==="reply" && req.method==="POST") {
        const b=body(req),bytes=validAudio(b.audio),id=String(b.id||"");
        const publicToken=token();
        const cueId=CUES.some(x=>x[0]===b.cueId)?b.cueId:null;
        const r=await db.query('UPDATE con.open_line_messages SET response_mime=$2,response_audio=$3,response_note=$4,status=\'replied\',replied_at=now(),reply_token_hash=$5,emailed_at=NULL WHERE id=$1 RETURNING email',[id,b.audio.mime,bytes,String(b.note||"").slice(0,600),digest(publicToken),cueId]);
        if(!r.rows[0])throw err(404,"Message not found.");
        const link=ORIGIN+"/reply/"+encodeURIComponent(publicToken);
        const note=String(b.note||"").slice(0,600).replace(/[&<>"\x27]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
        await emailSend(r.rows[0].email,"You have a reply from CBN",'<p>Your CBN Open Line message has a reply.</p>'+(note?'<p>'+note+'</p>':'')+'<p><a href="'+link+'">Listen to your response</a></p><p>Keep this link private.</p>');
        await db.query('UPDATE con.open_line_messages SET emailed_at=now(),status=\'sent\' WHERE id=$1',[id]);
        return json(res,200,{ok:true,sent:true});
      }
      if(action==="resend" && req.method==="POST") throw err(501,"Re-send requires a fresh reply to rotate the private link.");
    }
    throw err(404,"Not found.");
  } catch(e) {
    console.error("Open Line error",e?.status || 500,e?.message);
    return json(res,e?.status || 500,{error:e?.status ? e.message : "Open Line is temporarily unavailable."});
  }
}    if (action==="public-reply" && req.method==="GET") {
      const b=new URL(req.url,ORIGIN).searchParams;
      const q=await db.query('SELECT id,alias,mime,audio,response_mime,response_audio,cue_id FROM con.open_line_messages WHERE reply_token_hash=$1 AND emailed_at IS NOT NULL',[digest(b.get("token")||"")]);
      const row=q.rows[0];if(!row?.response_audio)throw err(404,"Recording unavailable.");
      const part=b.get("part");
      if(!part)return json(res,200,{alias:row.alias,hasCue:!!row.cue_id});
      if(part==="original")return audioResponse(res,row);
      if(part==="reply")return audioResponse(res,{id:row.id,mime:row.response_mime,audio:row.response_audio});
      if(part==="cue" && row.cue_id){
        const clip=await db.query('SELECT id,mime,audio FROM con.open_line_cues WHERE id=$1',[row.cue_id]);
        if(clip.rows[0])return audioResponse(res,clip.rows[0]);
      }
      throw err(404,"Audio not found.");
    }
    if(["list","cues","save-cue","reply","resend"].includes(action)) {
      const staff=await requireStaff(req,res);if(!staff)return;
      if(!staff.owner)throw err(403,"Only the owner can access Open Line.");
      if(action==="list" && req.method==="GET") {
        const q=await db.query('SELECT id,alias,email,status,mime,created_at,reply_token_hash IS NOT NULL AS has_reply,emailed_at FROM con.open_line_messages ORDER BY created_at DESC LIMIT 150');
        return json(res,200,{messages:q.rows});
      }
      if(action==="cues" && req.method==="GET") {
        const q=await db.query('SELECT id,label FROM con.open_line_cues');
        return json(res,200,{cues:CUES.map(([id,label])=>({id,label,recorded:q.rows.some(x=>x.id===id)}))});
      }
      if(action==="save-cue" && req.method==="POST") {
        const b=body(req),label=CUES.find(x=>x[0]===b.id)?.[1];
        if(!label)throw err(400,"Invalid interlude");
        const bytes=validAudio(b.audio);
        await db.query('INSERT INTO con.open_line_cues(id,label,mime,audio) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET mime=$3,audio=$4,updated_at=now()',[b.id,label,b.audio.mime,bytes]);
        return json(res,200,{ok:true});
      }
      if(action==="reply" && req.method==="POST") {
        const b=body(req),bytes=validAudio(b.audio),id=String(b.id||"");
        const publicToken=token();
        const r=await db.query('UPDATE con.open_line_messages SET response_mime=$2,response_audio=$3,response_note=$4,status=\'replied\',replied_at=now(),reply_token_hash=$5,emailed_at=NULL WHERE id=$1 RETURNING email',[id,b.audio.mime,bytes,String(b.note||"").slice(0,600),digest(publicToken)]);
        if(!r.rows[0])throw err(404,"Message not found.");
        const link=ORIGIN+"/api/open-line?action=public-reply&token="+publicToken;
        await emailSend(r.rows[0].email,"You have a reply from CBN",'<p>Your CBN Open Line message has a reply.</p><p><a href="'+link+'">Listen to your response</a></p><p>Keep this link private.</p>');
        await db.query('UPDATE con.open_line_messages SET emailed_at=now(),status=\'sent\' WHERE id=$1',[id]);
        return json(res,200,{ok:true,sent:true});
      }
      if(action==="resend" && req.method==="POST") throw err(501,"Re-send requires a fresh reply to rotate the private link.");
    }
    throw err(404,"Not found.");
  } catch(e) {
    console.error("Open Line error",e?.status || 500,e?.message);
    return json(res,e?.status || 500,{error:e?.status ? e.message : "Open Line is temporarily unavailable."});
  }
}
