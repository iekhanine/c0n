export function publicChannels(guild) {
  return [...guild.channels.cache.values()]
    .filter(
      (c) =>
        [0, 5].includes(c.type) &&
        c.viewable &&
        c.permissionsFor(guild.roles.everyone)?.has("ViewChannel"),
    )
    .map((c) => ({ id: c.id, name: c.name }));
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
    message.author.bot ||
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
