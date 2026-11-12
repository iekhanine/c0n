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
  2n,                // Kick Members
  4n,                // Ban Members
  8n,                // Administrator
  16n,               // Manage Channels
  32n,               // Manage Server
  8192n,             // Manage Messages
  268435456n,        // Manage Roles
  536870912n,        // Manage Webhooks
  134217728n,        // Manage Nicknames
  1073741824n,       // Manage Expressions
  8589934592n,       // Manage Events
  17179869184n,      // Manage Threads
  1099511627776n,    // Moderate Members
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
  const has = role => Boolean(role && member.roles.cache.has(role.id));
  // Recognize an already-earned Instigator even when it is not manageable.
  // Never attempt to downgrade an existing VIP.
  const existingVip = [...guild.roles.cache.values()].find(role =>
    canonicalRoleName(role.name) === canonicalRoleName("Instigator") && has(role));
  if (existingVip) return;

  if (!progress.participated) return;
  if (!observer) {
    console.warn("C0N onboarding cannot assign Observer", {
      matchingRoles: [...guild.roles.cache.values()]
        .filter(role => canonicalRoleName(role.name) === canonicalRoleName("Observer"))
        .map(role => ({
          managed: role.managed, safe: safeParticipationRole(role),
          belowBot: Boolean(guild.members.me &&
            guild.members.me.roles.highest.comparePositionTo(role) > 0),
        })),
    });
    return;
  }
  if (progress.eligible_instigator && instigator) {
    await member.roles.add(instigator, "C0N activity milestone: 14 days, 30 messages, 5 active days");
    if (has(observer)) await member.roles.remove(observer, "C0N promoted to Instigator");
    if (has(unspoken)) await member.roles.remove(unspoken, "C0N promoted to Instigator");
    return;
  }
  if (progress.eligible_instigator && !instigator)
    console.warn("C0N Instigator promotion unavailable; preserving Observer", {
      matchingRoles: [...guild.roles.cache.values()]
        .filter(role => canonicalRoleName(role.name) === canonicalRoleName("Instigator"))
        .map(role => ({
          managed: role.managed, safe: safeParticipationRole(role),
          belowBot: Boolean(guild.members.me &&
            guild.members.me.roles.highest.comparePositionTo(role) > 0),
        })),
    });
  if (!has(observer)) await member.roles.add(observer, "C0N first participation");
  if (has(unspoken)) await member.roles.remove(unspoken, "C0N first participation");
}
export function participationEvent(type, messageId, channelId, userId, timestamp = Date.now(), emoji) {
  const eventId = type === "reaction" ? `${messageId}:${emoji}` : messageId;
  return {
    type, event_id: eventId, channel_id: channelId, user_id: userId,
    at: new Date(timestamp).toISOString(),
  };
}
