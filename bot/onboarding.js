import { canonicalRoleName, statusRole } from "./participation.js";

export const FIRST_CONTACT_NAME = "firstcontact";
export const FIRST_CONTACT_MARKER = "[  ꜰɪʀꜱᴛ ᴄᴏɴᴛᴀᴄᴛ  ]";
export const FIRST_CONTACT_TEXT = `**${FIRST_CONTACT_MARKER}**

You've made it into the Compound. Mostly.

Before we let you wander around, we'd like to know you're actually here.

**You don't need to introduce yourself.** No names, no personal details, no life stories required.

Say hello, tell us what brought you here, or share something completely random.

If you're not feeling social, simply react with 👋 to this message.

That's it. Your first interaction here changes **The Unspoken** to **Observer** and lets you choose the rest of the server through #roles.

Welcome aboard. Try not to break anything immediately.`;

export function isFirstContactChannel(channel) {
  return Boolean(channel && canonicalRoleName(channel.name) === FIRST_CONTACT_NAME);
}
export function firstContactChannel(guild) {
  const channels = [...guild.channels.cache.values()].filter(c =>
    isFirstContactChannel(c) && [0, 5].includes(c.type));
  return channels.length === 1 ? channels[0] : null;
}
export async function ensureWelcomePost(guild, botId) {
  const channel = firstContactChannel(guild);
  if (!channel?.messages || !channel.permissionsFor(guild.members.me)?.has(
    ["ViewChannel", "ReadMessageHistory", "SendMessages", "AddReactions"]
  )) return { channelId: channel?.id || null, messageId: null };
  // Locate the existing bot-authored post to avoid duplicates on reconnects.
  const recent = await channel.messages.fetch({ limit: 100 });
  let message = recent.find(m => m.author.id === botId &&
    m.content?.startsWith(`**${FIRST_CONTACT_MARKER}**`));
  if (!message) message = await channel.send({ content: FIRST_CONTACT_TEXT, allowedMentions: { parse: [] } });
  if (!message.reactions.cache.has("👋")) await message.react("👋");
  return { channelId: channel.id, messageId: message.id };
}
export function onboardingEligible(event, welcome) {
  if (!welcome?.channelId || event.channel_id !== welcome.channelId) return false;
  if (event.type === "message") return true;
  return event.type === "reaction" && Boolean(welcome.messageId) &&
    event.event_id === `${welcome.messageId}:1f44b`;
}
export function memberCanSelectRoles(member) {
  const observer = statusRole(member.guild, "Observer");
  const instigator = statusRole(member.guild, "Instigator");
  return Boolean(
    (observer && member.roles.cache.has(observer.id)) ||
    (instigator && member.roles.cache.has(instigator.id))
  );
}
