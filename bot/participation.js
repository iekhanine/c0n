// Participation roles never inherit staff authority; this module only handles
// the three dedicated membership-status roles.
export const PARTICIPATION = Object.freeze({
  minimumDays: 14,
  minimumMessages: 30,
  minimumActiveDays: 5,
});
// Discord role labels may use Unicode small caps. Normalize both plain-text
// and styled names to the same canonical ASCII key without changing role IDs.
const plain = "abcdefghijklmnopqrstuvwxyz";
const small = [..."ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ"];
const smallToPlain = new Map(small.map((character, index) => [character, plain[index]]));
export function canonicalRoleName(name) {
  return [...String(name).toLowerCase()]
    .map(character => smallToPlain.get(character) || character)
    .join("")
    .replace(/[^a-z0-9]/g, "");
}
// Ordinary chat and visibility permissions are safe for a participation role.
// Never auto-manage roles with moderation, server management, or elevated powers.
const unsafeBits = [
  0x8n,             // Administrator
  0x2n, 0x4n,       // Kick, Ban
  0x10n, 0x20n,     // Manage Channels, Manage Guild
  0x10000000n,      // Manage Roles
  0x2000000n,       // Manage Webhooks
  0x1000n,          // Manage Messages
  0x2000n,          // Manage Threads
  0x4000000n,       // Manage Events
  0x40000000n,      // Manage Emojis and Stickers
  0x8000000n,       // Manage Nicknames
  0x10000000000n,   // Moderate Members
  0x1000000n,       // Manage Expressions (alternative)
  0x1000000000n,    // Manage Threads (alternative)
].reduce((all, bit) => all | bit, 0n);
export function safeParticipationRole(role) {
  return Boolean(role && !role.managed && role.id !== role.guild.id &&
    (BigInt(role.permissions.bitfield) & unsafeBits) === 0n);
}
export function statusRole(guild, name) {
  const target = canonicalRoleName(name);
  const found = [...guild.roles.cache.values()].filter(r =>
    canonicalRoleName(r.name) === target);
  if (found.length !== 1) return null;
  const role = found[0];
  const me = guild.members.me;
  return safeParticipationRole(role) &&
    !!me && me.roles.highest.comparePositionTo(role) > 0 ? role : null;
}
export async function assignNewMemberStatus(member) {
  if (member.user.bot) return;
  const initiated = statusRole(member.guild, "Initiated");
  const unspoken = statusRole(member.guild, "The Unspoken");
  if (!initiated || !unspoken) return;
  // Do not relabel a returning member already holding Observer or Instigator.
  if (["Observer", "Instigator"].some(name => {
    const role = statusRole(member.guild, name);
    return role && member.roles.cache.has(role.id);
  })) return;
  await member.roles.add([initiated, unspoken], "C0N new member onboarding");
}
export async function applyParticipationProgress(guild, progress) {
  const member = await guild.members.fetch(progress.user_id).catch(e => {
    if (e.code === 10007) return null;
    throw e;
  });
  if (!member || member.user.bot) return;
  const unspoken = statusRole(guild, "The Unspoken");
  const observer = statusRole(guild, "Observer");
  const instigator = statusRole(guild, "Instigator");
  if (!unspoken || !observer || !instigator) return;
  const has = role => member.roles.cache.has(role.id);
  // Never demote an Instigator or remove it because of inactivity.
  if (has(instigator)) return;
  if (progress.eligible_instigator) {
    // A promotion is additive first; only then clear obsolete status roles.
    await member.roles.add(instigator, "C0N activity milestone: 14 days, 30 messages, 5 active days");
    if (has(observer)) await member.roles.remove(observer, "C0N promoted to Instigator");
    if (has(unspoken)) await member.roles.remove(unspoken, "C0N promoted to Instigator");
  } else if (progress.participated) {
    if (!has(observer)) await member.roles.add(observer, "C0N first participation");
    if (has(unspoken)) await member.roles.remove(unspoken, "C0N first participation");
  }
}
export function participationEvent(type, messageId, channelId, userId, timestamp = Date.now(), emoji) {
  const eventId = type === "reaction" ? `${messageId}:${emoji}` : messageId;
  return {
    type, event_id: eventId, channel_id: channelId, user_id: userId,
    at: new Date(timestamp).toISOString(),
  };
}
