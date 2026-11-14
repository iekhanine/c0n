import { database } from "../server/db.js";
import { ORIGIN, json, readSession } from "../server/auth.js";
import { isSiteOwner } from "../server/site-content.js";
const MAX=2*1024*1024;
async function ensure(db){
  await db.query(`CREATE TABLE IF NOT EXISTS con.vault_background(
    singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
    data bytea NOT NULL,
    mime text NOT NULL,
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    uploaded_by text NOT NULL
  )`);
  await db.query("ALTER TABLE con.vault_background ENABLE ROW LEVEL SECURITY");
  await db.query("REVOKE ALL ON con.vault_background FROM PUBLIC,anon,authenticated");
}
export async function vaultBackgroundHandler(req,res){
  try{
    if(!["GET","HEAD","POST"].includes(req.method)) return json(res,405,{error:"Method not allowed"});
    const db=database();
    if(req.method==="POST"){
      if(req.headers.origin!==ORIGIN)return json(res,403,{error:"Invalid origin"});
      const session=await readSession(req);
      if(!session?.user || !isSiteOwner(session.user.id))return json(res,403,{error:"Founder access required"});
      const body=typeof req.body==="string"?JSON.parse(req.body):req.body;
      const input=body?.data;
      if(typeof input!=="string"||input.length>Math.ceil(MAX/3)*4+4||!/^[A-Za-z0-9+/]+={0,2}$/.test(input))
        return json(res,400,{error:"Choose a JPEG or PNG smaller than 2 MB"});
      const bytes=Buffer.from(input,"base64");
      const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      if(!bytes.length||bytes.length>MAX||bytes.toString("base64")!==input||(!jpeg&&!png))
        return json(res,400,{error:"Invalid JPEG/PNG image"});
      await ensure(db);
      await db.query(`INSERT INTO con.vault_background(singleton,data,mime,uploaded_by)
        VALUES(true,$1,$2,$3)
        ON CONFLICT(singleton) DO UPDATE SET data=EXCLUDED.data,mime=EXCLUDED.mime,uploaded_by=EXCLUDED.uploaded_by,uploaded_at=now()`,[bytes,jpeg?"image/jpeg":"image/png",session.user.id]);
      return json(res,200,{ok:true});
    }
    await ensure(db);
    const row=(await db.query("SELECT data,mime FROM con.vault_background WHERE singleton=true")).rows[0];
    if(!row){
      res.writeHead(302,{Location:"/vault-door.svg","Cache-Control":"no-store"});
      return res.end();
    }
    res.setHeader("Content-Type",row.mime);
    res.setHeader("Content-Length",row.data.length);
    res.setHeader("Cache-Control","public, max-age=60, must-revalidate");
    res.setHeader("X-Content-Type-Options","nosniff");
    return res.status(200).end(req.method==="HEAD"?undefined:row.data);
  }catch(error){
    console.error("Vault image request failed",error.code||"");
    return json(res,503,{error:"Vault background temporarily unavailable"});
  }
}
