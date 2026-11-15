import test from "node:test";
import assert from "node:assert/strict";
import { SIDES,rollTabletop,rollDisplayName } from "./dice.js";
test("tabletop dice generate valid faces and keep exact modifiers",()=>{
 for(const sides of SIDES){
  const result=rollTabletop({sides,count:10,modifier:-7});
  assert.equal(result.faces.length,10);
  assert.ok(result.faces.every(n=>Number.isInteger(n)&&n>=1&&n<=sides));
  assert.equal(result.total,result.faces.reduce((s,n)=>s+n,-7));
 }
});
test("tabletop dice reject malicious values before posting to Discord",()=>{
 assert.throws(()=>rollTabletop({sides:21,count:2}),/Unsupported die/);
 assert.throws(()=>rollTabletop({sides:20,count:11}),/Roll 1 to 10/);
 assert.throws(()=>rollTabletop({sides:20,count:0}),/Roll 1 to 10/);
 assert.throws(()=>rollTabletop({sides:20,count:1,modifier:101}),/Modifier/);
 assert.throws(()=>rollTabletop({sides:20,count:1,modifier:1.4}),/Modifier/);
});

test("Dice messages prefer an assigned Compound codename over a Discord username",()=>{
 assert.equal(rollDisplayName({codename:"THE OVERSEER",serverDisplayName:"1van",globalName:"Ivan",username:"iekhan"}),"THE OVERSEER");
 assert.equal(rollDisplayName({codename:null,serverDisplayName:"1van",globalName:"Ivan",username:"iekhan"}),"1van");
 assert.equal(rollDisplayName({codename:null,serverDisplayName:null,globalName:"Ivan",username:"iekhan"}),"Ivan");
 assert.equal(rollDisplayName({username:"iekhan"}),"iekhan");
});
test("Dice member labels cannot inject mentions or Discord Markdown",()=>{
 assert.equal(rollDisplayName({codename:"@everyone **Overseer**"}),"everyone Overseer");
});
