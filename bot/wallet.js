import {EmbedBuilder} from "discord.js";

const GREEN=0x8db67b;
const LOGO="https://cultofnixon.com/con-logo.png";

function credits(value){
  const text=String(value??"0");
  if(!/^-?\d+$/.test(text))throw Error("Invalid credit balance");
  return BigInt(text).toLocaleString("en-US");
}
export function isTreasuryMention(content,botId){
  if(!/^\d{17,20}$/.test(String(botId)))return false;
  return new RegExp("^\\s*<@!?"+botId+">\\s+wallet\\s*[.!?]?\\s*$","i").test(String(content||""));
}
export function personalWalletCard(wallet){
  if(!wallet)throw Error("Wallet record missing");
  const embed=new EmbedBuilder()
   .setColor(GREEN)
   .setAuthor({name:"CULT OF NIX0N  /  THE COMPOUND",iconURL:LOGO})
   .setTitle("💳  RESIDENT WALLET")
   .setDescription("Your personal account in the Compound.")
   .addFields(
    {name:"AVAILABLE BALANCE",value:"**"+credits(wallet.balance)+" Credits**",inline:false},
    {name:"LIFETIME WORKSHOP EARNINGS",value:credits(wallet.earned)+" Credits",inline:false}
   )
   .setFooter({text:"Earn credits by completing assigned Workshop objectives."});
  return {embeds:[embed],allowedMentions:{parse:[]}};
}
export function compoundTreasuryCard(treasury){
  if(!treasury)throw Error("Treasury record missing");
  const embed=new EmbedBuilder()
   .setColor(GREEN)
   .setAuthor({name:"CULT OF NIX0N  /  THE COMPOUND",iconURL:LOGO})
   .setTitle("🏦  THE COMPOUND TREASURY")
   .setDescription("Current funds held in the communal bank.")
   .addFields({name:"AVAILABLE TREASURY FUNDS",value:"**"+credits(treasury.balance)+" Credits**",inline:false})
   .setFooter({text:"Shared Compound funds  •  Separate from resident wallets"});
  return {embeds:[embed],allowedMentions:{parse:[]}};
}
