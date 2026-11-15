import test from "node:test";
import assert from "node:assert/strict";
import { createCharacter, rollDice, publishTask, acceptTask } from "./engine.js";
import { donateMaterial } from "./projects.js";
const ID="999999999999999991";
function points(){
 return {strength:10,intelligence:10,charisma:10,agility:10,endurance:5,perception:5};
}
test("character creation enforces a fixed twenty-point allocation",async()=>{
 let touched=false;
 const pool={connect:()=>{touched=true;throw Error("should not query")}};
 await assert.rejects(createCharacter(pool,{discordId:ID,name:"Test",profession:"engineer",attributes:{...points(),perception:6}}),/exactly twenty/i);
 await assert.rejects(createCharacter(pool,{discordId:ID,name:"Test",profession:"engineer",attributes:{...points(),strength:11,perception:4}}),/Invalid/);
 await assert.rejects(createCharacter(pool,{discordId:"not-a-snowflake",name:"Test",profession:"engineer",attributes:points()}),/Discord/);
 assert.equal(touched,false);
});
test("character creation rolls back if a database operation fails",async()=>{
 const calls=[];
 const db={
  query:async(sql)=>{
   calls.push(sql);
   if(sql.startsWith("select id from con.game_professions"))return {rowCount:1,rows:[{id:"engineer"}]};
   if(sql.startsWith("insert into con.game_characters"))throw Error("duplicate character");
   return {rowCount:1,rows:[]};
  },release(){}
 };
 await assert.rejects(createCharacter({connect:async()=>db},{discordId:ID,name:"Builder",profession:"engineer",attributes:points()}),/duplicate/);
 assert.equal(calls[0],"BEGIN");
 assert.equal(calls.at(-1),"ROLLBACK");
});
test("d20 rolls use a cryptographic generator and persisted result",async()=>{
 let captured=null;
 const pool={query:async(sql,args)=>{
  assert.match(sql,/con.game_dice_rolls/);
  captured=args;
  return {rows:[{faces:args[4],total:args[6]}]};
 }};
 const result=await rollDice(pool,{sides:20,count:6,modifier:2,purpose:"initiative"});
 assert.equal(result.faces.length,6);
 assert.ok(result.faces.every(n=>Number.isInteger(n)&&n>=1&&n<=20));
 assert.equal(result.total,result.faces.reduce((a,b)=>a+b,2));
 assert.equal(captured[7],"initiative");
});
test("invalid dice and extreme modifiers are rejected",async()=>{
 const pool={query:()=>{throw Error("should not query")}};
 await assert.rejects(rollDice(pool,{sides:3,count:1,modifier:0}),/Unsupported die/);
 await assert.rejects(rollDice(pool,{sides:20,count:21,modifier:0}),/Invalid dice count/);
 await assert.rejects(rollDice(pool,{sides:20,count:1,modifier:101}),/Invalid modifier/);
});
test("task creation rejects negative payments, invalid duration and job type",async()=>{
 let touched=false;
 const pool={connect:()=>{touched=true;throw Error("should not query")}};
 const form={title:"Repair",completionType:"timer",minutes:15,xp:20,skillXp:30,pay:100};
 await assert.rejects(publishTask(pool,ID,{...form,pay:-1}),/Invalid pay/);
 await assert.rejects(publishTask(pool,ID,{...form,completionType:"free-money"}),/Invalid completion/);
 await assert.rejects(publishTask(pool,ID,{...form,minutes:10081}),/Invalid time/);
 assert.equal(touched,false);
});
test("donation validation rejects invalid IDs and quantities before opening a connection",async()=>{
 const pool={connect:()=>{throw Error("should not query")}};
 await assert.rejects(donateMaterial(pool,ID,{projectId:"fake",item:"scrap",quantity:1}),/Invalid project/);
 await assert.rejects(donateMaterial(pool,ID,{projectId:"00000000-0000-4000-8000-000000000101",item:"scrap",quantity:0}),/Invalid donation/);
});
test("accepting a work order validates Discord identity",async()=>{
 await assert.rejects(acceptTask({connect:()=>{throw Error("should not query")}},"invalid","x"),/Discord/);
});
