// Participation roles never inherit staff authority; this module only handles
// the three dedicated membership-status roles.
export const PARTICIPATION = Object.freeze({
  minimumDays: 14,
  minimumMessages: 30,
  minimumActiveDays: 5,
});
export function statusRole(guild, name) {
  const found = [...guild.roles.cache.values()].filter(r =>
    r.name.toLowerCase().replace(/[^a-z]/g, "") === name.toLowerCase().replace(/[^a-z]/g, ""));
  if (found.length !== 1) return null;
  const role = found[0];
  const me = guild.members.me;
  return role.id !== guild.id && !role.managed && role.permissions.bitfield === 0n &&
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
