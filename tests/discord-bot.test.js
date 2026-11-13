import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  discordBotHandler,
  encryptWorkerKey,
  decryptWorkerKey,
  botSettingsInput,
} from "../server/discord-bot.js";
import { signBridge, verifyBridge } from "../shared/discord-signing.js";
import { seal, ORIGIN } from "../server/auth.js";
import { activityRecord, publicChannels } from "../bot/protocol.js";
const owner = "267489014922215434",
  member = "123456789012345678",
  guild = "345678901234567890",
  channel = "456789012345678901",
  privateChannel = "567890123456789012",
  bot = "678901234567890123";
process.env.SESSION_SECRET = "discord-tests-only-session-secret-at-least-32";
process.env.WEBHOOK_ENCRYPTION_KEY =
  "discord-tests-only-encryption-key-at-least-32";
process.env.DISCORD_ADMIN_IDS = owner;
const res = () => ({
  setHeader() {},
  end(b) {
    this.body = JSON.parse(b);
  },
});
test("worker signatures authenticate canonical payloads, timestamps and encrypted keys", () => {
  const key = "a-worker-test-key-with-sufficient-entropy",
    time = String(Date.now()),
    nonce = randomUUID(),
    body = { kind: "bootstrap", nested: { z: 1, a: 2 } };
  const signature = signBridge(key, time, nonce, body),
    headers = {
      "x-con-timestamp": time,
      "x-con-nonce": nonce,
      "x-con-signature": signature,
    };
  assert.equal(
    verifyBridge(key, headers, { nested: { a: 2, z: 1 }, kind: "bootstrap" }),
    true,
  );
  assert.equal(
    verifyBridge(key, headers, { ...body, kind: "heartbeat" }),
    false,
  );
  assert.equal(verifyBridge(key, headers, body, Number(time) + 300001), false);
  assert.equal(
    verifyBridge(
      key,
      { ...headers, "x-con-signature": "not-a-signature" },
      body,
    ),
    false,
  );
  const cipher = encryptWorkerKey(key);
  assert.equal(cipher.includes(key), false);
  assert.equal(decryptWorkerKey(cipher), key);
  assert.throws(() => decryptWorkerKey(cipher + "changed"));
  assert.throws(() =>
    botSettingsInput({
      guild_id: "wrong",
      channel_ids: [],
      publish_members: true,
    }),
  );
});
test("worker forwards only metadata from explicitly selected public channels", () => {
  const message = {
    id: "789012345678901234",
    guildId: guild,
    channelId: channel,
    channel: { isThread: () => false },
    author: { id: member, bot: false },
    createdTimestamp: Date.now(),
    content: "Do not export me",
  };
  assert.deepEqual(
    Object.keys(activityRecord(message, [channel], [channel], guild)),
    ["id", "channel_id", "user_id", "at"],
  );
  assert.equal(activityRecord(message, [], [channel], guild), null);
  assert.equal(activityRecord(message, [channel], [], guild), null);
  assert.equal(
    activityRecord(
      { ...message, author: { id: bot, bot: true } },
      [channel],
      [channel],
      guild,
    ),
    null,
  );
});
test("owner config, replay protection, channel filtering and membership synchronization", async (t) => {
  const pg = new PGlite();
  await pg.exec("CREATE ROLE anon;CREATE ROLE authenticated;");
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
      return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 };
    },
    async connect() {
      return { ...this, release() {} };
    },
  };
  async function call(user, action, method = "GET", body = {}, headers = {}) {
    const r = res();
    await discordBotHandler(
      {
        method,
        url: "/api/discord-bot?action=" + action,
        headers: {
          origin: ORIGIN,
          ...(user
            ? {
                cookie: `__Host-con_session=${await seal({ user: { id: user, name: "Owner" } }, 60)}`,
              }
            : {}),
          ...headers,
        },
        body,
      },
      r,
      () => db,
      async (session) => ({ owner: session.user.id === owner }),
    );
    return r;
  }
  let key;
  async function sync(body, customHeaders) {
    const time = String(Date.now()),
      nonce = randomUUID(),
      headers = customHeaders || {
        "x-con-timestamp": time,
        "x-con-nonce": nonce,
        "x-con-signature": signBridge(key, time, nonce, body),
      };
    return call(null, "sync", "POST", body, headers);
  }
  try {
    await t.test(
      "public starts disconnected and nonowners cannot initialize bot settings",
      async () => {
        assert.equal((await call(null, "public")).body.configured, false);
        assert.equal(
          (
            await call(member, "settings", "PUT", {
              guild_id: guild,
              channel_ids: [],
              publish_members: true,
            })
          ).statusCode,
          403,
        );
      },
    );
    await t.test(
      "owner saves private storage and key is returned only on rotation",
      async () => {
        assert.equal(
          (
            await call(owner, "settings", "PUT", {
              guild_id: guild,
              channel_ids: [channel, privateChannel],
              publish_members: true,
            })
          ).statusCode,
          200,
        );
        const k = await call(owner, "key", "POST");
        key = k.body.key;
        assert.equal(typeof key, "string");
        const status = await call(owner, "status");
        assert.equal(status.body.key_configured, true);
        assert.equal(JSON.stringify(status.body).includes(key), false);
        assert.equal((await call(null, "status")).statusCode, 401);
      },
    );
    await t.test(
      "unsigned requests, replayed nonces and other guilds are rejected",
      async () => {
        assert.equal(
          (await call(null, "sync", "POST", { kind: "bootstrap" })).statusCode,
          401,
        );
        const body = { kind: "bootstrap" },
          time = String(Date.now()),
          nonce = randomUUID(),
          headers = {
            "x-con-timestamp": time,
            "x-con-nonce": nonce,
            "x-con-signature": signBridge(key, time, nonce, body),
          };
        assert.equal((await sync(body, headers)).statusCode, 200);
        assert.equal((await sync(body, headers)).statusCode, 409);
        assert.equal(
          (await sync({ kind: "heartbeat", guild_id: privateChannel }))
            .statusCode,
          403,
        );
      },
    );
    await t.test(
      "real member sync and duplicate message events produce accurate channel counts",
      async () => {
        assert.equal(
          (
            await sync({
              kind: "heartbeat",
              guild_id: guild,
              bot_id: bot,
              bot_name: "C0N",
              member_count: 2,
              channels: [{ id: channel, name: "general" }],
            })
          ).statusCode,
          200,
        );
        await sync({
          kind: "snapshot_begin",
          guild_id: guild,
          snapshot_id: "snapshot-1234567890",
        });
        await sync({
          kind: "members",
          guild_id: guild,
          members: [
            {
              id: member,
              name: "Real member",
              avatar: null,
              joined_at: new Date().toISOString(),
              bot: false,
            },
          ],
        });
        await sync({
          kind: "snapshot_end",
          guild_id: guild,
          snapshot_id: "snapshot-1234567890",
        });
        const event = {
          id: "789012345678901234",
          channel_id: channel,
          user_id: member,
          at: new Date().toISOString(),
          content: "Never stored",
        };
        for (let i = 0; i < 2; i++)
          assert.equal(
            (
              await sync({
                kind: "messages",
                guild_id: guild,
                messages: [
                  event,
                  {
                    ...event,
                    id: "789012345678901235",
                    channel_id: privateChannel,
                  },
                ],
              })
            ).statusCode,
            200,
          );
        const p = (await call(null, "public")).body;
        assert.equal(p.connected, true);
        assert.equal(p.member_count, 2);
        assert.equal(p.channels.length, 1);
        assert.equal(p.channels[0].messages, 1);
        assert.equal(p.builders[0].name, "Real member");
        assert.equal(p.members[0].name, "Real member");
        assert.equal(JSON.stringify(p).includes("Never stored"), false);
        assert.equal(
          (await db.query("SELECT count(*)::int AS n FROM con.staff_users"))
            .rows[0].n,
          0,
        );
      },
    );
    await t.test(
      "member departure and privacy controls remove identities from public panels",
      async () => {
        await sync({ kind: "member_remove", guild_id: guild, user_id: member });
        assert.equal((await call(null, "public")).body.members.length, 0);
        await call(owner, "settings", "PUT", {
          guild_id: guild,
          channel_ids: [],
          publish_members: false,
        });
        const p = (await call(null, "public")).body;
        assert.deepEqual(p.channels, []);
        assert.deepEqual(p.builders, []);
        assert.deepEqual(p.members, []);
      },
    );
    await t.test(
      "key rotation rejects the old worker and storage is denied to browser database roles",
      async () => {
        await call(owner, "key", "POST");
        assert.equal((await sync({ kind: "bootstrap" })).statusCode, 401);
        for (const table of [
          "discord_settings",
          "discord_members",
          "discord_events",
          "discord_receipts",
        ])
          assert.equal(
            (
              await pg.query(
                `SELECT has_table_privilege('anon','con.${table}','SELECT') AS allowed`,
              )
            ).rows[0].allowed,
            false,
          );
      },
    );
  } finally {
    await pg.close();
  }
});

