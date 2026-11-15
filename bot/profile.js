import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const BASE = "https://thecompound.cultofnixon.com/u/";
const LOGO = "https://cultofnixon.com/con-logo.png";
const DEFAULT_COLOR = 0x8db67b;

function clean(value, max=100) {
  return String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);
}
function val(value) {
  const n=Number(value);
  return Number.isFinite(n) ? Math.max(0,Math.round(n)) : 0;
}
function point(value) { return val(value).toLocaleString("en-US"); }
function stat(name,value,icon) {
  return { name:icon+"  "+name, value:"**"+point(value)+" / 100**",inline:true };
}
function safeUrl(discordId) {
  if(!/^\d{17,20}$/.test(String(discordId)))throw Error("Invalid Discord user.");
  return BASE+discordId;
}
/**
 * Build an unambiguous, readable profile out of the *server's* public payload.
 * This formatter neither manufactures membership status nor invents a character.
 */
export function buildProfileCard(payload) {
  if(!payload?.member||!payload?.stats)throw Error("Profile data is missing.");
  const {member:m,stats:p}=payload;
  const href=safeUrl(m.id);
  const title=clean(m.membership?.codename||m.display_name,90)||"Compound Resident";
  const verified=m.membership?.verified===true;
  const home=clean(m.apartment||"The Unhoused",40);
  const xp=val(p.xp),level=val(p.level);
  const milestone=250;
  const toward=xp%milestone;
  const memberText=verified?
    "✦ VERIFIED MEMBER  •  #"+clean(m.membership.member_no,16):
    "COMPOUND RESIDENT  •  UNVERIFIED";
  const embed=new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setAuthor({name:"CULT OF NIX0N  /  THE COMPOUND",iconURL:LOGO})
    .setTitle("✦  "+title)
    .setDescription(memberText+"\n  **"+home+"**")
    .addFields(
      {name:"⬡  LEVEL "+point(level),value:"**"+point(xp)+" XP**  ·  **"+point(toward)+" / 250** toward next level",inline:false},
      stat("HEALTH",p.health,"♥"),
      stat("STAMINA",p.stamina,"⚡"),
      stat("SKILL",p.skill,"⚔"),
      stat("CHARISMA",p.charisma,"✦"),
      stat("INTELLECT",p.intellect,"◈"),
      stat("LUCK",p.luck,"✧"),
    )
    .setFooter({text:"THE COMPOUND  •  CHARACTER RECORD",iconURL:LOGO});
  // A member may have an animated or static avatar. Only use the
  // official Discord CDN, not a user-supplied URL.
  if(/^(a_)?[0-9a-f]{32}$/.test(m.avatar||"")) {
    embed.setThumbnail("https://cdn.discordapp.com/avatars/"+m.id+"/"+m.avatar+".png?size=128");
  } else {
    embed.setThumbnail(LOGO);
  }
  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open Full Profile").setEmoji("🔗").setURL(href)
  );
  return {embeds:[embed],components:[row],allowedMentions:{parse:[]}};
}


/**
 * A visually faithful card when the website's signed profile lookup endpoint
 * has not yet been deployed. Never show invented XP, apartment, or membership.
 */
export function buildPreviewCard(user) {
 const id=String(user?.id||"");
 const url=safeUrl(id);
 const title=clean(user?.displayName||user?.globalName||user?.username||"Discord Resident",90)||"Discord Resident";
 const icon=typeof user?.avatarURL==="string"&&/^https:\/\/cdn\.discordapp\.com\/avatars\/\d{17,20}\/(?:a_)?[0-9a-f]{32}\.(?:png|gif|webp)(?:\?size=\d+)?$/.test(user.avatarURL)?user.avatarURL:LOGO;
 const embed=new EmbedBuilder()
  .setColor(DEFAULT_COLOR)
  .setAuthor({name:"CULT OF NIX0N  /  THE COMPOUND",iconURL:LOGO})
  .setTitle("✦  "+title)
  .setThumbnail(icon)
  .setDescription("  **Apartment:** Pending database connection\nMembership: Pending database connection")
  .addFields(
   {name:"⬡  LEVEL",value:"**XP: Not available**",inline:false},
   ...["♥  HEALTH","⚡  STAMINA","⚔  SKILL","✦  CHARISMA","◈  INTELLECT","✧  LUCK"].map(name=>({name,value:"**Not available**",inline:true}))
  )
  .setFooter({text:"THE COMPOUND  •  CHARACTER RECORD",iconURL:LOGO});
 const components=[new ActionRowBuilder().addComponents(
  new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Full Profile (pending release)").setEmoji("🔗").setURL(url)
 )];
 return {embeds:[embed],components,allowedMentions:{parse:[]}};
}
