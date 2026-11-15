import {workshopDatabaseCall} from "./profile-db.js";
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags} from "discord.js";
const uid=x=>typeof x==="string"&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(x);
export const isWorkshopClaimMessage=message=>!message.author?.bot&&/^\s*accept\s*$/i.test(message.content||"");
const itemLabel={toolkit:"tool kit",lumber:"lumber",scrap:"scrap metal",medical_supplies:"medical supplies",
 seeds:"seed packets",electrical_parts:"electrical components",food:"food rations",steel_bracket:"steel brackets"};
export function formatWorkshopAssignment(a){
 const supplied=Object.entries(a.supplies||{}).map(([key,n])=>n+" × "+(itemLabel[key]||key)).join(", ")||"No special equipment required";
 return [
  "🔒 **JOB CLAIMED — "+String(a.title).slice(0,120)+"**",
  "<@"+a.user_id+">, the Overseer has assigned this shift to you. This objective is now locked to everyone else.",
  "",
  "📜 **MISSION BRIEFING**",
  "The old settlement is stirring again. A dispatch from the abandoned service corridors has reached the Workshop:",
  "“"+String(a.objective).slice(0,700)+"”",
  "",
  "📦 **ISSUED BY THE COMPOUND STOCKROOM:** "+supplied,
  "📍 **ORDERS:** Go to The Compound and complete your task at "+a.location+".",
  "⏳ **Report time:** <t:"+Math.floor(new Date(a.due_at).getTime()/1000)+":R>",
  "💰 **Salary:** "+a.credits+" Compound Credits · **XP:** "+a.xp,
  "",
  "The Overseer will contact you when your shift is due for completion."
 ].join("\n");
}
export function reminderButtons(jobId){
 if(!uid(jobId))throw Error("Invalid Workshop assignment ID");
 return [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("workshopconfirm:"+jobId+":yes").setLabel("Yes, completed").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId("workshopconfirm:"+jobId+":no").setLabel("Not yet").setStyle(ButtonStyle.Secondary)
 )];
}
export function formatWorkshopReminder(a){
 return [
  "⏰ <@"+a.discord_id+"> **THE OVERSEER REQUESTS A STATUS REPORT**",
  "Your assigned Workshop job **"+String(a.title).slice(0,140)+"** is due.",
  "Have you completed the assignment at "+a.job_location+"?",
  "Confirm below to receive **"+a.salary_credits+" Compound Credits** and **"+a.xp_reward+" XP**, or request 30 more minutes.",
  "Assignment reference: `workshop-reminder:"+a.post_id+"`"
 ].join("\n");
}
export async function acceptWorkshopClaim(m,send){
 if(!isWorkshopClaimMessage(m))return false;
 try{
  const data=await workshopDatabaseCall("claim",{guild_id:m.guildId,
    user_id:m.author.id,channel_id:m.channelId,message_id:m.id});
  await m.channel.send({content:formatWorkshopAssignment(data),
   allowedMentions:{users:[m.author.id],parse:[]}});
 }catch(e){
  const content=e.status===409?"❌ That job is unavailable, already assigned, or you're already on a shift. Check the pinned objective."
   :e.status===403?"Only active Compound members can accept Workshop jobs."
   :"The Overseer couldn't issue this assignment. Please try again.";
  await m.reply({content,allowedMentions:{parse:[],repliedUser:false}});
 }
 return true;
}
export async function pollWorkshopReminders(guild,send){
 const {assignment:a}=await workshopDatabaseCall("due",{guild_id:guild.id});
 if(!a)return false;
 if(!uid(a.post_id))throw Error("Invalid workshop reminder");
 const channel=await guild.channels.fetch(a.channel_id);
 if(!channel?.isTextBased()||!channel.send)throw Error("Workshop reminder channel unavailable");
 const marker="workshop-reminder:"+a.post_id+":"+Math.floor(new Date(a.due_at).getTime()/1000);
 let msg=(await channel.messages.fetch({limit:50})).find(m=>m.author.id===guild.client.user.id&&m.content.includes(marker))||null;
 if(!msg)msg=await channel.send({content:formatWorkshopReminder(a),
  components:reminderButtons(a.post_id),allowedMentions:{users:[a.discord_id],parse:[]}});
 await workshopDatabaseCall("reminder",{guild_id:guild.id,job_id:a.post_id,
  user_id:a.discord_id,channel_id:a.channel_id,message_id:msg.id});
 return true;
}
export async function answerWorkshop(i,send){
 const match=/^workshopconfirm:([\da-f-]{36}):(yes|no)$/.exec(i.customId||"");
 if(!match||!uid(match[1]))return false;
 await i.deferReply({flags:MessageFlags.Ephemeral});
 try{
  const r=await workshopDatabaseCall("answer",{guild_id:i.guildId,job_id:match[1],
   user_id:i.user.id,answer:match[2]});
  const message=r.already_completed?"This objective was already paid. No duplicate credits awarded."
   :r.extended?"Understood. The Overseer will check again in 30 minutes. Your job remains assigned to you."
   :"✅ **Assignment completed.** Salary: **+"+r.credits+" Compound Credits**. Experience: **+"+r.xp+" XP**. Total Compound XP: "+r.total_xp+". Tools returned to the stockroom.";
  await i.editReply({content:message,allowedMentions:{parse:[]}});
  if(r.completed){
   await i.message.edit({components:[]}).catch(()=>{});
   await i.channel.send({content:"✅ <@"+i.user.id+"> completed **"+r.title+"** and earned **"+r.credits+" Credits** and **"+r.xp+" XP**.",
    allowedMentions:{users:[i.user.id],parse:[]}});
  }else if(r.extended)await i.message.edit({components:[]}).catch(()=>{});
 }catch(e){
  const msg=e.status===403?"This assignment belongs to another resident."
   :e.status===409?"The job is not ready to complete, or the treasury cannot pay it yet."
   :"The Overseer couldn't record your response right now.";
  await i.editReply({content:msg,allowedMentions:{parse:[]}});
 }
 return true;
}
