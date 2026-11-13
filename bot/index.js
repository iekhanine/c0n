import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  Client,
  Events,
  GatewayIntentBits,
  ActivityType,
  MessageFlags,
  PermissionFlagsBits,
  Partials,
} from "discord.js";
import { canonicalJson, signBridge } from "../shared/discord-signing.js";
import { publicChannels, memberRecord, activityRecord } from "./protocol.js";
import { executeControl, controlError } from "./control.js";
import { assignNewMemberStatus, applyParticipationProgress, participationEvent } from "./participation.js";
import { handleRoleReaction, reconcileRoleReactions } from "./reaction-roles.js";
import { ensureWelcomePost, onboardingEligible, isFirstContactChannel } from "./onboarding.js";
import { updateStatsMessage } from "./server-stats.js";
import { reconcileVerifiedMembers } from "./membership-roles.js";
const SITE = process.env.CON_SITE_URL || "https://cultofnixon.com";
if (new URL(SITE).origin !== "https://cultofnixon.com")
  throw Error("CON_SITE_URL must be the C0N production origin.");
const token = process.env.DISCORD_BOT_TOKEN,
  key = process.env.CON_SYNC_KEY;
let state = "starting",
  lastSync = null,
  guildId = "",
  allowedIds = [],
  publicIds = [],
  guild = null,
  flushBusy = false,
  heartbeatBusy = false;
