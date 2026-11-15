import { readFileSync } from "node:fs";
import { randomInt, randomUUID } from "node:crypto";
import { MessageFlags, ChannelType } from "discord.js";
const data=JSON.parse(readFileSync(new URL("./trivia-questions.json", import.meta.url),"utf8"));
export const QUESTION_BANK=data.questions;
export const GAMES_CATEGORY_ID="1570509079040884957";
const ANSWER_SECONDS=20, BETWEEN_ROUNDS_MS=4000, ROUND_COUNT=10;
export const TRIVIA_LIMITS={minQuestions:1,maxQuestions:100,minSeconds:5,maxSeconds:120};
export function triviaConfig(questions=ROUND_COUNT,seconds=ANSWER_SECONDS){
  if(!Number.isInteger(questions)||questions<TRIVIA_LIMITS.minQuestions||questions>TRIVIA_LIMITS.maxQuestions)throw Error('Questions must be from 1 to 100');
  if(!Number.isInteger(seconds)||seconds<TRIVIA_LIMITS.minSeconds||seconds>TRIVIA_LIMITS.maxSeconds)throw Error('Seconds must be from 5 to 120');
  return {questions,seconds};
}
function assertBank(bank) {
  if(bank.length!==100)throw Error("Trivia question bank must contain exactly 100 questions");
  const ids=new Set();
  for(const q of bank){
    if(ids.has(q.id))throw Error("Duplicate trivia question ID");
    ids.add(q.id);
    if(!q.id||typeof q.question!=="string"||!Array.isArray(q.options)||q.options.length!==4||!Number.isInteger(q.correct)||q.correct<0||q.correct>3||new Set(q.options).size!==4)throw Error("Invalid question "+q.id);
    if(q.category==="year"&&!q.options.every(a=>/^(18|19|20)\d{2}$/.test(a)))throw Error("Mismatched year question "+q.id);
    if(q.category!=="year"&&q.options.some(a=>!/[a-zA-Z]/.test(a)))throw Error("Mismatched name question "+q.id);
  }
}
assertBank(QUESTION_BANK);
export function drawQuestions(bank=QUESTION_BANK,count=ROUND_COUNT,random= n=>randomInt(n)){
  if(!Number.isInteger(count)||count<1||count>bank.length)throw Error("Invalid question count");
  const copy=[...bank];
  for(let i=copy.length-1;i>0;i--){const j=random(i+1);[copy[i],copy[j]]=[copy[j],copy[i]];}
  return copy.slice(0,count).map(q=>({...q,options:[...q.options]}));
}
export function scorePlayers(rounds,answers){
  const participants=new Map();
  for(let round=0;round<rounds.length;round++){
    const q=rounds[round];
    const votes=answers[round]||new Map();
    for(const [id,record] of votes){
      let p=participants.get(id);
      if(!p){p={id,name:record.name,correct:0,max_streak:0,current_streak:0,answers:0};participants.set(id,p);}
      p.name=record.name;
      p.answers++;
      if(record.choice===q.correct){p.correct++;p.current_streak++;p.max_streak=Math.max(p.max_streak,p.current_streak);}
      else p.current_streak=0;
    }
    // Not answering the next question breaks the streak.
    for(const p of participants.values())if(!votes.has(p.id))p.current_streak=0;
  }
  const result=[...participants.values()];
  const high=Math.max(0,...result.map(p=>p.correct));
  return result.map(({current_streak,...p})=>({...p,winner:high>0&&p.correct===high,
    xp:p.correct*5+(high>0&&p.correct===high?25:0),
    intellect:Math.floor(p.max_streak/3)})).sort((a,b)=>b.correct-a.correct||a.id.localeCompare(b.id));
}
const sessions=new Map();
const byChannel=new Map();
const row=(q,disabled=false)=>({type:1,components:q.options.map((option,index)=>({
  type:2,style:2,custom_id:"trivia:"+q._matchId+":"+q._round+":"+index,
  label:(["A","B","C","D"][index])+". "+option.slice(0,72),disabled
}))});
function content(session,reveal=false){
  const q=session.rounds[session.round];
  const answers=session.answers[session.round];
  const lines=[
    "🎲 **THE COMPOUND | TRIVIA**",
    "**Question "+(session.round+1)+" / "+session.rounds.length+"** · "+q.category.toUpperCase(),
    "",
    "**"+q.question+"**",
    "",
    "Choose one answer using the buttons below.",
    "⏱️ "+session.answerSeconds+" seconds · "+answers.size+" answer(s) recorded",
  ];
  if(reveal)lines.push("\n✅ **Correct answer: "+q.options[q.correct]+"**");
  return lines.join("\n");
}
async function replySafe(i,message){if(i.replied||i.deferred)return i.followUp({content:message,flags:MessageFlags.Ephemeral});return i.reply({content:message,flags:MessageFlags.Ephemeral});}
function stopSession(s){
  s.active=false;
  sessions.delete(s.id);
  byChannel.delete(s.channelId);
  if(s.timer)clearTimeout(s.timer);
}
async function finish(session,send){
  if(!session.active)return;
  stopSession(session);
  const scores=scorePlayers(session.rounds,session.answers);
  let credited=false;
  const result={kind:"trivia_result",guild_id:session.guildId,match_id:session.id,
    results:scores.map(x=>({id:x.id,name:x.name,correct:x.correct,max_streak:x.max_streak}))};
  if(scores.length){
    // The signed bridge uses a unique match UUID to ensure repeat submissions do not duplicate rewards.
    for(let attempt=0;attempt<3;attempt++){
      try{await send(result);credited=true;break;}
      catch(e){console.warn("Trivia credit attempt failed",{attempt:attempt+1,code:e.status||e.code||"unknown"});}
    }
  }else credited=true;
  const summary=scores.length?scores.slice(0,10).map((p,i)=>
    (i+1)+". **"+p.name.replace(/[*_~|<>@]/g,"")+"** · "+p.correct+"/"+session.rounds.length+" correct · "+p.xp+" XP"+(p.intellect?" · +"+p.intellect+" Intellect":"")).join("\n"):"No responses recorded.";
  const message="🏆 **TRIVIA COMPLETE**\n"+summary+"\n\n"+(credited?
    "Rewards were recorded in The Compound.":"⚠️ Rewards could not be verified; results are displayed but not marked as awarded.");
  await session.message.edit({content:message,components:[],allowedMentions:{parse:[]}}).catch(()=>{});
}
async function advance(session,send){
  if(!session.active)return;
  const q=session.rounds[session.round];
  if(session.message)await session.message.edit({content:content(session,true),components:[row(q,true)],allowedMentions:{parse:[]}}).catch(()=>{});
  session.timer=setTimeout(()=>{void (async()=>{
    if(!session.active)return;
    session.round++;
    if(session.round>=session.rounds.length)return finish(session,send);
    await postRound(session,send);
  })().catch(e=>{console.error("Trivia round advance failed",{code:e.code||"unknown"});stopSession(session);});},BETWEEN_ROUNDS_MS);
}
async function postRound(s,send){
  const q=s.rounds[s.round];
  q._matchId=s.id;q._round=s.round;
  s.deadline=Date.now()+s.answerSeconds*1000;
  const body={content:content(s),components:[row(q)],allowedMentions:{parse:[]}};
  if(!s.message)s.message=await s.channel.send(body);else await s.message.edit(body);
  s.timer=setTimeout(()=>{void advance(s,send).catch(e=>{console.error("Trivia timer failed",{code:e.code||"unknown"});stopSession(s);});},s.answerSeconds*1000);
}
export async function handleTrivia(i,send){
  if(!i.guildId)return false;
  if(i.isChatInputCommand()&&i.commandName==="trivia"){
    if(i.channel?.parentId!==GAMES_CATEGORY_ID)return replySafe(i,"Start trivia in a channel under [ THE GAMES ].").then(()=>true);
    if(!i.channel?.send)return replySafe(i,"This channel cannot host trivia.").then(()=>true);
    if(byChannel.has(i.channelId))return replySafe(i,"A trivia game is already running here.").then(()=>true);
    const config=triviaConfig(i.options.getInteger("questions")??ROUND_COUNT,i.options.getInteger("seconds")??ANSWER_SECONDS);
    const id=randomUUID(),rounds=drawQuestions(QUESTION_BANK,config.questions);
    const s={id,guildId:i.guildId,channelId:i.channelId,channel:i.channel,rounds,
      answers:rounds.map(()=>new Map()),round:0,active:true,message:null,timer:null,deadline:0,answerSeconds:config.seconds};
    sessions.set(id,s);byChannel.set(s.channelId,s);
    await replySafe(i,"Trivia started! "+config.questions+" question(s), "+config.seconds+" seconds per question. Every member can participate.");
    try{await postRound(s,send);}catch(e){stopSession(s);console.error("Trivia session start failed",{code:e.code||"unknown"});}
    return true;
  }
  if(i.isButton()&&i.customId.startsWith("trivia:")){
    if(i.guildId===null)return false;
    const parts=i.customId.split(":");
    if(parts.length!==4)return false;
    const s=sessions.get(parts[1]),round=Number(parts[2]),choice=Number(parts[3]);
    if(!s||!s.active||s.guildId!==i.guildId||s.channelId!==i.channelId||round!==s.round||Date.now()>=s.deadline||!Number.isInteger(choice)||choice<0||choice>3){
      await replySafe(i,"This question has closed.");return true;
    }
    const votes=s.answers[round];
    // Private, self-clearing acknowledgment. Never change the shared
    // answer buttons: a yellow/selected button there would mislead everyone.
    if(votes.has(i.user.id)){await i.deferUpdate();return true;}
    votes.set(i.user.id,{choice,name:(i.member?.displayName||i.user.globalName||i.user.username).slice(0,80)});
    await i.reply({
      content:"🟨 **"+["A","B","C","D"][choice]+" locked in**",
      flags:MessageFlags.Ephemeral,
    });
    // A short confirmation is useful, but a dismissible message per question is not.
    // Do not block the interaction handler on the delay or deletion.
    const receiptTimer=setTimeout(()=>{
      void i.deleteReply().catch(e=>console.warn("Trivia receipt cleanup failed",{code:e.code||"unknown"}));
    },2200);
    receiptTimer.unref?.();
    return true;
  }
  return false;
}
export async function registerTrivia(guild){
  await guild.commands.create({name:"trivia",description:"Play The Compound trivia",
    options:[
      {name:"questions",description:"Number of questions (default 10)",type:4,required:false,min_value:1,max_value:100},
      {name:"seconds",description:"Time to answer each question in seconds (default 20)",type:4,required:false,min_value:5,max_value:120},
    ]});
}

export async function ensureTriviaChannel(guild){
  const category=await guild.channels.fetch(GAMES_CATEGORY_ID).catch(()=>null);
  if(!category||category.type!==ChannelType.GuildCategory){
    console.warn("Trivia setup: The Games category was not accessible.");
    return null;
  }
  await guild.channels.fetch();
  const existing=[...guild.channels.cache.values()].find(c=>c.parentId===category.id &&
    c.type===ChannelType.GuildText && c.name.toLowerCase()==="trivia");
  if(existing)return existing;
  const member=await guild.members.fetchMe();
  if(!category.permissionsFor(member)?.has("ManageChannels")){
    console.warn("Trivia setup: bot cannot create #trivia in The Games.");
    return null;
  }
  const channel=await guild.channels.create({
    name:"trivia",type:ChannelType.GuildText,parent:category.id,
    topic:"C0N Trivia. Use /trivia start for a ten-question match. Character rewards are recorded in The Compound.",
    reason:"Owner-approved C0N trivia deployment",
  });
  console.info("C0N trivia channel created",{channel_id:channel.id});
  return channel;
}
