import test from "node:test";
import assert from "node:assert/strict";
import {isWorkshopClaimMessage,formatWorkshopAssignment,formatWorkshopReminder,reminderButtons} from "./workshop-assignments.js";
const id="d22ea3c1-551c-45bf-b01e-e5ac5db50a82";
test("Only standalone accept marks a claim, never ordinary roleplay",()=>{
 assert.equal(isWorkshopClaimMessage({content:"accept",author:{bot:false}}),true);
 assert.equal(isWorkshopClaimMessage({content:" ACCEPT ",author:{bot:false}}),true);
 assert.equal(isWorkshopClaimMessage({content:"I accepted the job",author:{bot:false}}),false);
 assert.equal(isWorkshopClaimMessage({content:"accept",author:{bot:true}}),false);
});
test("Claim instructions identify member, warehouse goods, lore, location, and salary",()=>{
 const message=formatWorkshopAssignment({user_id:"999999999999999994",title:"Carpentry / Objective 1",
 objective:"Repair the eastern supports",supplies:{toolkit:1,lumber:4},
 location:"the eastern shelter",due_at:"2026-11-15T18:30:00Z",credits:350,xp:35});
 for(const fragment of ["<@999999999999999994>","4 × lumber","1 × tool kit",
 "the eastern shelter","350 Compound Dollars","35","Overseer"]) assert.ok(message.includes(fragment),fragment);
});
test("Reminder uniquely identifies timed job and buttons provide yes/no",()=>{
 const a={post_id:id,discord_id:"999999999999999994",due_at:"2026-11-15T18:30:00Z",
 title:"Carpentry / Objective 1",job_location:"the eastern shelter",salary_credits:350,xp_reward:35};
 const message=formatWorkshopReminder(a);assert.match(message,/Have you completed/);
 assert.match(message,/workshop-reminder:d22ea3c1/);
 const buttons=reminderButtons(id)[0].toJSON().components;
 assert.deepEqual(buttons.map(b=>b.custom_id),["workshopconfirm:"+id+":yes","workshopconfirm:"+id+":no"]);
});
