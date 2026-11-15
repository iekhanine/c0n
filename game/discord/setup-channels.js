// One-time, idempotent Discord channel provisioning for C0N.
// DRY RUN by default: APPLY=1 node game/discord/setup-channels.js
import { Client, GatewayIntentBits, ChannelType, PermissionsBitField } from "discord.js";
const token=process.env.DISCORD_BOT_TOKEN, guildId=process.env.CON_GUILD_ID;
if(!token||!guildId)throw Error("DISCORD_BOT_TOKEN and CON_GUILD_ID are required");
const apply=process.env.APPLY==="1";
const categories=[
 {name:"[ THE WORKFORCE ]",channels:[
 ["job-board","text","Available job postings and work orders"],
 ["carpentry","text","Carpentry work orders and skill challenges"],
 ["metalworking","text","Metalworking work orders and skill challenges"],
 ["medical","text","Medical roleplaying, jobs and training"],
 ["agriculture","text","Agriculture and food supply"],
 ["engineering","text","Engineering and infrastructure"],
 ["scavenging","text","Scavenging and exploration"],
 ["payroll","text","Payroll policy and notices. Never post private pay records here"]
 ]},
 {name:"[ THE EXPEDITIONS ]",channels:[
 ["campaign-board","text","Dungeon Master campaigns and invitations"],
 ["dice-rolls","text","Server-authoritative tabletop dice rolls"],
 ["campaign-journal","text","Session journals and discovered lore"],
 ["expedition-voice","voice","Voice roleplay and campaign sessions"]
 ]},
 {name:"[ PROJECT RECLAMATION ]",channels:[
 ["bunker-discovery","text","World narrative and bunker discoveries"],
 ["reclamation-projects","text","Shared construction milestones and resource requirements"],
 ["resource-warehouse","text","Shared inventory and material requests"],
 ["world-events","text","World changes, infrastructure status and emergencies"]
 ]}
];
const normalize=s=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
const client=new Client({intents:[GatewayIntentBits.Guilds]});
try{
 await client.login(token);
 const guild=await client.guilds.fetch(guildId);
 const me=await guild.members.fetchMe();
 if(!me.permissions.has(PermissionsBitField.Flags.ManageChannels))throw Error("Bot needs Manage Channels");
 await guild.channels.fetch();
 let created=0,found=0;
 for(const spec of categories){
  let cat=guild.channels.cache.find(x=>x.type===ChannelType.GuildCategory&&normalize(x.name)===normalize(spec.name));
  if(!cat){
   if(apply){cat=await guild.channels.create({name:spec.name,type:ChannelType.GuildCategory,reason:"C0N Project Reclamation channels"});created++;}
   else console.log("PLAN CATEGORY",spec.name);
  }else found++;
  for(const [name,kind,topic] of spec.channels){
   const type=kind==="voice"?ChannelType.GuildVoice:ChannelType.GuildText;
   const existing=guild.channels.cache.find(x=>x.type===type&&normalize(x.name)===normalize(name)&&(cat?x.parentId===cat.id:true));
   if(existing){found++;continue}
   if(apply){
    if(!cat)throw Error("Category must exist");
    await guild.channels.create({name,type,parent:cat.id,...(kind==="text"?{topic}:{}),reason:"C0N Project Reclamation channels"});
    created++;
   }else console.log("PLAN CHANNEL",spec.name,"/",name);
  }
 }
 console.log(JSON.stringify({dryRun:!apply,created,alreadyPresent:found},null,2));
}finally{client.destroy()}
