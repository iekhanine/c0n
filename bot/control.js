import { PermissionFlagsBits as P } from "discord.js";
import { controlInput, readOperation } from "../shared/discord-control.js";
const fail = (message) => {
  throw Object.assign(Error(message), { safe: true });
};
const memberView = (m) => ({
  id: m.id,
  name: m.displayName,
  username: m.user.username,
  bot: m.user.bot,
  nickname: m.nickname,
  roles: [...m.roles.cache.keys()],
  joined_at: m.joinedAt?.toISOString(),
  timeout_until: m.communicationDisabledUntil?.toISOString(),
});
const roleView = (r) => ({
  id: r.id,
  name: r.name,
  color: r.hexColor,
  position: r.position,
  permissions: r.permissions.bitfield.toString(),
  hoist: r.hoist,
  mentionable: r.mentionable,
  managed: r.managed,
});
const channelView = (c) => ({
  id: c.id,
  name: c.name,
  type: c.type,
  parent: c.parentId,
  position: c.rawPosition,
  topic: c.topic || "",
  nsfw: !!c.nsfw,
  rateLimitPerUser: c.rateLimitPerUser || 0,
  userLimit: c.userLimit || 0,
  overwrites: c.permissionOverwrites
    ? [...c.permissionOverwrites.cache.values()].map((o) => ({
        id: o.id,
        type: o.type,
        allow: o.allow.bitfield.toString(),
        deny: o.deny.bitfield.toString(),
      }))
    : [],
});
const required = (op) =>
  op === "messages.pin"
    ? (P.PinMessages ?? P.ManageMessages)
    : op === "channels.permissions"
      ? P.ManageRoles
      : op.startsWith("channels.")
        ? op === "channels.list"
          ? P.ManageGuild
          : P.ManageChannels
        : op.startsWith("roles.") || op === "members.role"
          ? op === "roles.list"
            ? P.ManageGuild
            : P.ManageRoles
          : op.startsWith("webhooks.")
            ? P.ManageWebhooks
            : op.startsWith("bans.") || op === "members.ban"
              ? P.BanMembers
              : op === "members.kick"
                ? P.KickMembers
                : op === "members.timeout"
                  ? P.ModerateMembers
                  : op === "members.nickname"
                    ? P.ManageNicknames
                    : P.ManageGuild;
const botRequired = (op) =>
  readOperation(op) && !op.startsWith("bans.") && !op.startsWith("webhooks.")
    ? null
    : required(op);
export const requiredPermissions = [
  "ViewChannel",
  "SendMessages",
  "EmbedLinks",
  "ReadMessageHistory",
  "ManageChannels",
  "ManageGuild",
  "ManageRoles",
  "ManageWebhooks",
  "ManageMessages",
  ...(P.PinMessages ? ["PinMessages"] : []),
  "ManageNicknames",
  "KickMembers",
  "BanMembers",
  "ModerateMembers",
];
export const invitePermissions = requiredPermissions
  .reduce((n, k) => n | P[k], 0n)
  .toString();
