import test from "node:test";
import assert from "node:assert/strict";
import { reconcileVerifiedMembers } from "../bot/membership-roles.js";
const alice="123456789012345678", bob="234567890123456789";
function fixture({permission=true,safe=true,roleExists=true}={}){
  const guild={id:"987654321098765432"};
  const role={id:"555555555555555555",guild,name:"Verified Member",managed:false,permissions:{bitfield:safe?0n:8n}};
  const member=(id,has=false)=>({
    id,user:{bot:false},roles:{
      cache:new Map(has?[[role.id,role]]:[]),
      async add(item){this.cache.set(item.id,item)},
      async remove(item){this.cache.delete(item.id)}
    }
  });
  const a=member(alice),b=member(bob,true);
  const people=new Map([[a.id,a],[b.id,b]]);
  const me={permissions:{has(){return permission}},roles:{highest:{comparePositionTo(){return 1}}}};
  const roles=new Map(roleExists?[[role.id,role]]:[]);
  guild.members={async fetchMe(){return me},async fetch(){return people}};
  guild.roles={cache:{
    filter(fn){const found=[...roles.values()].filter(fn);return{size:found.length,first(){return found[0]}}},
  },async fetch(){},async create(input){assert.equal(input.permissions.length,0);roles.set(role.id,role);return role}};
  return {guild,a,b,role};
}
test("verified membership role is assigned to members and removed from inactive accounts",async()=>{
 const {guild,a,b,role}=fixture();
 const result=await reconcileVerifiedMembers(guild,[alice]);
 assert.deepEqual(result,{assigned:1,removed:1});
 assert.equal(a.roles.cache.has(role.id),true);
 assert.equal(b.roles.cache.has(role.id),false);
});
test("role synchronization requires Manage Roles and no privileged membership role",async()=>{
 const blocked=fixture({permission:false});
 assert.equal((await reconcileVerifiedMembers(blocked.guild,[alice])).skipped,true);
 const privileged=fixture({safe:false});
 assert.equal((await reconcileVerifiedMembers(privileged.guild,[alice])).skipped,true);
});
test("missing role is created without elevated permissions and invalid member IDs are rejected",async()=>{
 const {guild,a,role}=fixture({roleExists:false});
 const result=await reconcileVerifiedMembers(guild,[alice]);
 assert.equal(result.assigned,1);
 assert.equal(a.roles.cache.has(role.id),true);
 await assert.rejects(()=>reconcileVerifiedMembers(guild,["not-an-id"]));
});
