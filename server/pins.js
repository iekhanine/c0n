import { randomUUID } from "node:crypto";
import { ORIGIN } from "./auth.js";
import { AppError, id } from "./content.js";
import { hasPermission, contentPrefix } from "../shared/permissions.js";
import { controlRequest, ensureControl } from "./discord-control.js";
export async function pinRequest(db, req, staff) {
  const query = new URL(req.url, ORIGIN).searchParams;
  if (req.method === "GET") {
    await ensureControl(db);
    const { rows } = await db.query(
      "SELECT state,result,error FROM con.discord_commands WHERE id=$1 AND actor_id=$2 AND operation='messages.pin'",
      [id(query.get("id")), staff.user.id],
    );
    if (!rows[0]) throw new AppError(404, "Pin request not found.");
    return rows[0];
  }
  const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  if (!b || typeof b.pinned !== "boolean")
    throw new AppError(400, "Choose pin or unpin.");
  const { rows } = await db.query(
    `SELECT d.message_id,w.channel_id,w.guild_id,p.kind,w.id AS webhook_id FROM con.deliveries d JOIN con.posts p ON p.id=d.post_id JOIN con.webhooks w ON w.id=d.webhook_id WHERE d.id=$1 AND d.state='sent'`,
    [id(b.delivery_id)],
  );
  const d = rows[0];
  if (!d?.message_id)
    throw new AppError(409, "Publish the message to Discord first.");
  if (
    !hasPermission(staff, `${contentPrefix(d.kind)}.publish`) ||
    (!staff.owner &&
      !staff.all_channels &&
      !(staff.channel_ids || []).includes(d.webhook_id))
  )
    throw new AppError(403, "You cannot manage this destination.");
  const guildId =
    d.guild_id ||
    (await db.query("SELECT guild_id FROM con.discord_settings WHERE id=true"))
      .rows[0]?.guild_id;
  return controlRequest(
    db,
    "control_command",
    "POST",
    {
      request_id: randomUUID(),
      operation: "messages.pin",
      payload: {
        channel_id: d.channel_id,
        message_id: d.message_id,
        pinned: b.pinned,
        reason: b.pinned ? "Pin transmission" : "Unpin transmission",
      },
    },
    staff,
    guildId,
    query,
  );
}
