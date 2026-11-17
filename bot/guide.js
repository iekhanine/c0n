import {EmbedBuilder} from "discord.js";

export const GUIDE_URL="https://thecompound.cultofnixon.com/guide";
const BOT_LOGO="https://cultofnixon.com/con-logo.png";

export function isGuideMention(content,botId){
 if(!/^\d{17,20}$/.test(String(botId)))return false;
 return new RegExp("^\\s*<@!?"+botId+">\\s+guide\\s*[.!?]?\\s*$","i").test(String(content||""));
}

export function newcomerGuideCard(){
 const embed=new EmbedBuilder()
  .setColor(0x8db67b)
  .setAuthor({name:"CULT OF NIX0N  /  THE COMPOUND",iconURL:BOT_LOGO})
  .setTitle("📖 NEW RESIDENT FIELD GUIDE")
  .setURL(GUIDE_URL)
  .setDescription("Welcome to the Compound. Here's how to get started in the Workshop.")
  .addFields(
   {name:"01  FIND AN OPEN WORK ORDER",value:"Choose a Workshop channel and read the pinned daily objective, requirements, and pay."},
   {name:"02  CLAIM THE JOB",value:"Type **accept** by itself in that channel. Jobs are first come, first served; one unfinished job per resident."},
   {name:"03  COMPLETE YOUR ASSIGNMENT",value:"Follow the Overseer's briefing. The assignment has a timer; check your progress with **/profile**."},
   {name:"04  CONFIRM AND COLLECT",value:"When the Overseer checks in after your shift, confirm completion to receive your **$ pay and XP**. Reusable tools go back to the stockroom."},
   {name:"05  CHECK YOUR FUNDS",value:"Use **/wallet** for personal Workshop earnings or mention me with **wallet** to see the shared treasury."}
  )
  .addFields({name:"COMPLETE FIELD MANUAL",value:"[Read the full eight-step guide]("+GUIDE_URL+")"})
  .setFooter({text:"Read pinned instructions before accepting any Workshop objective."});
 return {embeds:[embed],allowedMentions:{parse:[],repliedUser:false}};
}
