import test from "node:test";
import assert from "node:assert/strict";
import {buildProfileCard} from "./profile.js";

const member="123456789012345678";
const sample={
 member:{id:member,display_name:"Night Owl",avatar:null,apartment:"The Unhoused",membership:null},
 stats:{xp:480,level:2,health:82,stamina:75,skill:16,charisma:11,intellect:8,luck:6}
};
test("unhoused resident embeds all seven stats, no false verification and a direct profile link",()=>{
 const payload=buildProfileCard(sample);
 const embed=payload.embeds[0].toJSON();
 assert.equal(embed.fields.length,7);
 assert.match(embed.title,/Night Owl/);
 assert.match(embed.description,/The Unhoused/);
 assert.match(embed.description,/UNVERIFIED/);
 assert.equal(embed.fields[0].name,"⬡  LEVEL 2");
 assert.match(embed.fields[0].value,/480 XP/);
 for(const label of ["HEALTH","STAMINA","SKILL","CHARISMA","INTELLECT","LUCK"]){
  assert.ok(embed.fields.some(x=>x.name.includes(label)),label+" missing");
 }
 const components=payload.components[0].toJSON().components;
 assert.equal(components.length,1);
 assert.equal(components[0].url,"https://thecompound.cultofnixon.com/u/"+member);
 assert.deepEqual(payload.allowedMentions,{parse:[]});
});
test("verified members show their actual member number and apartment",()=>{
 const payload=buildProfileCard({...sample,member:{...sample.member,apartment:"F3-06",
  membership:{verified:true,codename:"The Wanderer",member_no:"000027",joined_at:"2026-11-14T10:00:00Z"}}});
 const json=payload.embeds[0].toJSON();
 assert.match(json.title,/The Wanderer/);
 assert.match(json.description,/VERIFIED MEMBER.*000027/);
 assert.match(json.description,/F3-06/);
});
test("missing server data never creates invented characters or URLs",()=>{
 assert.throws(()=>buildProfileCard(null));
 assert.throws(()=>buildProfileCard({member:{id:"not-a-discord-id"},stats:{}}));
});
