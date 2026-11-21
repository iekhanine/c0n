import test from "node:test";
import assert from "node:assert/strict";
import {THIRTY_PLUS_QUESTIONS,thirtyPlusQuestion} from "./thirty-plus-questions.js";
import {questionPost,shouldRecordTruthAnswer,CAMPFIRE_ORDER} from "./thirty-plus.js";

test("cycles 1,000 distinct adult-life prompts without repeating early",()=>{
 assert.equal(THIRTY_PLUS_QUESTIONS.length,1000);
 assert.equal(new Set(THIRTY_PLUS_QUESTIONS.map(q=>q.text)).size,1000);
 assert.match(thirtyPlusQuestion(0).text,/20s/);
 assert.match(thirtyPlusQuestion(49).text,/next 10 years/);
 assert.match(thirtyPlusQuestion(999).text,/choosing what deserves your attention/);
 assert.notDeepEqual(thirtyPlusQuestion(50),thirtyPlusQuestion(0));
 assert.deepEqual(thirtyPlusQuestion(1000),thirtyPlusQuestion(0));
 assert.deepEqual(thirtyPlusQuestion(1999),thirtyPlusQuestion(999));
 assert.equal(THIRTY_PLUS_QUESTIONS.filter(q=>q.category==="The Hard Questions").length,10);
});
test("posts clean plain-text questions without mass mentions",()=>{
 const post=questionPost({seq:51,index:2});
 assert.doesNotMatch(post.content,/Question 2\/1000/);
 assert.doesNotMatch(post.content,/THIRTY PLUS|UTC|new question appears|30 minutes|Charisma|Talk about it/i);
 assert.doesNotMatch(post.content, /@here|@everyone|^\s|\n\n/);
 assert.ok(post.content.endsWith("?"));
 assert.doesNotMatch(post.content,/truth-rotation|Question \d+\/|Life & Regrets/);


 assert.deepEqual(post.allowedMentions,{parse:[]});
 assert.throws(()=>questionPost({seq:-1,index:2}));
});
test("accepts meaningful natural conversation without accepting spam or bot messages",()=>{
 const channel="1570103248453509281";
 const input={guildId:"903106349850849370",channelId:channel,webhookId:null,
  author:{id:"267489014922215434",bot:false},
  content:"I once quit my job without another one lined up, and it changed my outlook."};
 assert.equal(shouldRecordTruthAnswer(input,channel),true);
 assert.equal(shouldRecordTruthAnswer({...input,channelId:"1570103248453509282"},channel),false);
 assert.equal(shouldRecordTruthAnswer({...input,author:{bot:true}},channel),false);
 assert.equal(shouldRecordTruthAnswer({...input,webhookId:"1570103248453509283"},channel),false);
 assert.equal(shouldRecordTruthAnswer({...input,content:"yes"},channel),false);
 assert.equal(shouldRecordTruthAnswer({...input,content:"/wallet show my cash"},channel),false);
});

test("interleaves categories without repeating themes consecutively",()=>{
 assert.equal(CAMPFIRE_ORDER.length,1000);
 assert.equal(new Set(CAMPFIRE_ORDER).size,1000);
 const cats=CAMPFIRE_ORDER.map(i=>THIRTY_PLUS_QUESTIONS[i].category);
 for(let i=1;i<cats.length;i++)assert.notEqual(cats[i],cats[i-1]);
});

test("Campfire bank does not contain broken generated sentence patterns",()=>{
 const bad=/if you faced|dealing with dealing|what would you approach differently if|what's a particular moment involving/i;
 for(const q of THIRTY_PLUS_QUESTIONS){
  assert.doesNotMatch(q.text,bad);
  assert.ok(q.text.endsWith("?"),q.text);
 }
 assert.ok(THIRTY_PLUS_QUESTIONS.some(q=>q.text==="What's a piece of technology you resisted using but now love?"));
 assert.ok(THIRTY_PLUS_QUESTIONS.some(q=>q.text==="Have you ever felt jealous of someone else's success, even while being happy for them?"));
});
