import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {ensureSocial} from "../server/social.js";

test("social schema supports public identity privacy and immutable reward history",async()=>{
 const pg=new PGlite();
 try{
  await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA con;");
  const db={query:(sql,args)=>pg.query(sql,args)};
  await ensureSocial(db);
  await pg.query("INSERT INTO con.profiles(user_id,name,username) VALUES($1,$2,$3)",["123456789012345678","Private Name","hidden_discord"]);
  const p=(await pg.query("SELECT public_display_name,show_discord_name FROM con.profiles")).rows[0];
  assert.equal(p.public_display_name,"");
  assert.equal(p.show_discord_name,false);
  await pg.query("UPDATE con.profiles SET public_display_name=$1,show_discord_name=true WHERE user_id=$2",["Public Alias","123456789012345678"]);
  await pg.query("INSERT INTO con.reputation_ledger(id,user_id,post_id,voter_id,points)VALUES($1,$2,$3,$4,$5)",[
   "00000000-0000-4000-8000-000000000001","123456789012345678","00000000-0000-4000-8000-000000000002","234567890123456789",1
  ]);
  const points=(await pg.query("SELECT coalesce(sum(points),0)::int AS n FROM con.reputation_ledger WHERE user_id=$1",["123456789012345678"])).rows[0].n;
  assert.equal(points,1);
 }finally{await pg.close();}
});
