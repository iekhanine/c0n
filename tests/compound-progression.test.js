import test from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {ensureCompoundSchema,publicCompoundProfile,applyTriviaResults} from "../server/compound.js";

const USER="123456789012345678";
const GUILD="923456789012345678";
test("a Discord resident receives two weeks of recorded XP and Charisma before first login; trivia is idempotent",async()=>{
 const pg=new PGlite();
 try {
  await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  const db={
   async query(sql,params){
    if(params===undefined && sql.includes(";")){await pg.exec(sql);return {rows:[],rowCount:0};}
    const result=await pg.query(sql,params);
    return {...result,rowCount:result.affectedRows??result.rows.length};
   }
  };
  await ensureCompoundSchema(db);
  await db.query("CREATE TABLE con.discord_settings(id boolean PRIMARY KEY,guild_id text)");
  await db.query("INSERT INTO con.discord_settings(id,guild_id)VALUES(true,$1)",[GUILD]);
  await db.query("CREATE TABLE con.discord_members(guild_id text,discord_id text,name text,avatar text,joined_at timestamptz,active boolean,is_bot boolean)");
  await db.query("INSERT INTO con.discord_members(guild_id,discord_id,name,avatar,joined_at,active,is_bot)VALUES($1,$2,'No Login Yet',null,now()-interval '20 days',true,false)",[GUILD,USER]);
  await db.query("CREATE TABLE con.discord_participation_events(guild_id text,event_id text,event_type text,channel_id text,user_id text,occurred_at timestamptz,onboarding boolean)");
  const rows=[];
  for(let day=0;day<14;day++){
   const date=new Date(Date.UTC(2026,9,day+1,12)).toISOString();
   for(let i=0;i<25;i++)rows.push([GUILD,"msg-"+day+"-"+i,"message",GUILD,USER,date,false]);
   for(let i=0;i<18;i++)rows.push([GUILD,"react-"+day+"-"+i,"reaction",GUILD,USER,date,false]);
  }
  // Set distinctive timestamps for deterministic row_number ordering.
  for(let i=0;i<rows.length;i++){
   const d=new Date(rows[i][5]);d.setMilliseconds(i%1000);rows[i][5]=d.toISOString();
  }
  const values=rows.map((x,i)=>"("+x.map((_,j)=>"$"+(i*7+j+1)).join(",")+")").join(",");
  // Do not rely on logging into the website to seed the user or events.
  await db.query("INSERT INTO con.discord_participation_events(guild_id,event_id,event_type,channel_id,user_id,occurred_at,onboarding) VALUES"+values,rows.flat());
  const first=await publicCompoundProfile(db,USER);
  assert.equal(first.member.apartment,"The Unhoused");
  assert.equal(first.member.membership,null);
  assert.equal(first.stats.xp,14*(20*5+15));
  assert.equal(first.stats.charisma,5+28);
  assert.equal(first.stats.level,1+Math.floor(first.stats.xp/250));
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM con.compound_progress_events WHERE discord_id=$1",[USER])).rows[0].n,14*(20+15));
  const second=await publicCompoundProfile(db,USER);
  assert.equal(second.stats.xp,first.stats.xp);
  assert.equal(second.stats.charisma,first.stats.charisma);
  const match="33333333-3333-4333-8333-333333333333";
  const result={match_id:match,guild_id:GUILD,results:[{id:USER,name:"No Login Yet",correct:5,max_streak:3}]};
  assert.equal((await applyTriviaResults(db,db,result)).awarded,1);
  assert.equal((await applyTriviaResults(db,db,result)).duplicate,true);
  const after=await publicCompoundProfile(db,USER);
  assert.equal(after.stats.xp,first.stats.xp+50);
  assert.equal(after.stats.intellect,6);
  const rows2=(await db.query("SELECT source,xp_delta,intellect_delta FROM con.compound_progress_events WHERE discord_id=$1 AND source='trivia'",[USER])).rows;
  assert.equal(rows2.length,1);
  assert.equal(Number(rows2[0].xp_delta),50);
  assert.equal(Number(rows2[0].intellect_delta),1);
 }finally{await pg.close();}
});
