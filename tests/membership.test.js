import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { membershipHandler } from "../server/membership.js";
import { ORIGIN, seal } from "../server/auth.js";
const owner="123456789012345678", guest="234567890123456789", other="345678901234567890";
process.env.SESSION_SECRET="c0n-membership-tests-2026-secret-key-minimum-32";
process.env.DISCORD_ADMIN_IDS=owner;
test("only valid invitations grant membership and connect member lineage",async()=>{
  const pg=new PGlite();
  try{
    await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA con;");
    const db={
      async query(sql,args){const result=await pg.query(sql,args);return {...result,rowCount:result.affectedRows??result.rows.length};},
      async connect(){return {query:this.query.bind(this),release(){}}}
    };
    async function call(uid,action,method="GET",body={},origin=ORIGIN){
      const res={setHeader(){},end(content){this.body=JSON.parse(content)}};
      const token=uid?await seal({user:{id:uid,name:uid===owner?"nix0n":"Guest",username:"member"}},600):null;
      await membershipHandler({method,url:"/api/membership?action="+action,body,headers:{origin,...(token?{cookie:"__Host-con_session="+token}:{})}},res,()=>db);
      return {status:res.statusCode,...res.body};
    }
    assert.equal((await call(null,"me")).status,401);
    const founder=await call(owner,"me");
    assert.equal(founder.status,200);
    assert.equal(founder.member.member_no,1);
    assert.equal(founder.member.founding,true);
    assert.equal((await call(guest,"me")).member,null);
    assert.equal((await call(guest,"issue","POST",{count:1})).status,403);
    assert.equal((await call(owner,"issue","POST",{count:1}, "https://example.com")).status,403);
    const issued=await call(owner,"issue","POST",{count:2,city:"Racine",state:"WI",zip:"53403"});
    assert.equal(issued.status,201);
    assert.equal(issued.issued.length,2);
    assert.match(issued.issued[0].serial,/C0N-WI-RACINE-53403-B\d+-M00001-1/);
    assert.equal((await call(guest,"redeem","POST",{code:"INVALID"})).status,400);
    const activated=await call(guest,"redeem","POST",{code:issued.issued[0].code});
    assert.equal(activated.status,201);
    assert.equal(activated.member_no,2);
    assert.equal((await call(other,"redeem","POST",{code:issued.issued[0].code})).status,404);
    const member=await call(guest,"me");
    assert.equal(member.member.invited_by.member_no,1);
    assert.equal(member.member.founding,true);
    assert.ok(member.member.codename.includes(" "));
    assert.match(member.member.public_slug,/^[a-z0-9]+-[a-z0-9]+$/);
    assert.equal((await call(guest,"issue_test","POST",{count:1})).status,403);
    assert.equal((await call(guest,"issue","POST",{count:6})).status,403);
    const next=await call(guest,"issue","POST",{count:1});
    assert.equal(next.status,201);
    assert.equal((await call(guest,"revoke","POST",{serial:next.issued[0].serial})).status,200);
    assert.equal((await call(other,"redeem","POST",{code:next.issued[0].code})).status,404);
    const history=await call(owner,"invites");
    assert.equal(history.invites.length,2);
    assert.equal(history.invites.some(x=>x.status==="redeemed"),true);
    assert.equal(JSON.stringify(history).includes(issued.issued[0].code),false);
    const five=await call(guest,"issue","POST",{count:5});
    assert.equal(five.status,201);
    assert.equal((await call(guest,"issue","POST",{count:1})).status,403);
    assert.equal((await call(other,"redeem","POST",{code:five.issued[0].code})).status,201);
    assert.equal((await call(guest,"issue","POST",{count:1})).status,201);
  }finally{await pg.close();}
});
