import test from "node:test";
import assert from "node:assert/strict";
import {THIRTY_PLUS_QUESTIONS,thirtyPlusQuestion} from "./thirty-plus-questions.js";
import {questionPost,shouldRecordTruthAnswer} from "./thirty-plus.js";

test("cycles 50 unique life-related prompts in original order",()=>{
 assert.equal(THIRTY_PLUS_QUESTIONS.length,50);
 assert.equal(new Set(THIRTY_PLUS_QUESTIONS.map(q=>q.text)).size,50);
 assert.match(thirtyPlusQuestion(0).text,/20s/);
 assert.match(thirtyPlusQuestion(49).text,/next 10 years/);
 assert.deepEqual(thirtyPlusQuestion(50),thirtyPlusQuestion(0));
 assert.deepEqual(thirtyPlusQuestion(99),thirtyPlusQuestion(49));
 assert.equal(THIRTY_PLUS_QUESTIONS.filter(q=>q.category==="The Hard Questions").length,10);
});
test("posts a single question with stable marker, safety and no mass pings",()=>{
 const post=questionPost({seq:51,index:2});
 assert.match(post.content,/Question 2\/50/);
 assert.match(post.content,/restart your life at 18/);
 assert.match(post.content,/truth-rotation:51/);
 assert.match(post.content,/skip any question/);
 assert.match(post.content,/\+1 Charisma/);
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
