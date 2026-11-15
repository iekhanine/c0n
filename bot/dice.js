// Tabletop dice for voice-session text chat. No XP or credits issued by /roll.
import { randomInt } from "node:crypto";
import { MessageFlags } from "discord.js";
export const SIDES=[4,6,8,10,12,20,100];
export function rollTabletop({sides=20,count=1,modifier=0}={}){
 if(!SIDES.includes(sides))throw Error("Unsupported die");
 if(!Number.isInteger(count)||count<1||count>10)throw Error("Roll 1 to 10 dice");
 if(!Number.isInteger(modifier)||modifier< -100||modifier>100)throw Error("Modifier must be -100 to 100");
 const faces=Array.from({length:count},()=>randomInt(1,sides+1));
 return {sides,count,faces,modifier,total:faces.reduce((sum,n)=>sum+n,modifier)};
}
export async function registerDice(guild){
 await guild.commands.create({
  name:"roll",
  description:"Roll tabletop dice in your current Discord channel",
  options:[
   {name:"sides",description:"Die size",type:4,required:true,choices:SIDES.map(n=>({name:"d"+n,value:n}))},
   {name:"count",description:"Number of dice (1 to 10)",type:4,required:false,min_value:1,max_value:10},
   {name:"modifier",description:"Modifier between -100 and 100",type:4,required:false,min_value:-100,max_value:100},
   {name:"reason",description:"Your roll, e.g. Perception check",type:3,required:false,max_length:140}
  ]
 });
}
export async function handleDice(interaction){
 if(!interaction.isChatInputCommand()||interaction.commandName!=="roll")return false;
 try{
  const sides=interaction.options.getInteger("sides",true);
  const count=interaction.options.getInteger("count")??1;
  const modifier=interaction.options.getInteger("modifier")??0;
  const reason=(interaction.options.getString("reason")||"Ability check").replace(/[@*_~`<>|]/g,"").slice(0,140);
  const roll=rollTabletop({sides,count,modifier});
  const formula=roll.count+"d"+roll.sides+(modifier<0?String(modifier):modifier>0?"+"+modifier:"");
  const output=[
    "🎲 **THE COMPOUND / TABLETOP**",
    "**"+interaction.user.username.replace(/[\r\n]/g,"").slice(0,50)+"** · "+reason,
    "`"+formula+"` → ["+roll.faces.join(", ")+"] "+(modifier?" "+(modifier>0?"+":"")+modifier:"")+" = **"+roll.total+"**",
    "_Discord roll only. Campaign rewards require DM and Overseer approval._"
  ].join("\n");
  await interaction.reply({content:output,allowedMentions:{parse:[]}});
 }catch(e){
  await interaction.reply({content:e.message||"Dice roll unavailable",flags:MessageFlags.Ephemeral});
 }
 return true;
}
