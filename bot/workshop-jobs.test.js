import test from "node:test";
import assert from "node:assert/strict";
import {formatWorkshopPost,workshopButtons,handleWorkshopInteraction} from "./workshop-jobs.js";
const id="d22ea3c1-551c-45bf-b01e-e5ac5db50a82";
const channel="1571523950033248266";
test("Daily Workshop posts carry immutable id, rewards, and required steps",()=>{
 const message=formatWorkshopPost({id,channel_id:channel,title:"Carpentry / Objective 1",
  objective:"Inspect the surface shelter and write a short report.",xp_reward:35,
  attribute:"skill",attribute_reward:1,min_minutes:10});
 assert.match(message,/Carpentry \/ Objective 1/);
 assert.match(message,/\+35 XP/);
 assert.match(message,/\+1 SKILL/);
 assert.match(message,/Start Job/);
 assert.match(message,/post an update/);
 assert.match(message,new RegExp(id));
 assert.equal(message.includes("@everyone"),false);
});
test("Start and Submit buttons share exact job id",()=>{
 const row=workshopButtons(id)[0].toJSON();
 assert.deepEqual(row.components.map(c=>c.custom_id),["workshop:start:"+id,"workshop:submit:"+id]);
});
test("Reject malformed scheduled posts and invalid IDs",()=>{
 assert.throws(()=>formatWorkshopPost({id:"x",channel_id:channel}),/Invalid Workshop/);
 assert.throws(()=>workshopButtons("not-an-id"),/Invalid Workshop/);
});
test("Unknown components are ignored",async()=>{
 assert.equal(await handleWorkshopInteraction({customId:"unrelated:button"},async()=>{}),false);
});
