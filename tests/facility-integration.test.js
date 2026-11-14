import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {seal,ORIGIN} from "../server/auth.js";
import {facilityHandler} from "../server/facility.js";

process.env.SESSION_SECRET="test_session_key_for_isolated_fixture_2026";
process.env.DISCORD_ADMIN_IDS="123456789012345678";

test("member cannot access controls or manipulate wallet balances",async()=>{
 const pg=new PGlite();
 try{
  await pg.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA con;");
  const db={
   async query(sql,args){if(sql.includes("pg_advisory_xact_lock"))return {rows:[],rowCount:0};const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length};},
   async connect(){return {query:this.query.bind(this),release(){}}}
  };
  async function call(uid,action,method="GET",body={}){
   const cookie=await seal({user:{id:uid,name:"Member",username:"member"}},600);
   const res={setHeader(){},end(value){this.data=JSON.parse(value||"{}")}};
   await facilityHandler({method,url:"/api/social?action=facility_"+action,body,headers:{origin:ORIGIN,cookie:"__Host-con_session="+cookie}},res,()=>db);
   return {status:res.statusCode,...res.data};
  }
  const guest="234567890123456789";
  assert.equal((await call(guest,"control")).status,403);
  assert.equal((await call(guest,"directive","POST",{directive:"x"})).status,403);
  assert.equal((await call(guest,"request","POST",{sku:"water",cost:0})).status,201);
  assert.equal((await call(guest,"state")).wallet.credits,0);
  const owner="123456789012345678";
  const requests=(await call(owner,"control")).requests;
  assert.equal(requests.length,1);
  assert.equal(requests[0].cost,6);
 }finally{await pg.close()}
});