export async function executeControl(guild, command) {
  const op = command.operation,
    p = controlInput(op, command.payload);
  const actor = await guild.members.fetch(command.actor_id);
  const me = await guild.members.fetchMe();
  if (!actor.permissions.has(required(op)))
    fail("Your Discord account lacks permission for this action.");
  const needed = botRequired(op);
  if (needed && !me.permissions.has(needed))
    fail(
      "The bot lacks the required Discord permission. Use Permissions & connection to update its access.",
    );
  const reason = `C0N / ${command.actor_id}: ${p.reason || "Read server configuration"}`;
  const grant = (value) => {
    const bits = BigInt(value);
    if ((bits & P.Administrator) !== 0n)
      fail("Administrator cannot be granted from this panel.");
    if (!actor.permissions.has(bits) || !me.permissions.has(bits))
      fail("Permissions cannot exceed the acting account or bot permissions.");
    return bits;
  };
  async function roleTarget(roleId) {
    const r = await guild.roles.fetch(roleId);
    if (!r || r.id === guild.id || r.managed || !r.editable)
      fail("This role is managed, protected, or above the bot.");
    if (
      actor.id !== guild.ownerId &&
      actor.roles.highest.comparePositionTo(r) <= 0
    )
      fail("This role is at or above your highest role.");
    return r;
  }
  async function memberTarget(userId) {
    if ([guild.ownerId, me.id, actor.id].includes(userId))
      fail("The server owner, your own account, and this bot are protected.");
    const target = await guild.members.fetch(userId);
    if (
      actor.id !== guild.ownerId &&
      actor.roles.highest.comparePositionTo(target.roles.highest) <= 0
    )
      fail("This member is at or above your highest role.");
    return target;
  }
  async function channelTarget(channelId) {
    const c = await guild.channels.fetch(channelId);
    if (!c || c.guildId !== guild.id || c.isThread())
      fail("Choose a server channel or category.");
    if (
      c.permissionsFor &&
      !c
        .permissionsFor(actor)
        ?.has(
          op === "channels.permissions"
            ? P.ManageRoles
            : op.startsWith("webhooks.")
              ? P.ManageWebhooks
              : P.ManageChannels,
        )
    )
      fail("Your Discord account cannot manage this channel.");
    return c;
  }
  if (op === "messages.pin") {
    const c = await guild.channels.fetch(p.channel_id);
    if (
      !c ||
      ![0, 5].includes(c.type) ||
      !c.permissionsFor(actor)?.has(P.ViewChannel) ||
      !c.permissionsFor(actor)?.has(required(op)) ||
      !c.permissionsFor(me)?.has(required(op))
    )
      fail("You or the bot cannot pin messages in this channel.");
    const message = await c.messages.fetch(p.message_id);
    if (!message.webhookId)
      fail("Only published webhook messages can be pinned here.");
    if (p.pinned) await message.pin(reason);
    else await message.unpin(reason);
    return { pinned: p.pinned, message_id: message.id };
  }
  if (op === "overview") {
    await guild.fetch();
    return {
      id: guild.id,
      name: guild.name,
      description: guild.description || "",
      owner_id: guild.ownerId,
      member_count: guild.memberCount,
      verificationLevel: guild.verificationLevel,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      explicitContentFilter: guild.explicitContentFilter,
      bot_role: me.roles.highest.name,
      bot_role_id: me.roles.highest.id,
      permissions: requiredPermissions.map((name) => ({
        name,
        bot: me.permissions.has(P[name]),
        actor: actor.permissions.has(P[name]),
      })),
      invite: `https://discord.com/oauth2/authorize?client_id=${me.id}&scope=bot%20applications.commands&permissions=${invitePermissions}&guild_id=${guild.id}&disable_guild_select=true`,
    };
  }
  if (op === "channels.list")
    return {
      items: [...(await guild.channels.fetch()).values()]
        .filter((c) => c && c.permissionsFor(actor)?.has(P.ViewChannel))
        .map(channelView)
        .sort((a, b) => a.position - b.position),
    };
  if (op === "roles.list")
    return {
      items: [...(await guild.roles.fetch()).values()]
        .map(roleView)
        .sort((a, b) => b.position - a.position),
    };
  if (op === "members.list") {
    const items = [
      ...(
        await guild.members.list({
          limit: 100,
          ...(p.after ? { after: p.after } : {}),
        })
      ).values(),
    ].map(memberView);
    return { items, next: items.length === 100 ? items.at(-1).id : null };
  }
  if (op === "bans.list") {
    const items = [
      ...(
        await guild.bans.fetch({
          limit: 100,
          ...(p.after ? { after: p.after } : {}),
        })
      ).values(),
    ].map((b) => ({
      id: b.user.id,
      name: b.user.username,
      reason: b.reason || "",
    }));
    return { items, next: items.length === 100 ? items.at(-1).id : null };
  }
  if (op === "channels.create" || op === "channels.edit") {
    const { id, confirm, reason: _, ...options } = p;
    if (options.parent) {
      const parent = await channelTarget(options.parent);
      if (parent.type !== 4) fail("The parent must be a category.");
    }
    const current = op === "channels.edit" ? await channelTarget(id) : null;
    const type = current?.type ?? options.type;
    if (type === 4) {
      delete options.parent;
      delete options.topic;
      delete options.rateLimitPerUser;
      delete options.nsfw;
      delete options.userLimit;
    }
    if ([2, 13].includes(type)) {
      delete options.topic;
      delete options.rateLimitPerUser;
      delete options.nsfw;
    } else delete options.userLimit;
    const result = current
      ? await current.edit({ ...options, reason })
      : await guild.channels.create({ ...options, reason });
    return channelView(result);
  }
  if (op === "channels.delete") {
    const c = await channelTarget(p.id);
    if (c.type === 4 && c.children.cache.size)
      fail("Move or remove the category’s channels before deleting it.");
    await c.delete(reason);
    return { id: p.id };
  }
  if (op === "channels.permissions") {
    const c = await channelTarget(p.id);
    const role = await guild.roles.fetch(p.role_id);
    if (!role) fail("Role not found.");
    grant(p.allow);
    grant(p.deny);
    const options = Object.fromEntries(
      Object.entries(P)
        .filter(([name]) => name !== "Flags")
        .map(([name, value]) => [
          name,
          (BigInt(p.allow) & value) !== 0n
            ? true
            : (BigInt(p.deny) & value) !== 0n
              ? false
              : null,
        ]),
    );
    await c.permissionOverwrites.edit(role, options, { reason });
    return { id: c.id };
  }
  if (op === "roles.create" || op === "roles.edit") {
    const { id, reason: _, color, ...options } = p;
    if (options.permissions !== undefined)
      options.permissions = grant(options.permissions);
    if (color) options.colors = { primaryColor: parseInt(color.slice(1), 16) };
    return roleView(
      op === "roles.create"
        ? await guild.roles.create({ ...options, reason })
        : await (await roleTarget(id)).edit({ ...options, reason }),
    );
  }
  if (op === "roles.delete") {
    await (await roleTarget(p.id)).delete(reason);
    return { id: p.id };
  }
  if (op === "members.role") {
    const target = await memberTarget(p.id),
      role = await roleTarget(p.role_id);
    // Prevent an assignment from granting permissions the actor cannot grant.
    if (!p.remove) grant(role.permissions.bitfield.toString());
    await target.roles[p.remove ? "remove" : "add"](role, reason);
    return memberView(target);
  }
  if (op === "members.nickname") {
    const target = await memberTarget(p.id);
    if (!target.manageable) fail("The bot cannot manage this member.");
    await target.setNickname(p.nickname || null, reason);
    return memberView(target);
  }
  if (op === "members.timeout") {
    const target = await memberTarget(p.id);
    if (!target.moderatable) fail("The bot cannot timeout this member.");
    await target.timeout(p.minutes ? p.minutes * 60000 : null, reason);
    return memberView(target);
  }
  if (op === "members.kick") {
    const target = await memberTarget(p.id);
    if (!target.kickable) fail("The bot cannot kick this member.");
    await target.kick(reason);
    return { id: p.id };
  }
  if (op === "members.ban") {
    if ([guild.ownerId, me.id, actor.id].includes(p.id))
      fail("This account is protected.");
    // A missing member may still be banned by ID. Other lookup failures must propagate.
    let target;
    try {
      target = await memberTarget(p.id);
    } catch (e) {
      if (e.code !== 10007) throw e;
    }
    if (target && !target.bannable) fail("The bot cannot ban this member.");
    await guild.members.ban(p.id, { reason, deleteMessageSeconds: 0 });
    return { id: p.id };
  }
  if (op === "bans.remove") {
    await guild.bans.remove(p.id, reason);
    return { id: p.id };
  }
  if (op === "guild.edit") {
    const { reason: _, ...options } = p;
    await guild.edit({
      ...options,
      description: options.description || null,
      reason,
    });
    return { id: guild.id, name: guild.name };
  }
  if (op === "webhooks.connect") {
    const c = await channelTarget(p.channel_id);
    if (![0, 5].includes(c.type))
      fail("Choose a text or announcement channel.");
    if (
      !c
        .permissionsFor(me)
        ?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ManageWebhooks])
    )
      fail(
        "The bot needs View Channel, Send Messages, Embed Links and Manage Webhooks here.",
      );
    const hooks = await c.fetchWebhooks();
    const h =
      [...hooks.values()].find(
        (h) =>
          h.owner?.id === me.id && h.name === "C0N Transmissions" && h.token,
      ) || (await c.createWebhook({ name: "C0N Transmissions", reason }));
    // This credential travels only over the signed bridge, never to the browser.
    return {
      url: h.url,
      discord_id: h.id,
      channel_id: c.id,
      guild_id: guild.id,
      name: c.name,
    };
  }
  if (op === "webhooks.create") {
    const c = await channelTarget(p.channel_id);
    if (![0, 5].includes(c.type))
      fail("Choose a text or announcement channel.");
    const h = await c.createWebhook({ name: p.name, reason });
    return { id: h.id, name: h.name, channel_id: h.channelId };
  }
  if (op.startsWith("webhooks.")) {
    const hooks = await guild.fetchWebhooks();
    if (op === "webhooks.list")
      return {
        items: [...hooks.values()].map((h) => ({
          id: h.id,
          name: h.name,
          channel_id: h.channelId,
          type: h.type,
          usable: !!h.token,
        })),
      };
    const h = hooks.get(p.id);
    if (!h || h.guildId !== guild.id || h.type !== 1)
      fail("Choose an incoming webhook in this server.");
    if (op === "webhooks.edit") {
      await h.edit({ name: p.name, reason });
      return { id: h.id, name: h.name };
    }
    if (op === "webhooks.delete") {
      await h.delete(reason);
      return { id: p.id };
    }
    if (!h.token)
      fail(
        "This webhook cannot be used by the bot. Create a C0N webhook instead.",
      );
    if (op === "webhooks.message.delete") {
      await h.deleteMessage(p.message_id);
      return { id: p.message_id };
    }
    const options = {
      content: p.content,
      allowedMentions: { parse: [], repliedUser: false },
    };
    const m =
      op === "webhooks.send"
        ? await h.send(options)
        : await h.editMessage(p.message_id, options);
    return {
      id: m.id,
      webhook_id: h.id,
      channel_id: h.channelId,
      url: `https://discord.com/channels/${guild.id}/${h.channelId}/${m.id}`,
    };
  }
  fail("Unsupported operation.");
}
export function controlError(error) {
  if (error.safe || error.status === 400) return error.message;
  const known = {
    50013: "Discord denied this action. Check bot permissions and role order.",
    50001: "The bot cannot access this resource.",
    10003: "Channel not found.",
    10004: "Server not found.",
    10007: "Member not found.",
    10008: "Message not found for this webhook.",
    10011: "Role not found.",
    10015: "Webhook not found.",
    10026: "This user is not banned.",
    50035:
      "Discord rejected one or more settings. Check the values and channel type.",
  };
  return (
    known[error.code] ||
    `Discord could not confirm this action (${error.code || error.status || "connection error"}). Check Discord before retrying.`
  );
}
