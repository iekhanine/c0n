import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  hkdfSync,
} from "node:crypto";
import { ORIGIN, json, readSession, accessFor } from "./auth.js";
import { database, initializeDatabase } from "./db.js";
import { discordMigration } from "./discord-schema.js";
import { verifyBridge, canonicalJson } from "../shared/discord-signing.js";
import {
  ensureControl,
  controlRequest,
  controlSync,
} from "./discord-control.js";
const fail = (status, message) => {
  throw Object.assign(Error(message), { status });
};
const participationReady = new WeakMap();
async function ensureParticipation(db) {
  if (!participationReady.has(db))
    participationReady.set(db, db.query(`
      CREATE TABLE IF NOT EXISTS con.discord_participation_events (
       guild_id text NOT NULL, event_id text NOT NULL,
       event_type text NOT NULL CHECK(event_type IN ('message','reaction')),
       channel_id text NOT NULL, user_id text NOT NULL,
       occurred_at timestamptz NOT NULL,
       PRIMARY KEY(guild_id,event_type,event_id,user_id)
      );
      CREATE INDEX IF NOT EXISTS con_participation_user_time
       ON con.discord_participation_events(guild_id,user_id,occurred_at);
      ALTER TABLE con.discord_participation_events ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON con.discord_participation_events FROM PUBLIC,anon,authenticated;
    `).catch(e => { participationReady.delete(db); throw e; }));
  await participationReady.get(db);
}
const snowflake = (s) => typeof s === "string" && /^\d{17,20}$/.test(s);
const encryptionKey = () => {
  if ((process.env.WEBHOOK_ENCRYPTION_KEY || "").length < 32)
    fail(503, "Encryption is not configured.");
  return hkdfSync(
    "sha256",
    process.env.WEBHOOK_ENCRYPTION_KEY,
    "con-storage",
    "discord-worker-v1",
    32,
  );
};
export function encryptWorkerKey(secret) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv),
    data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((v) => v.toString("base64url"))
    .join(".");
}
export function decryptWorkerKey(value) {
  const [iv, tag, data] = value
    .split(".")
    .map((v) => Buffer.from(v, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
export function botSettingsInput(b) {
  if (
    !snowflake(b.guild_id) ||
    !Array.isArray(b.channel_ids) ||
    b.channel_ids.length > 100 ||
    !b.channel_ids.every(snowflake) ||
    typeof b.publish_members !== "boolean"
  )
    fail(400, "Enter a valid server ID and channel selection.");
  return {
    guild_id: b.guild_id,
    channel_ids: [...new Set(b.channel_ids)],
    publish_members: b.publish_members,
  };
}
const avatar = (v) =>
  typeof v === "string" && /^(a_)?[\da-f]{32}$/.test(v) ? v : null;
const cleanName = (v) =>
  typeof v === "string" && v.trim() && v.length <= 100 ? v.trim() : null;
const date = (v) => {
  const n = Date.parse(v);
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
};
async function settings(db) {
  try {
    return (
      (await db.query("SELECT * FROM con.discord_settings WHERE id=true"))
        .rows[0] || null
    );
  } catch (e) {
    if (e.code === "42P01") return null;
    throw e;
  }
}
function safeSettings(s) {
  return s
    ? {
        guild_id: s.guild_id,
        channel_ids: s.channel_ids,
        publish_members: s.publish_members,
        channels: s.channels,
        last_heartbeat: s.last_heartbeat,
        member_count: s.member_count,
        bot_id: s.bot_id,
        bot_name: s.bot_name,
        key_configured: Boolean(s.key_cipher),
      }
    : {
        guild_id: "",
        channel_ids: [],
        publish_members: true,
        channels: [],
        last_heartbeat: null,
        member_count: 0,
        bot_id: null,
        bot_name: null,
        key_configured: false,
      };
}
export async function publicDiscord(db) {
  const s = await settings(db);
  if (!s)
    return {
      connected: false,
      configured: false,
      members: [],
      channels: [],
      activity: [],
      builders: [],
    };
  const live =
    s.last_heartbeat && Date.now() - Date.parse(s.last_heartbeat) < 180000;
  const ids = s.channel_ids.filter((id) => s.channels.some((c) => c.id === id));
  const channels = ids.length
    ? (
        await db.query(
          `SELECT channel_id,count(*)::int AS messages FROM con.discord_events WHERE guild_id=$1 AND channel_id=ANY($2::text[]) AND occurred_at>now()-interval '7 days' GROUP BY channel_id ORDER BY messages DESC LIMIT 5`,
          [s.guild_id, ids],
        )
      ).rows.map((c) => ({
        ...c,
        name: s.channels.find((v) => v.id === c.channel_id)?.name || "channel",
      }))
    : [];
  const members = s.publish_members
    ? (
        await db.query(
          "SELECT discord_id,name,avatar,joined_at FROM con.discord_members WHERE guild_id=$1 AND active=true AND is_bot=false ORDER BY joined_at DESC NULLS LAST LIMIT 6",
          [s.guild_id],
        )
      ).rows
    : [];
  const activity = ids.length
    ? (
        await db.query(
          "SELECT channel_id,max(occurred_at) AS occurred_at FROM con.discord_events WHERE guild_id=$1 AND channel_id=ANY($2::text[]) AND occurred_at>now()-interval '7 days' GROUP BY channel_id ORDER BY occurred_at DESC LIMIT 6",
          [s.guild_id, ids],
        )
      ).rows.map((c) => ({
        ...c,
        name: s.channels.find((v) => v.id === c.channel_id)?.name || "channel",
      }))
    : [];
  const builders =
    s.publish_members && ids.length
      ? (
          await db.query(
            `SELECT m.discord_id,m.name,m.avatar,count(*)::int AS messages FROM con.discord_events e JOIN con.discord_members m ON m.guild_id=e.guild_id AND m.discord_id=e.user_id WHERE e.guild_id=$1 AND e.channel_id=ANY($2::text[]) AND e.occurred_at>now()-interval '7 days' AND m.active=true AND m.is_bot=false GROUP BY m.discord_id,m.name,m.avatar ORDER BY messages DESC LIMIT 5`,
            [s.guild_id, ids],
          )
        ).rows
      : [];
  return {
    connected: Boolean(live),
    configured: true,
    member_count: s.member_count,
    last_heartbeat: s.last_heartbeat,
    members,
    channels,
    activity,
    builders,
  };
}
async function acceptSync(db, s, b, headers) {
  if (
    !s?.key_cipher ||
    !verifyBridge(decryptWorkerKey(s.key_cipher), headers, b)
  )
    fail(401, "Invalid worker signature.");
  if (
    !b ||
    ![
      "control_poll",
      "control_result",
      "bootstrap",
      "heartbeat",
      "members",
      "member_remove",
      "snapshot_begin",
      "snapshot_end",
      "messages",
      "participation",
      "participation_check",
    ].includes(b.kind)
  )
    fail(400, "Unknown worker event.");
  if (b.kind !== "bootstrap" && b.guild_id !== s.guild_id)
    fail(403, "Wrong Discord server.");
  if (b.kind.startsWith("control_")) await ensureControl(db);
  if (b.kind.startsWith("participation")) await ensureParticipation(db);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    s = (
      await client.query(
        "SELECT * FROM con.discord_settings WHERE id=true FOR UPDATE",
      )
    ).rows[0];
    if (
      !s?.key_cipher ||
      !verifyBridge(decryptWorkerKey(s.key_cipher), headers, b)
    )
      fail(401, "Worker key changed.");
    if (b.kind !== "bootstrap" && b.guild_id !== s.guild_id)
      fail(403, "Wrong Discord server.");
    const receipt = await client.query(
      "INSERT INTO con.discord_receipts(nonce)VALUES($1) ON CONFLICT DO NOTHING RETURNING nonce",
      [headers["x-con-nonce"]],
    );
    if (!receipt.rowCount) fail(409, "Worker request already received.");
    if (b.kind.startsWith("control_")) {
      const result = await controlSync(client, s, b);
      await client.query("COMMIT");
      return { ...result, guild_id: s.guild_id };
    }
    let progress = [];
    if (b.kind === "participation" || b.kind === "participation_check") {
      const userIds = new Set();
      if (b.kind === "participation") {
        if (!Array.isArray(b.events) || b.events.length > 100)
          fail(400, "Invalid participation batch.");
        for (const event of b.events) {
          if (!["message", "reaction"].includes(event.type) ||
              !snowflake(event.user_id) || !snowflake(event.channel_id) ||
              typeof event.event_id !== "string" || !/^[\\w:-]{17,150}$/.test(event.event_id) ||
              !date(event.at) ||
              Math.abs(Date.now() - Date.parse(event.at)) > 172800000)
            fail(400, "Invalid participation event.");
          await client.query(
            `INSERT INTO con.discord_participation_events
             (guild_id,event_id,event_type,channel_id,user_id,occurred_at)
             VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
            [s.guild_id,event.event_id,event.type,event.channel_id,event.user_id,event.at],
          );
          userIds.add(event.user_id);
        }
      } else {
        // Periodically promote members who become 14 days old even without new activity.
        const eligible = await client.query(
          `SELECT e.user_id FROM con.discord_participation_events e
           JOIN con.discord_members m ON m.guild_id=e.guild_id AND m.discord_id=e.user_id
           WHERE e.guild_id=$1 AND m.active=true AND m.is_bot=false
            AND m.joined_at <= now()-interval '14 days'
           GROUP BY e.user_id
           HAVING count(*) FILTER (WHERE e.event_type='message') >= 30
             AND count(DISTINCT (e.occurred_at AT TIME ZONE 'UTC')::date) >= 5
           LIMIT 100`,
          [s.guild_id],
        );
        for (const row of eligible.rows) userIds.add(row.user_id);
      }
      for (const userId of userIds) {
        const result = await client.query(
          `SELECT
             count(e.event_id)::int > 0 AS participated,
             count(e.event_id) FILTER (WHERE e.event_type='message')::int AS messages,
             count(DISTINCT (e.occurred_at AT TIME ZONE 'UTC')::date)::int AS active_days,
             m.joined_at <= now()-interval '14 days' AS mature
           FROM con.discord_members m
           LEFT JOIN con.discord_participation_events e
             ON e.guild_id=m.guild_id AND e.user_id=m.discord_id
           WHERE m.guild_id=$1 AND m.discord_id=$2 AND m.active=true AND m.is_bot=false
           GROUP BY m.joined_at`,
          [s.guild_id, userId],
        );
        const row = result.rows[0];
        if (row) progress.push({
          user_id: userId, participated: row.participated,
          eligible_instigator: row.mature && row.messages >= 30 && row.active_days >= 5,
        });
      }
    }
    if (b.kind === "heartbeat") {
      if (
        !snowflake(b.bot_id) ||
        !cleanName(b.bot_name) ||
        !Number.isInteger(b.member_count) ||
        b.member_count < 0 ||
        b.member_count > 1000000 ||
        !Array.isArray(b.channels) ||
        b.channels.length > 1000
      )
        fail(400, "Invalid heartbeat.");
      const channels = b.channels.map((c) => {
        if (!snowflake(c.id) || !cleanName(c.name))
          fail(400, "Invalid channel metadata.");
        return { id: c.id, name: c.name };
      });
      await client.query(
        "UPDATE con.discord_settings SET last_heartbeat=now(),member_count=$1,bot_id=$2,bot_name=$3,channels=$4 WHERE id=true",
        [b.member_count, b.bot_id, b.bot_name, JSON.stringify(channels)],
      );
    }
    if (b.kind === "snapshot_begin") {
      if (
        typeof b.snapshot_id !== "string" ||
        !/^[-\w]{16,80}$/.test(b.snapshot_id)
      )
        fail(400, "Invalid snapshot.");
      await client.query(
        "UPDATE con.discord_settings SET snapshot_id=$1 WHERE id=true",
        [b.snapshot_id],
      );
    }
    if (b.kind === "members") {
      if (!Array.isArray(b.members) || b.members.length > 100)
        fail(400, "Too many members.");
      for (const m of b.members) {
        if (
          !snowflake(m.id) ||
          !cleanName(m.name) ||
          typeof m.bot !== "boolean" ||
          (m.joined_at && !date(m.joined_at))
        )
          fail(400, "Invalid member.");
        await client.query(
          `INSERT INTO con.discord_members(guild_id,discord_id,name,avatar,joined_at,is_bot,active,snapshot_id)VALUES($1,$2,$3,$4,$5,$6,true,(SELECT snapshot_id FROM con.discord_settings WHERE id=true)) ON CONFLICT(guild_id,discord_id) DO UPDATE SET name=$3,avatar=$4,joined_at=$5,is_bot=$6,active=true,snapshot_id=(SELECT snapshot_id FROM con.discord_settings WHERE id=true)`,
          [
            s.guild_id,
            m.id,
            cleanName(m.name),
            avatar(m.avatar),
            m.joined_at || null,
            m.bot,
          ],
        );
      }
    }
    if (b.kind === "snapshot_end") {
      const current = (
        await client.query(
          "SELECT snapshot_id FROM con.discord_settings WHERE id=true",
        )
      ).rows[0].snapshot_id;
      if (current !== b.snapshot_id) fail(409, "Snapshot changed.");
      await client.query(
        "UPDATE con.discord_members SET active=false WHERE guild_id=$1 AND snapshot_id IS DISTINCT FROM $2",
        [s.guild_id, b.snapshot_id],
      );
    }
    if (b.kind === "member_remove") {
      if (!snowflake(b.user_id)) fail(400, "Invalid member.");
      await client.query(
        "UPDATE con.discord_members SET active=false WHERE guild_id=$1 AND discord_id=$2",
        [s.guild_id, b.user_id],
      );
    }
    if (b.kind === "messages") {
      if (!Array.isArray(b.messages) || b.messages.length > 100)
        fail(400, "Too many events.");
      const allowed = s.channel_ids.filter((id) =>
        s.channels.some((c) => c.id === id),
      );
      for (const m of b.messages) {
        if (
          !snowflake(m.id) ||
          !snowflake(m.channel_id) ||
          !snowflake(m.user_id) ||
          !date(m.at) ||
          Math.abs(Date.now() - Date.parse(m.at)) > 172800000
        )
          fail(400, "Invalid activity event.");
        if (!allowed.includes(m.channel_id)) continue;
        await client.query(
          "INSERT INTO con.discord_events(guild_id,event_id,channel_id,user_id,occurred_at)VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
          [s.guild_id, m.id, m.channel_id, m.user_id, m.at],
        );
      }
    }
    await client.query(
      "DELETE FROM con.discord_receipts WHERE created_at<now()-interval '1 day'",
    );
    await client.query(
      "DELETE FROM con.discord_events WHERE occurred_at<now()-interval '30 days'",
    );
    await client.query("COMMIT");
    return { ok: true, guild_id: s.guild_id, channel_ids: s.channel_ids, ...(progress.length ? { progress } : {}) };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function discordBotHandler(
  req,
  res,
  dbFactory = database,
  accessLookup = accessFor,
) {
  try {
    const action =
      new URL(req.url, ORIGIN).searchParams.get("action") || "status";
    const b =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (
      Buffer.byteLength(canonicalJson(b) || "") >
      (action === "sync" && b?.kind === "control_result" ? 512000 : 65536)
    )
      fail(413, "Request too large.");
    if (action === "public" && req.method === "GET")
      return json(res, 200, await publicDiscord(dbFactory()));
    if (action === "sync" && req.method === "POST") {
      const db = dbFactory();
      return json(
        res,
        200,
        await acceptSync(db, await settings(db), b, req.headers),
      );
    }
    const session = await readSession(req);
    if (!session) fail(401, "Sign in required.");
    if (!(await accessLookup(session)).owner)
      fail(403, "Only the site owner can configure the bot.");
    if (req.method !== "GET" && req.headers.origin !== ORIGIN)
      fail(403, "Invalid origin.");
    const db = dbFactory();
    if (action.startsWith("control_")) {
      const s = await settings(db);
      return json(
        res,
        200,
        await controlRequest(
          db,
          action,
          req.method,
          b,
          session,
          s?.guild_id,
          new URL(req.url, ORIGIN).searchParams,
        ),
      );
    }
    if (action === "reaction_roles" && ["GET", "PUT"].includes(req.method)) {
      const current = await settings(db);
      if (!current?.guild_id) fail(409, "Connect a Discord server first.");
      await ensureControl(db);
      if (req.method === "GET") {
        const result = await db.query(
          "SELECT guild_id,channel_id,message_id,mappings FROM con.discord_reaction_roles WHERE guild_id=$1",
          [current.guild_id],
        );
        return json(res, 200, result.rows[0] || {
          guild_id: current.guild_id, channel_id: "", message_id: "1570527636030103675", mappings: [],
        });
      }
      if (!snowflake(b.channel_id) || !snowflake(b.message_id) ||
          !Array.isArray(b.mappings) || b.mappings.length > 30)
        fail(400, "Select a channel, message and up to 30 emoji mappings.");
      const emojis = new Set(), roles = new Set();
      const mappings = b.mappings.map((entry) => {
        const emoji = typeof entry.emoji === "string" ? entry.emoji.trim() : "";
        if (!emoji || emoji.length > 80 || !snowflake(entry.role_id) ||
            emojis.has(emoji) || roles.has(entry.role_id))
          fail(400, "Mappings require unique emojis and access roles.");
        emojis.add(emoji);
        roles.add(entry.role_id);
        return { emoji, role_id: entry.role_id };
      });
      await db.query(
        `INSERT INTO con.discord_reaction_roles(guild_id,channel_id,message_id,mappings)
         VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(guild_id) DO UPDATE SET
         channel_id=$2,message_id=$3,mappings=$4::jsonb,updated_at=now()`,
        [current.guild_id, b.channel_id, b.message_id, JSON.stringify(mappings)],
      );
      return json(res, 200, { ok: true });
    }
    if (action === "status" && req.method === "GET")
      return json(res, 200, {
        ...safeSettings(await settings(db)),
        application_id: process.env.DISCORD_CLIENT_ID || "1570103248453509281",
      });
    if (action === "settings" && req.method === "PUT") {
      const input = botSettingsInput(b);
      await initializeDatabase(db);
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query(discordMigration);
        await client.query(
          `INSERT INTO con.discord_settings(id,guild_id,channel_ids,publish_members)VALUES(true,$1,$2,$3) ON CONFLICT(id) DO UPDATE SET guild_id=$1,channel_ids=$2,publish_members=$3,last_heartbeat=CASE WHEN con.discord_settings.guild_id=$1 THEN con.discord_settings.last_heartbeat ELSE NULL END,channels=CASE WHEN con.discord_settings.guild_id=$1 THEN con.discord_settings.channels ELSE '[]'::jsonb END,updated_at=now()`,
          [
            input.guild_id,
            JSON.stringify(input.channel_ids),
            input.publish_members,
          ],
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      return json(res, 200, { ok: true });
    }
    if (action === "key" && req.method === "POST") {
      const s = await settings(db);
      if (!s) fail(409, "Save the Discord server ID first.");
      const key = randomBytes(32).toString("base64url");
      await db.query(
        "UPDATE con.discord_settings SET key_cipher=$1 WHERE id=true",
        [encryptWorkerKey(key)],
      );
      return json(res, 200, { key });
    }
    fail(405, "Unsupported bot action.");
  } catch (e) {
    if (!e.status)
      console.error("Discord bridge operation failed", {
        code: e.code || "application",
      });
    return json(res, e.status || 503, {
      error: e.status
        ? e.message
        : "Discord connection is temporarily unavailable.",
    });
  }
}