const pending = new Map();
const memberChanges = new Map();
const participationPending = new Map();
const health = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.url !== "/healthz") {
    res.writeHead(404);
    return res.end("{}");
  }
  res.writeHead(state === "ready" ? 200 : 503);
  res.end(JSON.stringify({ state, last_sync: lastSync }));
});
health.listen(Number(process.env.PORT || 8080), "0.0.0.0");
if (!token || !key) {
  state = "configuration_required";
  console.error(
    "Configure DISCORD_BOT_TOKEN and CON_SYNC_KEY in Railway variables.",
  );
} else void main();
async function send(payload) {
  const timestamp = String(Date.now()),
    nonce = randomUUID();
  const r = await fetch(`${SITE}/api/discord-bot?action=sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-con-timestamp": timestamp,
      "x-con-nonce": nonce,
      "x-con-signature": signBridge(key, timestamp, nonce, payload),
    },
    body: canonicalJson(payload),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!r.ok)
    throw Object.assign(Error("C0N sync rejected"), { status: r.status });
  const data = await r.json();
  if (data.guild_id) guildId = data.guild_id;
  if (Array.isArray(data.channel_ids)) allowedIds = data.channel_ids;
  lastSync = new Date().toISOString();
  return data;
}
async function main() {
  let reactionConfig = null, reactionVersion = "";
  let welcome = null;
  const client = new Client({
    rest: { timeout: 20000, retries: 0 },
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });
  const run = (fn) =>
    void Promise.resolve()
      .then(fn)
      .catch((e) => {
        console.error("Discord worker operation failed", {
          code: e.code || e.status || "operation",
        });
      });
  const norm = value => [...String(value || "").toLowerCase()]
    .map(char => Object.fromEntries([...("ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ")].map((x,i)=>[x,"abcdefghijklmnopqrstuvwxyz"[i]]))[char] || char)
    .join("").replace(/[^a-z0-9]/g, "");
  async function operationalChannel(name) {
    await guild.channels.fetch();
    const target = [...guild.channels.cache.values()]
      .find(c => [0,5].includes(c.type) && norm(c.name) === name
        && norm(c.parent?.name) === "administration");
    if (!target || !target.isTextBased() || !target.send) return null;
    const me = await guild.members.fetchMe();
    if (!target.permissionsFor(me)?.has(["ViewChannel","SendMessages"])) return null;
    return target;
  }
  async function memberNotice(member, action) {
    if (member.user?.bot) return;
    const target = await operationalChannel("joinsandleaves");
    if (!target) { console.warn("C0N join/leave notice skipped: admin channel unavailable."); return; }
    const name = (member.user?.username || member.displayName || "Unknown member").replace(/[`*_~|<>@]/g,"").slice(0,70);
    const verb = action === "join" ? "joined" : "left";
    const icon = action === "join" ? "🟢" : "🔴";
    await target.send({
      content: `${icon} **Member ${verb}** · ${name} (ID: \`${member.id}\`)${action === "join" ? ` · Members: ${member.guild.memberCount}` : ""}`,
      allowedMentions: { parse: [] },
    });
  }
  async function operationalStatus() {
    let website = false, database = false, websiteLatency = null, databaseLatency = null;
    const started = Date.now();
    try {
      const response = await fetch(SITE + "/", {
        method: "GET", signal: AbortSignal.timeout(8000), redirect: "error",
        headers: { "Cache-Control": "no-cache" },
      });
      website = response.ok;
      websiteLatency = Date.now() - started;
    } catch {}
    const dbStarted = Date.now();
    try {
      const check = await send({ kind: "health_check", guild_id: guildId });
      database = check.database_connected === true;
      databaseLatency = Date.now() - dbStarted;
    } catch {}
    const botReady = state === "ready" && client.isReady();
    return [
      "**C0N / SYSTEM STATUS**",
      `${website ? "🟢" : "🔴"} Website: ${website ? "Online" : "Unavailable"}${websiteLatency === null ? "" : ` (${websiteLatency} ms)`}`,
      `${database ? "🟢" : "🔴"} Database: ${database ? "Connected" : "Unavailable"}${databaseLatency === null ? "" : ` (${databaseLatency} ms)`}`,
      `${botReady ? "🟢" : "🔴"} Discord bot: ${botReady ? "Online" : "Not ready"}`,
      `Checked: <t:${Math.floor(Date.now()/1000)}:F>`,
    ].join("\n");
  }
  async function refreshWelcome() {
    if (!guild || !client.user) return;
    await guild.channels.fetch();
    const contact = [...guild.channels.cache.values()].find(c => norm(c.name) === "firstcontact" && [0,5].includes(c.type));
    if (contact) {
      const me = await guild.members.fetchMe();
      const botRole = me.roles.cache.find(r => norm(r.name) === "cultofnixon");
      if (botRole && !contact.permissionsFor(me)?.has("SendMessages")) {
        await contact.permissionOverwrites.edit(botRole, {
          ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AddReactions: true,
        }, { reason: "C0N restore welcome-post delivery and onboarding reactions" });
      }
    }
    welcome = await ensureWelcomePost(guild, client.user.id);
    const firstContact = [...guild.channels.cache.values()].find(c => norm(c.name) === "firstcontact");
    const perms = firstContact?.permissionsFor(await guild.members.fetchMe());
    console.info("C0N welcome post diagnostic", JSON.stringify({
      channelFound: Boolean(firstContact), channelId: firstContact?.id,
      messageId: welcome?.messageId,
      view: perms?.has("ViewChannel"), history: perms?.has("ReadMessageHistory"),
      send: perms?.has("SendMessages"), react: perms?.has("AddReactions"),
      channelIsText: firstContact?.isTextBased(),
    }));
  }
  async function ensureInitiatedCompoundAccess() {
    await guild.channels.fetch();
    await guild.roles.fetch();
    const me = await guild.members.fetchMe();
    const category = [...guild.channels.cache.values()].find(c =>
      c.type === 4 && norm(c.name) === "thecompound");
    const initiated = [...guild.roles.cache.values()].find(r =>
      norm(r.name) === "initiated");
    if (!category || !initiated) {
      console.warn("C0N Initiated Compound access missing role or category");
      return;
    }
    const current = category.permissionOverwrites.cache.get(initiated.id);
    const allow = current?.allow.has(["ViewChannel","SendMessages"]) || false;
    if (!allow) {
      await category.permissionOverwrites.edit(initiated, {
        ViewChannel: true, SendMessages: true,
      }, { reason: "C0N owner-approved Initiated visibility and posting in The Compound" });
    }
    console.info("C0N Initiated Compound access", JSON.stringify({
      category: category.name, role: initiated.name,
      view: category.permissionOverwrites.cache.get(initiated.id)?.allow.has("ViewChannel"),
      send: category.permissionOverwrites.cache.get(initiated.id)?.allow.has("SendMessages"),
      botCanManage: category.permissionsFor(me)?.has("ManageRoles"),
    }));
    const overrides = [...guild.channels.cache.values()]
      .filter(c => c.parentId === category.id && [0,5].includes(c.type))
      .map(c => ({ channel: c.name, synced: c.permissionsLocked,
        initiatedCanView: c.permissionOverwrites.cache.get(initiated.id)?.allow.has("ViewChannel") || false,
        initiatedCanSend: c.permissionOverwrites.cache.get(initiated.id)?.allow.has("SendMessages") || false,
        explicitDeny: Boolean(c.permissionOverwrites.cache.get(initiated.id)?.deny.has(["ViewChannel","SendMessages"])) }));
    console.info("C0N Compound child permissions", JSON.stringify(overrides));
  }
  async function reconcileWelcomeReactions() {
    if (!welcome?.channelId || !welcome?.messageId) {
      console.warn("C0N welcome reconciliation skipped: post not accessible");
      return;
    }
    const channel = await guild.channels.fetch(welcome.channelId);
    const message = await channel.messages.fetch(welcome.messageId);
    const reaction = message.reactions.cache.find(r => r.emoji.name === "👋");
    if (!reaction) return;
    let after;
    let count = 0;
    for (let page = 0; page < 20; page++) {
      const users = await reaction.users.fetch({ limit: 100, ...(after ? { after } : {}) });
      for (const user of users.values()) {
        if (user.bot) continue;
        await applyParticipationProgress(guild, {
          user_id: user.id, participated: true, eligible_instigator: false,
        });
        count++;
      }
      if (users.size < 100) break;
      after = users.last()?.id;
      if (!after) break;
    }
    console.info("C0N welcome reactions reconciled", { count });
  }
  async function repairBotCategoryAccess() {
    // Repair the two categories restricted by the earlier setup sequence.
    // Never change @everyone, member, staff, or category access role permissions.
    await guild.channels.fetch();
    await guild.roles.fetch();
    const me = await guild.members.fetchMe();
    const compact = value => [...String(value || "").toLowerCase()]
      .map(c => Object.fromEntries([...("ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ")].map((x,i)=>[x,"abcdefghijklmnopqrstuvwxyz"[i]]))[c] || c)
      .join("").replace(/[^a-z0-9]/g, "");
    const botRole = me.roles.cache.find(r => compact(r.name) === "cultofnixon");
    if (!botRole || !me.permissions.has("ManageRoles")) {
      console.warn("C0N access repair skipped: bot role or Manage Roles permission unavailable.");
      return;
    }
    for (const name of ["thecompound", "theworkshop"]) {
      const category = [...guild.channels.cache.values()].find(c =>
        c.type === 4 && compact(c.name) === name);
      if (!category || category.permissionsFor(me)?.has("ViewChannel")) continue;
      try {
        await category.permissionOverwrites.edit(botRole, { ViewChannel: true }, {
          reason: "Repair C0N bot visibility after interrupted category access setup",
        });
        console.info("C0N access repair", JSON.stringify({ category: category.name,
          botView: category.permissionsFor(me)?.has("ViewChannel"), status: "updated" }));
      } catch (e) {
        console.error("C0N access repair rejected", JSON.stringify({
          category: category.name, code: e.code || e.status || "unknown",
        }));
      }
    }
  }
    async function auditCategoryPermissions() {
    await guild.channels.fetch();
    await guild.roles.fetch();
    const me = await guild.members.fetchMe();
    const compact = value => [...String(value || "").toLowerCase()]
      .map(c => Object.fromEntries([...("ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ")].map((x,i)=>[x,"abcdefghijklmnopqrstuvwxyz"[i]]))[c] || c)
      .join("").replace(/[^a-z0-9]/g, "");
    const wanted = new Set(["thecompound","theworkshop","thegallery","thearcade","thegames","thevoice","starthere","administration","theunspoken"]);
    const list = [...guild.channels.cache.values()].filter(c =>
      c.type === 4 && wanted.has(compact(c.name)));
    const view = 1024n;
    console.info("C0N access audit", JSON.stringify({
      botRoles: me.roles.cache.map(r => ({ name: r.name, position: r.position })),
      categories: list.map(c => {
        const p = c.permissionsFor(me);
        const world = c.permissionOverwrites.cache.get(guild.id);
        return { name: c.name, id: c.id, botView: p?.has("ViewChannel"),
          botManageRoles: p?.has("ManageRoles"),
          worldViewDenied: Boolean(world && (world.deny.bitfield & view)),
          worldViewAllowed: Boolean(world && (world.allow.bitfield & view)),
          roleOverwrites: [...c.permissionOverwrites.cache.values()]
            .filter(o=>o.id!==guild.id && ((o.allow.bitfield | o.deny.bitfield) & view)!==0n)
            .map(o=>({ name: guild.roles.cache.get(o.id)?.name || "unknown",
              allowView: Boolean(o.allow.bitfield & view),
              denyView: Boolean(o.deny.bitfield & view) })),
        };
      }),
    }));
  }
    async function heartbeat() {
    if (!guild || heartbeatBusy) return;
    heartbeatBusy = true;
    try {
      const channels = publicChannels(guild);
      publicIds = channels.map((c) => c.id);
      await send({
        kind: "heartbeat",
        guild_id: guildId,
        bot_id: client.user.id,
        bot_name: client.user.username,
        member_count: guild.memberCount,
        channels,
      });
    } finally {
      heartbeatBusy = false;
    }
  }
  let controlBusy = false,
    receipt = null;
  async function commands() {
    if (state !== "ready" || !guild || controlBusy) return;
    controlBusy = true;
    try {
      // Retain the result until acknowledged. Never re-run the Discord mutation.
      if (receipt) {
        await send(receipt);
        receipt = null;
      }
      const { command, reaction_roles } = await send({
        kind: "control_poll",
        guild_id: guildId,
      });
      const config = reaction_roles || null;
      const version = JSON.stringify(config);
      if (version !== reactionVersion) {
        reactionVersion = version;
        reactionConfig = config;
        if (config?.mappings?.length)
          run(() => reconcileRoleReactions(guild, config, (reaction, user) => {
            recordParticipation(participationEvent(
              "reaction", reaction.message.id, reaction.message.channelId,
              user.id, Date.now(), reaction.emoji.id ||
                [...(reaction.emoji.name || "")].map(c => c.codePointAt(0).toString(16)).join("-"),
            ));
          }));
      }
      if (!command) return;
      try {
        const result = await executeControl(guild, command);
        if (Buffer.byteLength(JSON.stringify(result)) > 390000)
          throw Object.assign(
            Error(
              "This result is too large to display. Reduce server permission overrides before loading the full channel list.",
            ),
            { safe: true },
          );
        receipt = {
          kind: "control_result",
          guild_id: guildId,
          command_id: command.id,
          state: "succeeded",
          result,
        };
      } catch (e) {
        const uncertain = !e.safe && (!e.code || Number(e.status) >= 500);
        receipt = {
          kind: "control_result",
          guild_id: guildId,
          command_id: command.id,
          state: uncertain ? "uncertain" : "failed",
          error: controlError(e),
        };
      }
      await send(receipt);
      receipt = null;
    } finally {
      controlBusy = false;
    }
  }
  let memberRolesBusy=false;
  async function syncMembershipRoles() {
    if (state !== "ready" || !guild || memberRolesBusy) return;
    memberRolesBusy=true;
    try {
      const result=await send({kind:"membership_roles",guild_id:guildId});
      if (result.configured !== true) return;
      const changes=await reconcileVerifiedMembers(guild,result.user_ids);
      if (changes.assigned || changes.removed)
        console.info("C0N membership roles reconciled",changes);
    } finally { memberRolesBusy=false; }
  }
  async function checkProgress() {
    if (!guild || state !== "ready") return;
    const result = await send({ kind: "participation_check", guild_id: guildId });
    console.info("C0N participation reconciliation", { candidates: (result.progress || []).length });
    for (const progress of result.progress || [])
      await applyParticipationProgress(guild, progress);
  }
  async function flush() {
    if (flushBusy || (!pending.size && !memberChanges.size && !participationPending.size)) return;
    flushBusy = true;
    try {
      const changes = [...memberChanges.values()].slice(0, 100);
      const upserts = changes.filter((v) => !v.removed);
      if (upserts.length)
        await send({
          kind: "members",
          guild_id: guildId,
          members: upserts.map((v) => v.member),
        });
      for (const item of upserts)
        if (memberChanges.get(item.id) === item) memberChanges.delete(item.id);
      for (const item of changes.filter((v) => v.removed)) {
        await send({
          kind: "member_remove",
          guild_id: guildId,
          user_id: item.id,
        });
        if (memberChanges.get(item.id) === item) memberChanges.delete(item.id);
      }
      const activity = [...participationPending.entries()].slice(0, 100);
      if (activity.length) {
        const result = await send({
          kind: "participation", guild_id: guildId,
          events: activity.map(([, value]) => value),
        });
        for (const [id, value] of activity)
          if (participationPending.get(id) === value) participationPending.delete(id);
        console.info("C0N participation batch", { sent: activity.length, onboarding: activity.filter(([, event]) => event.onboarding).length, candidates: (result.progress || []).length });
        for (const progress of result.progress || [])
          await applyParticipationProgress(guild, progress);
      }
      const batch = [...pending.values()].slice(0, 100);
      if (batch.length) {
        await send({ kind: "messages", guild_id: guildId, messages: batch });
        for (const item of batch) pending.delete(item.id);
      }
    } finally {
      flushBusy = false;
    }
  }
  client.on(Events.ClientReady, () =>
    run(async () => {
      const config = await send({ kind: "bootstrap" });
      if (!/^\d{17,20}$/.test(config.guild_id))
        throw Error("Configure the server ID in C0N Admin → Discord bot.");
      guild = await client.guilds.fetch(config.guild_id);
      await guild.fetch();
      await refreshWelcome();
      await heartbeat();
      const snapshot = randomUUID();
      await send({
        kind: "snapshot_begin",
        guild_id: guildId,
        snapshot_id: snapshot,
      });
      const members = [...(await guild.members.fetch()).values()];
      for (let i = 0; i < members.length; i += 100)
        await send({
          kind: "members",
          guild_id: guildId,
          members: members.slice(i, i + 100).map(memberRecord),
        });
      await send({
        kind: "snapshot_end",
        guild_id: guildId,
        snapshot_id: snapshot,
      });
      await guild.commands.create({
        name: "con",
        description: "Your Cult of nix0n community",
        options: [
          {
            name: "site",
            description: "Open the C0N community website",
            type: 1,
          },
          {
            name: "projects",
            description: "Explore community projects",
            type: 1,
          },
          {
            name: "me",
            description: "Open your C0N member workspace",
            type: 1,
          },
        ],
      });
      await guild.commands.create({
        name: "cultofnixon",
        description: "C0N server operations",
        default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
        options: [{
          name: "status",
          description: "Check website, database and Discord bot health",
          type: 1,
        }],
      });
      client.user.setActivity("cultofnixon.com", {
        type: ActivityType.Watching,
      });
      state = "ready";
      run(async () => { await repairBotCategoryAccess(); await ensureInitiatedCompoundAccess(); await auditCategoryPermissions(); });
      run(reconcileWelcomeReactions);
      run(checkProgress);
      run(syncMembershipRoles);
      run(() => updateStatsMessage(guild, client.user.id, SITE, () => send({kind:"server_stats",guild_id:guildId})));
      console.log("C0N Discord worker connected.");
    }),
  );
  client.on(Events.ChannelUpdate, (before, after) => {
    if (after.guild.id === guildId &&
        (isFirstContactChannel(before) || isFirstContactChannel(after)))
      run(refreshWelcome);
  });
  client.on(Events.ChannelCreate, (channel) => {
    if (channel.guild.id === guildId && isFirstContactChannel(channel))
      run(refreshWelcome);
  });
  client.on(Events.GuildMemberAdd, (m) => {
    if (m.guild.id === guildId) {
      memberChanges.set(m.id, { id: m.id, member: memberRecord(m) });
      run(() => assignNewMemberStatus(m));
      run(syncMembershipRoles);
      run(() => memberNotice(m, "join"));
    }
  });
  client.on(Events.GuildMemberUpdate, (_, m) => {
    if (m.guild.id === guildId)
      memberChanges.set(m.id, { id: m.id, member: memberRecord(m) });
  });
  client.on(Events.GuildMemberRemove, (m) => {
    if (m.guild.id === guildId)
      memberChanges.set(m.id, { id: m.id, removed: true });
    if (m.guild.id === guildId) run(() => memberNotice(m, "leave"));
  });
  const recordParticipation = (event) => {
    const id = `${event.type}:${event.event_id}:${event.user_id}`;
    if (participationPending.size >= 10000)
      participationPending.delete(participationPending.keys().next().value);
    participationPending.set(id, { ...event, onboarding: onboardingEligible(event, welcome) });
  };
  client.on(Events.MessageReactionAdd, (reaction, user) => {
    if (reaction.message.guildId === guildId && !user.bot) {
      const event = participationEvent(
        "reaction", reaction.message.id, reaction.message.channelId,
        user.id, Date.now(), reaction.emoji.id || [...(reaction.emoji.name || "")].map(c => c.codePointAt(0).toString(16)).join("-"),
      );
      recordParticipation(event);
      if (onboardingEligible(event, welcome))
        run(async () => {
          await applyParticipationProgress(guild, {
            user_id: user.id, participated: true, eligible_instigator: false,
          });
          console.info("C0N welcome reaction promoted", { userId: user.id });
        });
    }
    if (reactionConfig)
      run(() => handleRoleReaction(guild, reactionConfig, reaction, user, false));
  });
  client.on(Events.MessageReactionRemove, (reaction, user) => {
    if (reactionConfig)
      run(() => handleRoleReaction(guild, reactionConfig, reaction, user, true));
  });
  client.on(Events.MessageCreate, (m) => {
    if (m.guildId === guildId && !m.author.bot && !m.webhookId)
      recordParticipation(participationEvent("message", m.id, m.channelId, m.author.id, m.createdTimestamp));
    const record = activityRecord(m, allowedIds, publicIds, guildId);
    if (record) {
      if (pending.size >= 10000) pending.delete(pending.keys().next().value);
      pending.set(record.id, record);
    }
  });
  client.on(Events.InteractionCreate, (i) => {
    if (i.isChatInputCommand() && i.commandName === "cultofnixon" && i.guildId === guildId) {
      run(async () => {
        if (i.options.getSubcommand(false) !== "status") return;
        const channel = await operationalChannel("systemstatus");
        if (!channel || i.channelId !== channel.id) {
          return i.reply({ content: "Use this command in #system-status.", flags: MessageFlags.Ephemeral });
        }
        if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          return i.reply({ content: "Staff only.", flags: MessageFlags.Ephemeral });
        }
        await i.deferReply({ flags: MessageFlags.Ephemeral });
        await i.editReply(await operationalStatus());
      });
      return;
    }

    if (
      !i.isChatInputCommand() ||
      i.commandName !== "con" ||
      i.guildId !== guildId
    )
      return;
    run(() => {
      const sub = i.options.getSubcommand(false) || "site";
      const target =
        sub === "me" ? "/my-projects" : sub === "projects" ? "/projects" : "/";
      return i.reply({
        content:
          sub === "me"
            ? "Your C0N workspace uses the same Discord sign-in. Manage your projects on the website."
            : "Build. Share. Preserve. Question. Ship.",
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label:
                  sub === "me"
                    ? "My C0N workspace"
                    : sub === "projects"
                      ? "Community projects"
                      : "Open C0N",
                url: SITE + target,
              },
            ],
          },
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    });
  });
  client.on(Events.ShardDisconnect, () => {
    state = "reconnecting";
  });
  client.on(Events.ShardResume, () => {
    state = "ready";
    run(heartbeat);
    run(syncMembershipRoles);
    run(() => updateStatsMessage(guild, client.user.id, SITE, () => send({kind:"server_stats",guild_id:guildId})));
  });
  client.on(Events.Error, (e) =>
    console.error("Discord client error", { code: e.code || "connection" }),
  );
  const flushTimer = setInterval(() => run(flush), 15000),
    heartbeatTimer = setInterval(() => run(heartbeat), 60000),
    welcomeTimer = setInterval(() => { if (!welcome?.messageId) run(refreshWelcome); }, 300000),
    progressTimer = setInterval(() => run(checkProgress), 3600000),
    membershipTimer = setInterval(() => run(syncMembershipRoles), 60000),
    controlTimer = setInterval(() => run(commands), 5000),
    statsTimer = setInterval(() => { if (state === "ready" && guild) run(() => updateStatsMessage(guild, client.user.id, SITE, () => send({kind:"server_stats",guild_id:guildId}))); }, 15 * 60 * 1000);
  const shutdown = async () => {
    state = "stopping";
    clearInterval(controlTimer);
    clearInterval(statsTimer);
    clearInterval(progressTimer);
    clearInterval(membershipTimer);
    clearInterval(welcomeTimer);
    clearInterval(flushTimer);
    clearInterval(heartbeatTimer);
    await flush().catch(() => {});
    client.destroy();
    health.close(() => process.exit(0));
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
  try {
    await client.login(token);
  } catch (e) {
    state = "login_failed";
    console.error(
      "Bot login failed. Check the bot token and Server Members intent.",
      { code: e.code || "login" },
    );
  }
}
