import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  Client,
  Events,
  GatewayIntentBits,
  ActivityType,
  MessageFlags,
  Partials,
} from "discord.js";
import { canonicalJson, signBridge } from "../shared/discord-signing.js";
import { publicChannels, memberRecord, activityRecord } from "./protocol.js";
import { executeControl, controlError } from "./control.js";
import { handleRoleReaction, reconcileRoleReactions } from "./reaction-roles.js";
const SITE = process.env.CON_SITE_URL || "https://c0n.ivansays.com";
if (new URL(SITE).origin !== "https://c0n.ivansays.com")
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
          run(() => reconcileRoleReactions(guild, config));
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
  async function flush() {
    if (flushBusy || (!pending.size && !memberChanges.size)) return;
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
      client.user.setActivity("c0n.ivansays.com", {
        type: ActivityType.Watching,
      });
      state = "ready";
      console.log("C0N Discord worker connected.");
    }),
  );
  client.on(Events.GuildMemberAdd, (m) => {
    if (m.guild.id === guildId)
      memberChanges.set(m.id, { id: m.id, member: memberRecord(m) });
  });
  client.on(Events.GuildMemberUpdate, (_, m) => {
    if (m.guild.id === guildId)
      memberChanges.set(m.id, { id: m.id, member: memberRecord(m) });
  });
  client.on(Events.GuildMemberRemove, (m) => {
    if (m.guild.id === guildId)
      memberChanges.set(m.id, { id: m.id, removed: true });
  });
  client.on(Events.MessageReactionAdd, (reaction, user) => {
    if (reactionConfig)
      run(() => handleRoleReaction(guild, reactionConfig, reaction, user, false));
  });
  client.on(Events.MessageReactionRemove, (reaction, user) => {
    if (reactionConfig)
      run(() => handleRoleReaction(guild, reactionConfig, reaction, user, true));
  });
  client.on(Events.MessageCreate, (m) => {
    const record = activityRecord(m, allowedIds, publicIds, guildId);
    if (record) {
      if (pending.size >= 10000) pending.delete(pending.keys().next().value);
      pending.set(record.id, record);
    }
  });
  client.on(Events.InteractionCreate, (i) => {
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
  });
  client.on(Events.Error, (e) =>
    console.error("Discord client error", { code: e.code || "connection" }),
  );
  const flushTimer = setInterval(() => run(flush), 15000),
    heartbeatTimer = setInterval(() => run(heartbeat), 60000),
    controlTimer = setInterval(() => run(commands), 5000);
  const shutdown = async () => {
    state = "stopping";
    clearInterval(controlTimer);
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