test("role-gated community channels are available for explicit activity tracking, staff areas are excluded", () => {
  const list = [
    { id: "111", name: "ɢᴀᴍᴇ-ʟᴏʙʙʏ", type: 0, parentId: "501", viewable: true },
    { id: "112", name: "ᴡʜᴀᴛ-ᴀʀᴇ-ʏᴏᴜ-ʙᴜɪʟᴅɪɴɢ", type: 0, parentId: "502", viewable: true },
    { id: "113", name: "staff", type: 0, parentId: "503", viewable: true },
    { id: "114", name: "ꜰɪʀꜱᴛ-ᴄᴏɴᴛᴀᴄᴛ", type: 0, parentId: "504", viewable: true },
    { id: "115", name: "secret", type: 0, parentId: "505", viewable: false },
    { id: "501", name: "[ ᴛʜᴇ ɢᴀᴍᴇꜱ ]", type: 4 },
    { id: "502", name: "[ ᴛʜᴇ ᴡᴏʀᴋꜱʜᴏᴘ ]", type: 4 },
    { id: "503", name: "[ ᴀᴅᴍɪɴɪꜱᴛʀᴀᴛɪᴏɴ ]", type: 4 },
    { id: "504", name: "[ ꜱᴛᴀʀᴛ ʜᴇʀᴇ ]", type: 4 },
    { id: "505", name: "[ ᴛʜᴇ ɢᴀʟʟᴇʀʏ ]", type: 4 },
  ];
  const guild = { channels: { cache: new Map(list.map(item => [item.id, item])) } };
  assert.deepEqual(publicChannels(guild).map(c => c.id), ["111","112"]);
  const message = {
    id: "789012345678901234",
    guildId: guild,
    channelId: "111",
    channel: { isThread: () => false },
    author: { id: member, bot: false },
    createdTimestamp: Date.now(),
  };
  // No @everyone check is necessary once the channel was explicitly selected.
  assert.equal(activityRecord({ ...message, guildId: "345678901234567890" },
    ["111"], ["111","112"], "345678901234567890")?.channel_id, "111");
});

test("approved gaming channels can count third-party bot messages without counting staff bots or C0N itself", () => {
  const base = {
    id: "789012345678901234", guildId: guild, channelId: channel,
    channel: { isThread: () => false, parent: { name: "[ ᴛʜᴇ ɢᴀᴍᴇꜱ ]" } },
    client: { user: { id: bot } },
    author: { id: "123456789012345679", bot: true },
    createdTimestamp: Date.now(),
    webhookId: null,
  };
  assert.equal(activityRecord(base, [channel], [channel], guild)?.channel_id, channel);
  assert.equal(activityRecord({ ...base, author: { id: bot, bot: true } }, [channel], [channel], guild), null);
  assert.equal(activityRecord({ ...base, channel: { ...base.channel, parent: { name: "[ ᴀᴅᴍɪɴɪꜱᴛʀᴀᴛɪᴏɴ ]" } } }, [channel], [channel], guild), null);
  assert.equal(activityRecord({ ...base, webhookId: "234567890123456789" }, [channel], [channel], guild), null);
  assert.equal(activityRecord(base, [], [channel], guild), null);
});
