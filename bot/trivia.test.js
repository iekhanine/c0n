import test from "node:test";
import assert from "node:assert/strict";
import { QUESTION_BANK, drawQuestions, scorePlayers, triviaConfig } from "./trivia.js";

test("TVM game bank contains exactly 100 unique, well-formed questions",()=>{
  assert.equal(QUESTION_BANK.length,100);
  assert.equal(new Set(QUESTION_BANK.map(q=>q.id)).size,100);
  for(const q of QUESTION_BANK){
    assert.match(q.id,/^[a-z]{2}_\d+$/);
    assert.ok(q.question.length>=15);
    assert.equal(q.options.length,4);
    assert.equal(new Set(q.options.map(s=>s.trim().toLowerCase())).size,4);
    assert.ok(Number.isInteger(q.correct)&&q.correct>=0&&q.correct<=3);
    assert.ok(q.options.every(s=>typeof s==="string"&&s.length>0&&s.length<=75));
    if(q.category==="year") assert.ok(q.options.every(s=>/^(18|19|20)\d\d$/.test(s)),"year options must ALL be years: "+q.id);
    else assert.ok(q.options.every(s=>/[a-zA-Z]/.test(s)),"non-year distractor of wrong type: "+q.id);
  }
});
test("round draw uses 10 distinct questions and does not mutate bank",()=>{
  const rounds=drawQuestions(QUESTION_BANK,10,n=>0);
  assert.equal(rounds.length,10);
  assert.equal(new Set(rounds.map(x=>x.id)).size,10);
  assert.notEqual(rounds[0],QUESTION_BANK.find(x=>x.id===rounds[0].id));
});
test("trivia scoring rewards correct answers, first place, and 3-in-a-row intellect",()=>{
  const rounds=[{correct:1},{correct:0},{correct:3},{correct:2}];
  const answers=[
    new Map([["1",{choice:1,name:"Alpha"}],["2",{choice:0,name:"Beta"}]]),
    new Map([["1",{choice:0,name:"Alpha"}],["2",{choice:0,name:"Beta"}]]),
    new Map([["1",{choice:3,name:"Alpha"}],["2",{choice:2,name:"Beta"}]]),
    new Map([["1",{choice:1,name:"Alpha"}],["2",{choice:2,name:"Beta"}]]),
  ];
  const scores=scorePlayers(rounds,answers);
  assert.equal(scores[0].id,"1");
  assert.equal(scores[0].correct,3);
  assert.equal(scores[0].max_streak,3);
  assert.equal(scores[0].intellect,1);
  assert.equal(scores[0].xp,40);
  assert.equal(scores[1].correct,2);
  assert.equal(scores[1].xp,10);
  assert.equal(scores[1].intellect,0);
});
test("skipping a round breaks a winning streak",()=>{
  const rounds=[{correct:1},{correct:1},{correct:1},{correct:1}];
  const votes=[new Map([["1",{choice:1,name:"A"}]]),new Map(),new Map([["1",{choice:1,name:"A"}]]),new Map([["1",{choice:1,name:"A"}]])];
  const [score]=scorePlayers(rounds,votes);
  assert.equal(score.max_streak,2);
  assert.equal(score.intellect,0);
});
test("no correct answers gives no winner bonus",()=>{
  const [score]=scorePlayers([{correct:2}],[new Map([["1",{choice:1,name:"A"}]])]);
  assert.equal(score.xp,0);
  assert.equal(score.winner,false);
});

test("trivia defaults and optional command settings",()=>{
  assert.deepEqual(triviaConfig(),{questions:10,seconds:20});
  assert.deepEqual(triviaConfig(5,10),{questions:5,seconds:10});
  assert.deepEqual(triviaConfig(100,120),{questions:100,seconds:120});
  assert.throws(()=>triviaConfig(0,10),/Questions/);
  assert.throws(()=>triviaConfig(101,10),/Questions/);
  assert.throws(()=>triviaConfig(5,4),/Seconds/);
  assert.throws(()=>triviaConfig(5,121),/Seconds/);
  assert.equal(drawQuestions(QUESTION_BANK,5).length,5);
});
