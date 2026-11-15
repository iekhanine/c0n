import {
 ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags,
 ModalBuilder,TextInputBuilder,TextInputStyle
} from "discord.js";
const snowflake=x=>typeof x==="string"&&/^\d{17,20}$/.test(x);
const uuid=x=>typeof x==="string"&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(x);
export function formatWorkshopPost(job){
 if(!uuid(job.id)||!snowflake(job.channel_id))throw Error("Invalid Workshop post");
 const title=String(job.title).slice(0,140),description=String(job.objective).slice(0,1200);
 const stat=String(job.attribute).replace(/[^a-z]/g,"").slice(0,20);
 return [
  "📋 **THE WORKSHOP · DAILY OBJECTIVE**",
  "**"+title+"**",
  description,
  "",
  "🏅 **Reward:** +"+job.xp_reward+" XP · +"+job.attribute_reward+" "+stat.toUpperCase(),
  "⏱️ **Minimum shift:** "+job.min_minutes+" minutes",
  "**Steps:** Press Start Job, post an update about your work in this channel, then press Submit Work and describe what you accomplished.",
  "Rewards are earned once per resident per objective.",
  "",
  "Job reference: `workshop:"+job.id+"`"
 ].join("\n");
}
export function workshopButtons(id){
 if(!uuid(id))throw Error("Invalid Workshop job ID");
 return [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("workshop:start:"+id).setLabel("Start Job").setStyle(ButtonStyle.Primary).setEmoji("🔧"),
  new ButtonBuilder().setCustomId("workshop:submit:"+id).setLabel("Submit Work").setStyle(ButtonStyle.Success).setEmoji("✅")
 )];
}
export async function runWorkshopJobs(guild,send){
 if(!guild)return false;
 const result=await send({kind:"workshop_jobs_poll",guild_id:guild.id});
 const job=result?.job;
 if(!job)return false;
 if(!snowflake(job.channel_id)||!uuid(job.id))throw Error("Invalid scheduled job");
 const channel=await guild.channels.fetch(job.channel_id);
 if(!channel?.isTextBased()||typeof channel.send!=="function")throw Error("Workshop channel unavailable");
 const me=await guild.members.fetchMe();
 const perms=channel.permissionsFor(me);
 if(!perms?.has(["ViewChannel","SendMessages","ReadMessageHistory","ManageMessages"]))throw Error("Missing Workshop post/pin permissions");
 const marker="workshop:"+job.id;
 let message=null;
 // If Discord succeeded but the backend receipt timed out, recover the
 // same post by its immutable marker rather than sending a duplicate.
 const latest=await channel.messages.fetch({limit:50});
 message=latest.find(x=>x.author.id===guild.client.user.id&&x.content.includes(marker))||null;
 if(!message)message=await channel.send({
   content:formatWorkshopPost(job),
   components:workshopButtons(job.id),
   allowedMentions:{parse:[]}
 });
 if(!message.pinned)await message.pin("Daily Workshop objective");
 if(job.previous_message_id&&job.previous_message_id!==message.id){
  try{
   const previous=await channel.messages.fetch(job.previous_message_id);
   if(previous?.pinned)await previous.unpin("Replaced by new daily Workshop objective");
  }catch(e){console.warn("Old Workshop pin could not be removed",{code:e.code||"unpin"});}
 }
 await send({kind:"workshop_jobs_posted",guild_id:guild.id,job_id:job.id,
  channel_id:job.channel_id,message_id:message.id});
 console.info("Workshop daily objective published",{channel:job.channel_id,job:job.id});
 return true;
}
export async function handleWorkshopInteraction(i,send){
 const cid=i.customId||"";
 const match=/^workshop:(start|submit|report):([\da-f-]{36})$/.exec(cid);
 if(!match||!uuid(match[2]))return false;
 const action=match[1],job_id=match[2];
 if(action==="submit"){
  const modal=new ModalBuilder().setCustomId("workshop:report:"+job_id)
   .setTitle("Workshop Shift Report");
  const report=new TextInputBuilder().setCustomId("work_report")
   .setLabel("What did you accomplish?")
   .setPlaceholder("Describe the work you performed in this channel.")
   .setRequired(true).setMinLength(15).setMaxLength(500)
   .setStyle(TextInputStyle.Paragraph);
  modal.addComponents(new ActionRowBuilder().addComponents(report));
  await i.showModal(modal);
  return true;
 }
 await i.deferReply({flags:MessageFlags.Ephemeral});
 try{
  if(action==="start"){
   const r=await send({kind:"workshop_job_start",guild_id:i.guildId,job_id,user_id:i.user.id});
   const reply=r.completed?"You already completed this objective and earned its reward."
    :r.already_started?"Job already started. Post a work update in this channel and submit after the required shift."
    :"Job started! Post a work update here, then submit a report after "+r.min_minutes+" minutes.";
   await i.editReply({content:reply,allowedMentions:{parse:[]}});
  } else {
   const evidence=i.fields.getTextInputValue("work_report");
   const r=await send({kind:"workshop_job_complete",guild_id:i.guildId,job_id,user_id:i.user.id,evidence});
   const reply=r.already_completed?"Already claimed for this objective."
    :"Shift recorded. **+"+r.xp+" XP** and **+"+r.attribute_reward+" "+r.attribute.toUpperCase()+"**. Total XP: "+r.total_xp+".";
   await i.editReply({content:reply,allowedMentions:{parse:[]}});
  }
 } catch(e){
  const msg=e.status===409?"This shift is not ready or has expired. Check that you started it, waited the minimum duration, and posted a work update."
   :e.status===403?"You must be an active member of the server to claim Workshop XP."
   :"The Workshop could not record this action right now. Try again.";
  await i.editReply({content:msg,allowedMentions:{parse:[]}});
 }
 return true;
}
