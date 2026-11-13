import { canonicalRoleName } from "./participation.js";
const blockedCategories = new Set(["administration","theunspoken","starthere","live"]);
const blockedChannels = new Set(["roles","rulesofengagement","firstcontact","staff","modlogs","systemstatus","botspam"]);
export function publicChannels(guild) {
  return [...guild.channels.cache.values()]
    .filter(c => {
      if (![0, 5].includes(c.type) || !c.viewable) return false;
      const parent = c.parentId ? guild.channels.cache.get(c.parentId) : null;
      if (parent && blockedCategories.has(canonicalRoleName(parent.name))) return false;
      if (blockedChannels.has(canonicalRoleName(c.name))) return false;
      return true;
    })
    .map(c => ({ id: c.id, name: c.name, category: c.parent?.name || "" }));
}
export function memberRecord(member) {
  return {
    id: member.id,
    name: member.displayName || member.user.globalName || member.user.username,
    avatar: member.user.avatar || null,
    joined_at: member.joinedTimestamp
      ? new Date(member.joinedTimestamp).toISOString()
      : null,
    bot: Boolean(member.user.bot),
  };
}
export function activityRecord(message, allowedIds, publicIds, guildId) {
  const channelId = message.channel.isThread?.()
    ? message.channel.parentId
    : message.channelId;
  if (
    message.guildId !== guildId ||
    (message.author.bot && (
      message.author.id === message.client?.user?.id ||
      !["thegames", "thearcade"].includes(canonicalRoleName(message.channel.parent?.name))
    )) ||
    message.webhookId ||
    !allowedIds.includes(channelId) ||
    !publicIds.includes(channelId)
  )
    return null;
  return {
    id: message.id,
    channel_id: channelId,
    user_id: message.author.id,
    at: new Date(message.createdTimestamp).toISOString(),
  };
}
