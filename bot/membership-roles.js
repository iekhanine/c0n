import { canonicalRoleName, safeParticipationRole } from "./participation.js";

// Sync only a dedicated unprivileged membership-status role.
// Website membership is authoritative; Discord membership alone never grants website access.
export async function reconcileVerifiedMembers(guild, activeUserIds) {
  if (!Array.isArray(activeUserIds) || activeUserIds.length > 5000 ||
      activeUserIds.some(id => typeof id !== "string" || !/^\d{17,20}$/.test(id)))
    throw Error("Invalid membership synchronization batch.");
  const me = await guild.members.fetchMe();
  if (!me.permissions.has("ManageRoles")) {
    console.warn("C0N member role sync: bot lacks Manage Roles.");
    return { assigned: 0, removed: 0, skipped: true };
  }
  await guild.roles.fetch();
  const matches = guild.roles.cache.filter(role =>
    canonicalRoleName(role.name) === "verifiedmember");
  if (matches.size > 1) {
    console.warn("C0N member role sync: duplicate Verified Member roles; resolve manually.");
    return { assigned: 0, removed: 0, skipped: true };
  }
  let role = matches.first();
  if (!role && activeUserIds.length) {
    role = await guild.roles.create({
      name: "Verified Member",
      permissions: [],
      mentionable: false,
      hoist: false,
      reason: "C0N invite-only verified membership",
    });
  }
  if (!role) return { assigned: 0, removed: 0 };
  if (!safeParticipationRole(role) || me.roles.highest.comparePositionTo(role) <= 0) {
    console.warn("C0N member role sync: membership role must have no elevated permissions and sit below the bot.");
    return { assigned: 0, removed: 0, skipped: true };
  }
  const active = new Set(activeUserIds);
  const members = await guild.members.fetch();
  let assigned=0, removed=0;
  for (const member of members.values()) {
    if (member.user.bot) continue;
    if (active.has(member.id) && !member.roles.cache.has(role.id)) {
      await member.roles.add(role, "C0N digital invitation membership verified");
      assigned++;
    } else if (!active.has(member.id) && member.roles.cache.has(role.id)) {
      await member.roles.remove(role, "C0N digital membership not active");
      removed++;
    }
  }
  return {assigned,removed};
}
