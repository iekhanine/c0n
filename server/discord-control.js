import { randomUUID } from "node:crypto";
import { encryptWebhook, webhookUrl } from "./content.js";
import { controlInput } from "../shared/discord-control.js";
export const controlMigration = `
CREATE TABLE IF NOT EXISTS con.discord_reaction_roles (
 guild_id text PRIMARY KEY, channel_id text NOT NULL, message_id text NOT NULL,
 mappings jsonb NOT NULL DEFAULT '[]'::jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE con.discord_reaction_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON con.discord_reaction_roles FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS con.discord_commands (
 id uuid PRIMARY KEY, guild_id text NOT NULL, actor_id text NOT NULL, actor_name text NOT NULL,
 operation text NOT NULL, payload jsonb NOT NULL, state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','succeeded','failed','uncertain','expired')),
 result jsonb, error text, created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS con_discord_command_queue ON con.discord_commands(guild_id,state,created_at);
ALTER TABLE con.discord_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON con.discord_commands FROM PUBLIC,anon,authenticated;
`;
const ready = new WeakMap();
export async function ensureControl(db) {
  if (!ready.has(db))
    ready.set(
      db,
      db.query(controlMigration).catch((e) => {
        ready.delete(db);
        throw e;
      }),
    );
  await ready.get(db);
}
const fail = (status, message) => {
  throw Object.assign(Error(message), { status });
};
export async function controlRequest(
  db,
  action,
  method,
  body,
  session,
  guildId,
  query,
) {
  await ensureControl(db);
  await db.query(
    "UPDATE con.discord_commands SET state='expired',error='Worker did not pick up this request. No action was run.',finished_at=now() WHERE state='queued' AND created_at<now()-interval '2 minutes'",
  );
  await db.query(
    "UPDATE con.discord_commands SET state='uncertain',error='Worker did not confirm completion. Check Discord before trying again.',finished_at=now() WHERE state='running' AND started_at<now()-interval '3 minutes'",
  );
  if (action === "control_history" && method === "GET") {
    return {
      items: (
        await db.query(
          "SELECT id,operation,actor_name,state,error,created_at,finished_at,payload->>'reason' AS reason,payload->>'id' AS target_id FROM con.discord_commands WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 100",
          [guildId],
        )
      ).rows,
    };
  }
  if (action === "control_result" && method === "GET") {
    const requestId = query.get("id");
    if (!/^[\da-f-]{36}$/i.test(requestId || ""))
      fail(400, "Invalid request ID.");
    const item = (
      await db.query(
        "SELECT id,operation,state,result,error FROM con.discord_commands WHERE id=$1 AND guild_id=$2",
        [requestId, guildId],
      )
    ).rows[0];
    if (!item) fail(404, "Request not found.");
    return item;
  }
  if (action !== "control_command" || method !== "POST")
    fail(405, "Unsupported command method.");
  if (!guildId) fail(409, "Connect a Discord server first.");
  const payload = controlInput(body.operation, body.payload);
  if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(body.request_id || ""))
    fail(400, "A unique request ID is required.");
  const existing = (
    await db.query(
      "SELECT id,operation,payload,actor_id,guild_id FROM con.discord_commands WHERE id=$1",
      [body.request_id],
    )
  ).rows[0];
  if (existing) {
    if (existing.guild_id !== guildId)
      fail(409, "Request belongs to a different server.");
    if (
      existing.actor_id !== session.user.id ||
      existing.operation !== body.operation ||
      Object.keys(payload).length !== Object.keys(existing.payload).length ||
      Object.entries(payload).some(
        ([k, v]) => JSON.stringify(existing.payload[k]) !== JSON.stringify(v),
      )
    )
      fail(409, "Request ID already used.");
    return { id: existing.id };
  }
  const count = (
    await db.query(
      "SELECT count(*)::int AS n FROM con.discord_commands WHERE guild_id=$1 AND state IN ('queued','running')",
      [guildId],
    )
  ).rows[0].n;
  if (count >= 20)
    fail(
      429,
      "The bot has a full queue. Wait for existing requests to finish.",
    );
  const requestId = body.request_id;
  await db.query(
    "INSERT INTO con.discord_commands(id,guild_id,actor_id,actor_name,operation,payload)VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING",
    [
      requestId,
      guildId,
      session.user.id,
      session.user.name || session.user.id,
      body.operation,
      JSON.stringify(payload),
    ],
  );
  const saved = (
    await db.query(
      "SELECT operation,payload,actor_id,guild_id FROM con.discord_commands WHERE id=$1",
      [requestId],
    )
  ).rows[0];
  if (
    saved.guild_id !== guildId ||
    saved.actor_id !== session.user.id ||
    saved.operation !== body.operation ||
    Object.keys(payload).length !== Object.keys(saved.payload).length ||
    Object.entries(payload).some(
      ([k, v]) => JSON.stringify(saved.payload[k]) !== JSON.stringify(v),
    )
  )
    fail(409, "Request ID already used.");
  return { id: requestId };
}
// Called inside the authenticated bridge transaction. A claimed write is never automatically replayed.
export async function controlSync(client, settings, body) {
  if (body.kind === "control_poll") {
    const item = (
      await client.query(
        `UPDATE con.discord_commands SET state='running',started_at=now() WHERE id=(SELECT id FROM con.discord_commands WHERE guild_id=$1 AND state='queued' AND created_at>now()-interval '2 minutes' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id,operation,payload,actor_id`,
        [settings.guild_id],
      )
    ).rows[0];
    const configured = (await client.query(
      "SELECT guild_id,channel_id,message_id,mappings FROM con.discord_reaction_roles WHERE guild_id=$1",
      [settings.guild_id],
    )).rows[0] || null;
    return { command: item || null, reaction_roles: configured };
  }
  if (
    !/^[\da-f-]{36}$/i.test(body.command_id || "") ||
    !["succeeded", "failed", "uncertain"].includes(body.state)
  )
    fail(400, "Invalid command receipt.");
  const item = (
    await client.query(
      "SELECT state,operation,actor_id,payload,result FROM con.discord_commands WHERE id=$1 AND guild_id=$2 FOR UPDATE",
      [body.command_id, settings.guild_id],
    )
  ).rows[0];
  if (
    item &&
    ["succeeded", "failed"].includes(item.state) &&
    item.state === body.state
  )
    return { ok: true };
  if (!item || !["running", "uncertain"].includes(item.state))
    fail(409, "Command is not awaiting a result.");
  let safeResult = body.result ?? null;
  if (item.operation === "webhooks.connect" && body.state === "succeeded") {
    const receipt = body.result;
    const url = webhookUrl(receipt?.url);
    const parsed = new URL(url);
    if (
      receipt.guild_id !== settings.guild_id ||
      receipt.channel_id !== item.payload.channel_id ||
      !/^\d{17,20}$/.test(receipt.discord_id || "") ||
      !parsed.pathname.includes(`/webhooks/${receipt.discord_id}/`)
    )
      fail(400, "Invalid publishing connection receipt.");
    const saved = await client.query(
      `INSERT INTO con.webhooks(id,name,url_cipher,discord_id,channel_id,guild_id,enabled,created_by)
       VALUES($1,$2,$3,$4,$5,$6,true,$7)
       ON CONFLICT(discord_id) DO UPDATE SET name=$2,url_cipher=$3,enabled=true,updated_at=now()
       RETURNING id,name,channel_id`,
      [
        randomUUID(),
        String(receipt.name).slice(0, 80),
        encryptWebhook(url),
        receipt.discord_id,
        receipt.channel_id,
        settings.guild_id,
        item.actor_id,
      ],
    );
    safeResult = saved.rows[0];
  }
  const result = JSON.stringify(safeResult);
  if (Buffer.byteLength(result) > 400000) fail(413, "Result too large.");
  const error =
    typeof body.error === "string" ? body.error.slice(0, 500) : null;
  await client.query(
    "UPDATE con.discord_commands SET state=$2,result=$3,error=$4,finished_at=now() WHERE id=$1",
    [body.command_id, body.state, result, error],
  );
  // Purge old read results; the audit trail of writes is retained.
  await client.query(
    "DELETE FROM con.discord_commands WHERE created_at<now()-interval '7 days' AND (operation='overview' OR operation LIKE '%.list')",
  );
  return { ok: true };
}
