import test from "node:test";
import assert from "node:assert/strict";
import {mapProfileRow,fetchReadOnlyProfile} from "./profile-db.js";

test("read-only profile row exposes only public member identity and game stats",()=>{
 const source={
  discord_id:"123456789012345678",display_name:"Resident",avatar:null,
  apartment:null,member_no:14,codename:"Oracle",member_joined_at:"2026-11-14",
  xp:1260,level:6,health:90,stamina:70,skill:12,charisma:45,intellect:21,luck:9,
  super_secret:"MUST_NOT_LEAK",staff_audit:"PRIVATE",manual_xp:100
 };
 const result=mapProfileRow(source);
 assert.equal(result.member.id,source.discord_id);
 assert.equal(result.member.apartment,"The Unhoused");
 assert.equal(result.member.membership.member_no,"000014");
 assert.deepEqual(Object.keys(result.stats).sort(),["charisma","health","intellect","level","luck","skill","stamina","xp"].sort());
 assert.doesNotMatch(JSON.stringify(result),/MUST_NOT_LEAK|PRIVATE|manual_xp/);
 assert.deepEqual(mapProfileRow(null),{not_found:true});
});
test("when no restricted database credential is configured, lookup safely defers to signed API",async()=>{
 const previous=process.env.CON_PROFILE_DATABASE_URL;
 try{
  delete process.env.CON_PROFILE_DATABASE_URL;
  assert.equal(await fetchReadOnlyProfile("123456789012345678"),null);
  await assert.rejects(fetchReadOnlyProfile("not-a-discord-id"),/Invalid Discord ID/);
 }finally{
  if(previous!==undefined)process.env.CON_PROFILE_DATABASE_URL=previous;
 }
});
