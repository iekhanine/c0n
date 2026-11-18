import {ChannelType,PermissionFlagsBits} from "discord.js";
import {thirtyPlusDatabaseCall} from "./profile-db.js";
import {THIRTY_PLUS_QUESTIONS,thirtyPlusQuestion} from "./thirty-plus-questions.js";

export const THIRTY_PLUS_CHANNEL_NAME="campfire-questions";
const LEGACY_CHANNEL_NAME="30-plus-truths";
const PARENT_CATEGORY_ID="903106349850849371";
const TOPIC="The Compound's conversation circle. One life question at a time. You can skip anything. Replies may earn Charisma; answers are retained for 30 days.";
const safeString=s=>String(s??"");
export function questionPost({seq,index}){
 if(!Number.isSafeInteger(seq)||seq<0||!Number.isInteger(index)||index<1||index>THIRTY_PLUS_QUESTIONS.length)
   throw Error("Invalid Compound question rotation");
 const q=thirtyPlusQuestion(index-1);
 return {
  content:"@here\n\n"+q.text+"\n\n||truth-rotation:"+seq+"||",
  allowedMentions:{parse:["everyone"]}
 };
}
export function shouldRecordTruthAnswer(message,channelId){
 if(!message||message.author?.bot||message.webhookId||message.channelId!==channelId||!message.guildId)return false;
 const content=safeString(message.content).trim();
 return content.length>=25&&content.length<=1500&&content.split(/\s+/).length>=4
  &&!content.startsWith("/")&&!/^<@!?\d+>/.test(content);
}
export async function ensureThirtyPlusChannel(guild,logger=console){
 await guild.channels.fetch();
 const category=guild.channels.cache.get(PARENT_CATEGORY_ID);
 if(!category||category.type!==ChannelType.GuildCategory||category.guildId!==guild.id)
  throw Error("Compound category unavailable. Cannot create Thirty Plus outside the assigned Compound section.");
 let channel=guild.channels.cache.find(c=>(c.name===THIRTY_PLUS_CHANNEL_NAME||c.name===LEGACY_CHANNEL_NAME)&&c.type===ChannelType.GuildText&&c.parentId===category.id);
 if(!channel){
  const self=await guild.members.fetchMe();
  if(!category.permissionsFor(self)?.has(PermissionFlagsBits.ManageChannels))
   throw Error("C0N bot needs Manage Channels in The Compound to create the Thirty Plus channel.");
  channel=await guild.channels.create({
   name:THIRTY_PLUS_CHANNEL_NAME,type:ChannelType.GuildText,parent:category.id,
   topic:TOPIC,reason:"Owner approved 30+ life questions and Charisma participation"
  });
  logger.info("Compound conversation channel created",{channel_id:channel.id});
 }
 if(channel.name===LEGACY_CHANNEL_NAME){
  await channel.setName(THIRTY_PLUS_CHANNEL_NAME,"Rename existing conversation channel without losing messages");
 }
 if(channel.topic!==TOPIC)await channel.setTopic(TOPIC,"Simplify Compound conversation channel description");
 if(!channel.permissionsFor(await guild.members.fetchMe())?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]))
  throw Error("Bot cannot read/post in the Thirty Plus channel");
 const bound=await thirtyPlusDatabaseCall("bind",{guild_id:guild.id,channel_id:channel.id});
 if(bound!==true)throw Error("Compound question channel binding failed");
 // Update the already-posted prompt in place; don't reset its timer or reward history.
 try{
  const active=await thirtyPlusDatabaseCall("active",{guild_id:guild.id});
  if(active?.message_id&&Number.isSafeInteger(Number(active.seq))){
   const existing=await channel.messages.fetch(active.message_id);
   if(existing.author?.id===guild.client.user.id){
    const updated=questionPost({seq:Number(active.seq),index:Number(active.index)});
    if(existing.content!==updated.content)await existing.edit(updated);
   }
  }
 }catch(e){logger.warn("Current conversation message refresh unavailable",{code:e.code||"edit"});}
 return channel;
}
export async function postThirtyPlusQuestion(guild,channel,logger=console){
 const next=await thirtyPlusDatabaseCall("claim",{guild_id:guild.id});
 if(!next)return false;
 if(next.channel_id!==channel.id||!Number.isSafeInteger(Number(next.seq)))
  throw Error("Question rotation channel mismatch");
 const seq=Number(next.seq),post=questionPost({seq,index:Number(next.index)});
 const me=await guild.members.fetchMe();
 if(!channel.permissionsFor(me)?.has(PermissionFlagsBits.MentionEveryone))
  logger.warn("Compound question @here requires Mention Everyone permission on the bot's channel role");
 const marker="truth-rotation:"+seq;
 // A previous send might have succeeded while its acknowledgment timed out.
 const recent=await channel.messages.fetch({limit:50});
 let message=recent.find(m=>m.author?.id===guild.client.user.id&&m.content?.includes(marker));
 if(!message)message=await channel.send(post);
 const done=await thirtyPlusDatabaseCall("ack",{
  guild_id:guild.id,seq,lease_token:next.lease_token,message_id:message.id
 });
 if(done!==true)throw Error("Failed to acknowledge Thirty Plus prompt");
 logger.info("Compound question posted",{question:Number(next.index),sequence:seq,channel_id:channel.id});
 return true;
}
export async function recordThirtyPlusAnswer(message,channelId,logger=console){
 if(!shouldRecordTruthAnswer(message,channelId))return false;
 const result=await thirtyPlusDatabaseCall("answer",{
  guild_id:message.guildId,channel_id:channelId,user_id:message.author.id,
  message_id:message.id,answer:message.content,created_at:message.createdTimestamp
 });
 if(result?.recorded){
  if(result.charisma>0){
   await message.react("✦").catch(()=>{});
   logger.info("Thirty Plus Charisma recorded",{question:result.question,user_id:message.author.id});
  }
  return true;
 }
 return false;
}
