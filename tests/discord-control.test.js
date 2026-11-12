import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { controlInput, smallCaps } from "../shared/discord-control.js";
import { discordBotHandler } from "../server/discord-bot.js";
import { seal, ORIGIN } from "../server/auth.js";
import { signBridge } from "../shared/discord-signing.js";
import { executeControl } from "../bot/control.js";
const owner = "267489014922215434",
  guildId = "903106349850849370",
  targetId = "123456789012345678",
  channelId = "223456789012345678",
  botId = "1570103248453509281";
process.env.SESSION_SECRET =
  "control-tests-session-secret-at-least-32-characters";
process.env.WEBHOOK_ENCRYPTION_KEY =
  "control-tests-encryption-secret-at-least-32-characters";
process.env.DISCORD_ADMIN_IDS = owner;
test("commands whitelist fields, require audit reasons and destructive confirmations", () => {
  assert.equal(smallCaps("general"), "ɢᴇɴᴇʀᴀʟ");
  assert.equal(
    controlInput("channels.create", {
      name: "general",
      type: 0,
      reason: "setup",
    }).name,
    "ɢᴇɴᴇʀᴀʟ",
  );
  assert.throws(() =>
    controlInput("raw.request", { url: "https://example.com" }),
  );
  assert.throws(() =>
    controlInput("members.ban", { id: targetId, reason: "spam" }),
  );
  assert.throws(() =>
    controlInput("members.timeout", {
      id: targetId,
      minutes: 40321,
      reason: "test",
    }),
  );
  assert.throws(() =>
    controlInput("channels.permissions", {
      id: channelId,
      role_id: targetId,
      allow: "1024",
      deny: "1024",
      reason: "test",
    }),
  );
  assert.deepEqual(
    controlInput("webhooks.send", {
      id: channelId,
      content: "hi",
      reason: "announcement",
      url: "https://evil.test",
      token: "secret",
    }),
    { id: channelId, reason: "announcement", content: "hi" },
  );
});
test("private durable command queue authenticates owner, rejects replay and claims each request once", async () => {
  const pg = new PGlite();
  await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  const db = {
    async query(sql, args) {
      if (sql.includes("pg_advisory_xact_lock"))
        return { rows: [], rowCount: 0 };
      if (
        !args &&
        (sql.includes("CREATE TABLE") ||
          sql.includes("CREATE SCHEMA") ||
          sql.includes("ALTER TABLE con.staff_users ADD COLUMN"))
      ) {
        const rs = await pg.exec(sql),
          r = rs.at(-1);
        return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
      }
      const r = await pg.query(sql, args);
      return { ...r, rowCount: r.affectedRows ?? r.rows.length };
    },
    async connect() {
      return { ...this, release() {} };
    },
  };
  const call = async (
    user,
    action,
    method = "GET",
    body = {},
    headers = {},
  ) => {
    const req = {
      url: "/api/discord-bot?action=" + action,
      method,
      body,
      headers: {
        origin: ORIGIN,
        ...(user
          ? {
              cookie: `__Host-con_session=${await seal({ user: { id: user, name: "Owner" } }, 60)}`,
            }
          : {}),
        ...headers,
      },
    };
    const res = {
      setHeader() {},
      end(value) {
        this.body = JSON.parse(value);
      },
    };
    await discordBotHandler(
      req,
      res,
      () => db,
      async (s) => ({ owner: s.user.id === owner }),
    );
    return res;
  };
  let key;
  const sync = async (body, nonce = randomUUID()) => {
    const ts = String(Date.now());
    return call(null, "sync", "POST", body, {
      "x-con-timestamp": ts,
      "x-con-nonce": nonce,
      "x-con-signature": signBridge(key, ts, nonce, body),
    });
  };
  try {
    await call(owner, "settings", "PUT", {
      guild_id: guildId,
      channel_ids: [],
      publish_members: false,
    });
    key = (await call(owner, "key", "POST")).body.key;
    const payload = {
        id: targetId,
        confirm: targetId,
        reason: "Repeated spam",
      },
      request_id = randomUUID(),
      body = { operation: "members.ban", payload, request_id };
    assert.equal(
      (await call(null, "control_command", "POST", body)).statusCode,
      401,
    );
    assert.equal(
      (await call(targetId, "control_command", "POST", body)).statusCode,
      403,
    );
    assert.equal(
      (
        await call(owner, "control_command", "POST", body, {
          origin: "https://evil.test",
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await call(owner, "control_command", "GET", body)).statusCode,
      405,
    );
    const created = await call(owner, "control_command", "POST", body);
    assert.equal(created.statusCode, 200);
    assert.equal(created.body.id, request_id);
    assert.equal(
      (await call(owner, "control_command", "POST", body)).body.id,
      request_id,
    );
    assert.equal(
      (
        await call(owner, "control_command", "POST", {
          ...body,
          operation: "members.kick",
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (await sync({ kind: "control_poll", guild_id: targetId })).statusCode,
      403,
    );
    const nonce = randomUUID(),
      poll = { kind: "control_poll", guild_id: guildId };
    const claimed = await sync(poll, nonce);
    assert.equal(claimed.statusCode, 200);
    assert.equal(claimed.body.command.id, request_id);
    assert.equal(claimed.body.command.actor_id, owner);
    assert.equal((await sync(poll, nonce)).statusCode, 409);
    assert.equal((await sync(poll)).body.command, null);
    const result = {
      kind: "control_result",
      guild_id: guildId,
      command_id: request_id,
      state: "succeeded",
      result: { id: targetId },
    };
    assert.equal((await sync(result)).statusCode, 200);
    assert.equal(
      (await sync(result)).statusCode,
      200,
      "lost result acknowledgements are safe to retry",
    );
    const found = await call(owner, `control_result&id=${request_id}`);
    assert.equal(found.body.state, "succeeded");
    const history = await call(owner, "control_history");
    assert.equal(history.body.items[0].reason, "Repeated spam");
    assert.equal(
      (await call(null, `control_result&id=${request_id}`)).statusCode,
      401,
    );
    assert.equal((await call(targetId, "control_history")).statusCode, 403);
    const connectId = randomUUID();
    await call(owner, "control_command", "POST", {
      operation: "webhooks.connect",
      request_id: connectId,
      payload: { channel_id: channelId, reason: "Publish transmissions" },
    });
    assert.equal((await sync(poll)).body.command.id, connectId);
    const secretUrl = `https://discord.com/api/webhooks/${targetId}/${"a".repeat(60)}`;
    const receipt = {
      kind: "control_result",
      guild_id: guildId,
      command_id: connectId,
      state: "succeeded",
      result: {
        url: secretUrl,
        discord_id: targetId,
        channel_id: channelId,
        guild_id: guildId,
        name: "announcements",
      },
    };
    assert.equal(
      (
        await sync({
          ...receipt,
          result: { ...receipt.result, channel_id: targetId },
        })
      ).statusCode,
      400,
    );
    assert.equal((await sync(receipt)).statusCode, 200);
    assert.equal((await sync(receipt)).statusCode, 200);
    const connection = await call(owner, `control_result&id=${connectId}`);
    assert.equal(connection.body.result.channel_id, channelId);
    assert.ok(connection.body.result.id);
    assert.equal(JSON.stringify(connection.body).includes(secretUrl), false);
    const stored = await pg.query(
      "SELECT url_cipher FROM con.webhooks WHERE discord_id=$1",
      [targetId],
    );
    assert.equal(stored.rows.length, 1);
    assert.notEqual(stored.rows[0].url_cipher, secretUrl);
    const access = await pg.query(
      "SELECT has_table_privilege('anon','con.discord_commands','SELECT') AS allowed",
    );
    assert.equal(access.rows[0].allowed, false);
    const stale = randomUUID();
    await call(owner, "control_command", "POST", {
      ...body,
      request_id: stale,
    });
    await db.query(
      "UPDATE con.discord_commands SET created_at=now()-interval '5 minutes' WHERE id=$1",
      [stale],
    );
    assert.equal((await sync(poll)).body.command, null);
    assert.equal(
      (await call(owner, `control_result&id=${stale}`)).body.state,
      "expired",
    );
  } finally {
    await pg.close();
  }
});
function fakeGuild() {
  const actor = {
    id: owner,
    permissions: { has: () => true },
    roles: { highest: { comparePositionTo: () => 1 } },
  };
  const me = {
    id: botId,
    permissions: { has: () => true },
    roles: { highest: { name: "Bot", id: botId } },
  };
  return {
    id: guildId,
    ownerId: owner,
    members: {
      fetch: async (id) =>
        id === owner
          ? actor
          : {
              id,
              roles: { highest: {} },
              kickable: true,
              bannable: true,
              moderatable: true,
              kick: async () => {},
              timeout: async () => {},
            },
      fetchMe: async () => me,
    },
    roles: { fetch: async () => null },
    channels: { fetch: async () => null },
  };
}
test("worker enforces actor permissions, protected accounts and hierarchy before moderation", async () => {
  const guild = fakeGuild();
  let kicked = false;
  const cmd = {
    operation: "members.kick",
    actor_id: owner,
    payload: { id: targetId, confirm: targetId, reason: "spam" },
  };
  guild.members.fetch = async (id) =>
    id === owner
      ? { id: owner, permissions: { has: () => false } }
      : {
          id,
          kickable: true,
          kick: async () => {
            kicked = true;
          },
        };
  await assert.rejects(
    executeControl(guild, cmd),
    /Your Discord account lacks/,
  );
  assert.equal(kicked, false);
  const protectedGuild = fakeGuild();
  await assert.rejects(
    executeControl(protectedGuild, {
      ...cmd,
      payload: { id: owner, confirm: owner, reason: "test" },
    }),
    /protected/,
  );
  const hierarchy = fakeGuild();
  hierarchy.ownerId = "333456789012345678";
  hierarchy.members.fetch = async (id) =>
    id === owner
      ? {
          id: owner,
          permissions: { has: () => true },
          roles: { highest: { comparePositionTo: () => -1 } },
        }
      : {
          id,
          roles: { highest: {} },
          kickable: true,
          kick: async () => {
            kicked = true;
          },
        };
  await assert.rejects(executeControl(hierarchy, cmd), /highest role/);
  assert.equal(kicked, false);
});
test("webhook output never exposes credentials, mentions suppressed on send and edit", async () => {
  const guild = fakeGuild();
  const options = [];
  const hook = {
    id: channelId,
    guildId,
    type: 1,
    name: "C0N",
    channelId: targetId,
    token: "PRIVATE",
    send: async (o) => {
      options.push(o);
      return { id: "333456789012345678" };
    },
    editMessage: async (id, o) => {
      options.push(o);
      return { id };
    },
  };
  guild.fetchWebhooks = async () => new Map([[hook.id, hook]]);
  const list = await executeControl(guild, {
    operation: "webhooks.list",
    actor_id: owner,
    payload: {},
  });
  assert.equal(JSON.stringify(list).includes("PRIVATE"), false);
  for (const op of ["webhooks.send", "webhooks.message.edit"]) {
    const result = await executeControl(guild, {
      operation: op,
      actor_id: owner,
      payload: {
        id: hook.id,
        content: "@everyone test",
        message_id: targetId,
        reason: "announcement",
      },
    });
    assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  }
  for (const option of options)
    assert.deepEqual(option.allowedMentions, { parse: [], repliedUser: false });
  await assert.rejects(
    executeControl(guild, {
      operation: "webhooks.send",
      actor_id: owner,
      payload: { id: targetId, content: "test", reason: "test" },
    }),
    /this server/,
  );
});
test("channel edits validate category parents and role grants never allow Administrator", async () => {
  const guild = fakeGuild();
  let options;
  guild.channels.create = async (o) => {
    options = o;
    return { id: channelId, name: o.name, type: o.type, rawPosition: 0 };
  };
  await executeControl(guild, {
    operation: "channels.create",
    actor_id: owner,
    payload: {
      name: "ɢᴀᴍɪɴɢ",
      type: 4,
      parent: targetId,
      topic: "discard",
      reason: "organize",
    },
  }).catch((e) => assert.match(e.message, /channel/));
  const result = await executeControl(guild, {
    operation: "channels.create",
    actor_id: owner,
    payload: { name: "ɢᴀᴍɪɴɢ", type: 4, topic: "discard", reason: "organize" },
  });
  assert.equal(result.type, 4);
  assert.equal(options.topic, undefined);
  await assert.rejects(
    executeControl(guild, {
      operation: "roles.create",
      actor_id: owner,
      payload: { name: "bad", permissions: "8", reason: "test" },
    }),
    /Administrator/,
  );
});

test("publishing connection reuses a bot-owned webhook and checks channel access", async () => {
  const guild = fakeGuild();
  let created = 0;
  const hook = {
    id: targetId,
    name: "C0N Transmissions",
    owner: { id: botId },
    token: "secret",
    url: `https://discord.com/api/webhooks/${targetId}/${"x".repeat(60)}`,
  };
  const hooks = new Map();
  const channel = {
    id: channelId,
    guildId,
    type: 0,
    name: "announcements",
    isThread: () => false,
    permissionsFor: () => ({ has: () => true }),
    fetchWebhooks: async () => hooks,
    createWebhook: async () => {
      created++;
      hooks.set(hook.id, hook);
      return hook;
    },
  };
  guild.channels.fetch = async () => channel;
  const cmd = {
    operation: "webhooks.connect",
    actor_id: owner,
    payload: { channel_id: channelId, reason: "Publishing" },
  };
  const receipt = await executeControl(guild, cmd);
  assert.equal(receipt.channel_id, channelId);
  assert.equal(receipt.guild_id, guildId);
  assert.equal(receipt.url, hook.url);
  await executeControl(guild, cmd);
  assert.equal(created, 1);
  channel.permissionsFor = () => ({ has: () => false });
  await assert.rejects(
    executeControl(guild, cmd),
    /cannot manage this channel/,
  );
});

test("pin worker verifies channel permissions and confirms the exact webhook message", async () => {
  const actor = { id: owner, permissions: { has: () => true } };
  const me = { id: botId, permissions: { has: () => true } };
  let pins = 0,
    unpins = 0;
  const channel = {
    type: 0,
    permissionsFor: () => ({ has: () => true }),
    messages: {
      fetch: async (id) => ({
        id,
        webhookId: "345678901234567890",
        pin: async () => {
          pins++;
        },
        unpin: async () => {
          unpins++;
        },
      }),
    },
  };
  const guild = {
    members: { fetch: async () => actor, fetchMe: async () => me },
    channels: { fetch: async () => channel },
  };
  const command = {
    operation: "messages.pin",
    actor_id: owner,
    payload: {
      channel_id: channelId,
      message_id: targetId,
      pinned: true,
      reason: "Pin announcement",
    },
  };
  assert.deepEqual(await executeControl(guild, command), {
    pinned: true,
    message_id: targetId,
  });
  await executeControl(guild, {
    ...command,
    payload: { ...command.payload, pinned: false },
  });
  assert.equal(pins, 1);
  assert.equal(unpins, 1);
  channel.permissionsFor = () => ({ has: () => false });
  await assert.rejects(executeControl(guild, command), /cannot pin/);
  assert.equal(pins, 1);
});
