import { memberCanSelectRoles } from "./onboarding.js";
import { canonicalRoleName } from "./participation.js";

// Roles selected by members must be dedicated access roles, not staff privileges.
const dedicatedNames = new Set(["compoundaccess","workshopaccess","galleryaccess","arcadeaccess","gamesaccess","voiceaccess"]);
export function safeAccessRole(role) {
  return Boolean(role && !role.managed && role.editable &&
    role.permissions.bitfield === 0n && role.id !== role.guild.id &&
    dedicatedNames.has(canonicalRoleName(role.name)));
}
export function emojiKey(value) {
  return String(value || "").replace(/\uFE0F/g, "");
}
export function reactionKey(reaction) {
  return emojiKey(reaction.emoji.id || reaction.emoji.name);
}
export function matchingRole(config, reaction) {
  if (!config || reaction.message.id !== config.message_id ||
      reaction.message.channelId !== config.channel_id ||
      reaction.message.guildId !== config.guild_id) return null;
  return config.mappings.find(m => emojiKey(m.emoji) === reactionKey(reaction))?.role_id || null;
}
export async function handleRoleReaction(guild, config, incoming, user, remove = false) {
  if (!guild || !user || user.bot || !config || incoming.message.guildId !== guild.id) return false;
  const reaction = incoming.partial ? await incoming.fetch() : incoming;
  const roleId = matchingRole(config, reaction);
  if (!roleId) return false;
  const role = await guild.roles.fetch(roleId);
  if (!safeAccessRole(role)) return false;
  const member = await guild.members.fetch(user.id).catch(e => {
    if (e.code === 10007) return null;
    throw e;
  });
  if (!member || !memberCanSelectRoles(member)) return false;
  if (remove) {
    if (member.roles.cache.has(roleId))
      await member.roles.remove(roleId, "C0N reaction-role selection removed");
  } else if (!member.roles.cache.has(roleId)) {
    await member.roles.add(roleId, "C0N reaction-role selection");
  }
  return true;
}
// On startup or mapping changes, incorporate reactions already placed on the post.
// Reconciliation only adds roles; it does not remove unrelated/manual assignments.
export async function reconcileRoleReactions(guild, config, onExistingReaction = null) {
  if (!guild || !config || !config.mappings?.length) return;
  const channel = await guild.channels.fetch(config.channel_id);
  if (!channel?.isTextBased() || !channel.messages) return;
  const message = await channel.messages.fetch(config.message_id);
  for (const mapping of config.mappings) {
    const reaction = message.reactions.cache.find(r => reactionKey(r) === emojiKey(mapping.emoji));
    if (!reaction) continue;
    let after;
    for (let page = 0; page < 100; page++) {
      const users = await reaction.users.fetch({ limit: 100, ...(after ? { after } : {}) });
      for (const user of users.values()) {
        if (user.bot) continue;
        if (onExistingReaction) onExistingReaction(reaction, user);
        await handleRoleReaction(guild, config, reaction, user).catch(e =>
          console.error("Reaction role reconciliation failed", { code: e.code || e.status || "role" }));
      }
      if (users.size < 100) break;
      after = users.last()?.id;
      if (!after) break;
    }
  }
}
