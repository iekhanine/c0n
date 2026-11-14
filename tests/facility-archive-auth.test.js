import test from "node:test";
import assert from "node:assert/strict";
import {facilityHandler} from "../server/facility.js";
import {archiveHandler} from "../server/archive.js";

function response(){
 return {statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body?JSON.parse(body):{};}};
}
test("Facility Control rejects unauthenticated reads and writes",async()=>{
 for(const [method,action] of [["GET","facility_state"],["POST","facility_decide"]]){
  const res=response();
  await facilityHandler({method,url:"/api/social?action="+action,headers:{}},res,()=>{throw Error("must not reach database")});
  assert.equal(res.statusCode,401);
 }
});
test("Archive rejects unauthenticated record and media reads",async()=>{
 for(const action of ["archive_list","archive_audio"]){
  const res=response();
  await archiveHandler({method:"GET",url:"/api/site-content?action="+action,headers:{}},res,()=>{throw Error("must not reach database")});
  assert.equal(res.statusCode,401);
 }
});
