import { ChannelType, EmbedBuilder, PermissionFlagsBits as P } from "discord.js";
import { canonicalRoleName } from "./participation.js";

const NAME = "ꜱᴇʀᴠᴇʀ-ꜱᴛᴀᴛꜱ";
const TOPIC = "Live C0N community statistics. Automatically refreshed by the bot.";
const MARKER = "C0N / SERVER PULSE";
const fmt = value => Number(value || 0).toLocaleString("en-US");
const request = async url => {
  const response = await fetch(url, {
    headers: { "Cache-Control": "no-cache" },
    redirect: "error",
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw Error("Stats endpoint unavailable.");
  return response.json();
};
export function statsEmbed(data, site, now = Date.now()) {
  const weekly = Array.isArray(data.channels)
    ? data.channels.reduce((sum, c) => sum + Number(c.messages || 0), 0) : null;
  const active = Array.isArray(data.channels)
    ? data.channels.filter(c => Number(c.messages) > 0).length : null;
  const fields = [
    { name: "👥 Members", value: fmt(data.memberCount), inline: true },
    { name: "💬 Messages · 7 days", value: weekly === null ? "Unavailable" : fmt(weekly), inline: true },
    { name: "📡 Active channels · 7 days", value: active === null ? "Unavailable" : fmt(active), inline: true },
  ];
  if (data.projectCount !== null && data.projectCount !== undefined)
    fields.push({ name: "🛠️ Published creations", value: fmt(data.projectCount) + (data.projectCapped ? "+" : ""), inline: true });
  return new EmbedBuilder()
    .setTitle(MARKER)
    .setDescription("The Compound, by the numbers. Updates automatically without new messages.")
    .addFields(fields)
    .setColor(0x96b56b)
    .setFooter({ text: "Channel activity counts include only selected channels · Past 7 days" })
    .setTimestamp(new Date(now))
    .setURL(site);
}
export async function ensureStatsChannel(guild, botId) {
  await guild.channels.fetch();
  let channel = [...guild.channels.cache.values()].find(c =>
    c.type === ChannelType.GuildText && canonicalRoleName(c.name) === "serverstats");
  if (channel) return channel;
  const me = await guild.members.fetchMe();
  if (!me.permissions.has(P.ManageChannels)) {
    console.warn("C0N stats channel not created: bot lacks Manage Channels.");
    return null;
  }
  // Keep the statistics in the community's existing category and preserve its visibility.
  const parent = [...guild.channels.cache.values()].find(c =>
    c.type === ChannelType.GuildCategory && canonicalRoleName(c.name) === "thecompound");
  if (!parent) {
    console.warn("C0N stats channel not created: The Compound category was not found.");
    return null;
  }
  const overwrites = [...parent.permissionOverwrites.cache.values()].map(o => ({
    id: o.id, type: o.type,
    allow: o.allow.bitfield & ~P.SendMessages & ~P.SendMessagesInThreads,
    deny: o.deny.bitfield | P.SendMessages | P.SendMessagesInThreads,
  }));
  // An explicit member overwrite allows the bot to edit its dashboard while
  // members cannot send messages. This doesn't modify roles or the category.
  overwrites.push({ id: botId, allow: P.ViewChannel | P.SendMessages | P.ReadMessageHistory | P.EmbedLinks, deny: 0n });
  channel = await guild.channels.create({
    name: NAME, type: ChannelType.GuildText, parent: parent.id, topic: TOPIC,
    permissionOverwrites: overwrites,
    reason: "C0N read-only, automatically refreshed community statistics",
  });
  return channel;
}
export async function updateStatsMessage(guild, botId, site) {
  const channel = await ensureStatsChannel(guild, botId);
  if (!channel?.messages) return false;
  const me = await guild.members.fetchMe();
  if (!channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory]))
    throw Error("C0N bot lacks permission to publish server statistics.");
  const [publicData, projects] = await Promise.all([
    request(site + "/api/discord-bot?action=public").catch(() => null),
    request(site + "/api/projects").catch(() => null),
  ]);
  // No fabricated counts: if the API is down, say unavailable.
  const embed = statsEmbed({
    memberCount: guild.memberCount,
    channels: publicData?.connected ? publicData.channels : null,
    projectCount: Array.isArray(projects?.projects) ? projects.projects.length : null,
    projectCapped: Array.isArray(projects?.projects) && projects.projects.length >= 200,
  }, site);
  // Reuse the existing bot-authored dashboard after reconnects; no message spam.
  const messages = await channel.messages.fetch({ limit: 50 });
  const existing = messages.find(m => m.author.id === botId &&
    m.embeds.some(e => e.title === MARKER));
  const payload = { embeds: [embed], allowedMentions: { parse: [] } };
  if (existing) await existing.edit(payload);
  else await channel.send(payload);
  return true;
}
