import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {seal,ORIGIN} from "../server/auth.js";
import {facilityHandler} from "../server/facility.js";
process.env.SESSION_SECRET="tests-use-an-isolated-nonproduction-key-12345";
process.env.DISCORD_ADMIN_IDS="123456789012345678";
test("only owner can grant supplies to an active member, with quantity limits and audit",async()=>{
 const pg=new PGlite();
 try{
  await pg.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA con;");
  const db={async query(sql,args){if(sql.includes("pg_advisory_xact_lock"))return {rows:[],rowCount:0};const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length};},async connect(){return {query:this.query.bind(this),release(){}}}};
  async function call(uid,action,method="GET",body={}){
   const cookie=await seal({user:{id:uid,name:"Member",username:"member"}},600);
   const res={setHeader(){},end(s){this.data=JSON.parse(s||"{}")}};
   await facilityHandler({method,url:"/api/social?action=facility_"+action,body,headers:{origin:ORIGIN,cookie:"__Host-con_session="+cookie}},res,()=>db);
   return {status:res.statusCode,...res.data};
  }
  const owner="123456789012345678",member="234567890123456789";
  await call(owner,"state");
  await db.query("INSERT INTO con.memberships(user_id,member_no,codename,public_slug,active) VALUES($1,1,'Silent Badger','silent-badger',true)",[member]);
  assert.equal((await call(member,"grant","POST",{member_id:member,sku:"water",quantity:10})).status,403);
  assert.equal((await call(owner,"grant","POST",{member_id:member,sku:"water",quantity:101})).status,400);
  assert.equal((await call(owner,"grant","POST",{member_id:"345678901234567890",sku:"water",quantity:2})).status,404);
  assert.equal((await call(owner,"grant","POST",{member_id:member,sku:"water",quantity:3,note:"Test allocation"})).status,201);
  const state=await call(member,"state");
  assert.equal(state.inventory.find(x=>x.item==="water").quantity,3);
  const control=await call(owner,"control");
  assert.equal(control.grants[0].quantity,3);
  assert.equal(control.grants[0].member_name,"Silent Badger");
 }finally{await pg.close()}
});
