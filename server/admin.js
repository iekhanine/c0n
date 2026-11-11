import { randomUUID } from "node:crypto";
import { ORIGIN, json, requireStaff } from "./auth.js";
import { database, databaseStatus, initializeDatabase } from "./db.js";
import { canAccess, listStaff, saveStaff } from "./staff.js";
import {
  AppError,
  id,
  webhookInput,
  postInput,
  encryptWebhook,
  decryptWebhook,
  discordPayload,
  deliveryAction,
  discordRequest,
} from "./content.js";

const safeWebhookColumns =
  "id, name, discord_id, channel_id, guild_id, enabled, created_at, updated_at";
function bodyOf(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      throw new AppError(400, "Invalid JSON.");
    }
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    JSON.stringify(body).length > 24000
  )
    throw new AppError(400, "Invalid or oversized request.");
  return body;
}
function expectMethod(req, method) {
  if (req.method !== method)
    throw new AppError(405, `Use ${method} for this operation.`);
}
async function findWebhook(db, webhookId) {
  const { rows } = await db.query("SELECT * FROM con.webhooks WHERE id=$1", [
    id(webhookId),
  ]);
  if (!rows[0]) throw new AppError(404, "Channel connection not found.");
  return rows[0];
}
async function findPost(db, postId) {
  const { rows } = await db.query("SELECT * FROM con.posts WHERE id=$1", [
    id(postId),
  ]);
  if (!rows[0]) throw new AppError(404, "Post not found.");
  return rows[0];
}

// HEADER 001: Every admin request checks staff access; mutations check Origin.
export async function adminHandler(req, res) {
  try {
    const action =
      new URL(req.url, ORIGIN).searchParams.get("action") || "status";
    if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method))
      throw new AppError(405, "Method not allowed.");
    if (req.method !== "GET" && req.headers.origin !== ORIGIN)
      throw new AppError(403, "Invalid request origin.");
    const staff = await requireStaff(
      req,
      res,
      ["setup", "webhooks"].includes(action) && req.method !== "GET",
    );
    if (!staff) return;
    if (!canAccess(staff.access, action, req.method))
      throw new AppError(
        403,
        "Your access level does not permit this operation.",
      );
    const db = database();
    if (action === "status") {
      expectMethod(req, "GET");
      return json(res, 200, await databaseStatus());
    }
    if (action === "setup") {
      expectMethod(req, "POST");
      return json(res, 200, await initializeDatabase());
    }
    if (action === "webhooks") return await webhooks(req, res, db, staff);
    if (action === "posts") return await posts(req, res, db, staff);
    if (action === "staff") {
      if (req.method === "GET")
        return json(res, 200, { staff: await listStaff(db) });
      expectMethod(req, "POST");
      return json(res, 200, await saveStaff(staff.user.id, bodyOf(req), db));
    }
    if (action === "reports") {
      expectMethod(req, "GET");
      return json(res, 200, await reports(db));
    }
    if (action === "publish") {
      expectMethod(req, "POST");
      return json(res, 200, await publish(db, bodyOf(req)));
    }
    if (action === "reconcile") {
      expectMethod(req, "POST");
      return json(res, 200, await reconcile(db, bodyOf(req)));
    }
    throw new AppError(404, "Unknown operation.");
  } catch (error) {
    // Error objects can contain SQL parameters/connection details: do not log them.
    console.error("CoN admin operation failed", {
      code: error.code || "application",
      status: error.status || 500,
    });
    const messages = {
      "28P01": "Database login failed. Check the password in DATABASE_URL.",
      "42P01": "CoN tables have not been initialized yet. Open database setup.",
      42501: "The database account lacks permission for CoN storage.",
      23505: "This webhook is already connected.",
      CERT_HAS_EXPIRED: "Database certificate verification failed.",
      SELF_SIGNED_CERT_IN_CHAIN:
        "Database needs its CA certificate. Add DATABASE_CA_CERT in Vercel.",
      UNABLE_TO_VERIFY_LEAF_SIGNATURE:
        "Database needs its CA certificate. Add DATABASE_CA_CERT in Vercel.",
    };
    const status = error.status || (error.code === "23505" ? 409 : 503);
    return json(res, status, {
      error:
        error instanceof AppError || error.status
          ? error.message
          : messages[error.code] ||
            "Database or publishing service unavailable. Check configuration and try again.",
    });
  }
}

// HEADER 006: Read-only report data excludes drafts, webhook URLs and tokens.
export async function reports(db) {
  const [summary, deliveries] = await Promise.all([
    db.query(
      `SELECT (SELECT count(*)::integer FROM con.posts WHERE published_at IS NOT NULL) AS website_posts,(SELECT count(*)::integer FROM con.webhooks WHERE enabled) AS active_channels,(SELECT count(*)::integer FROM con.deliveries WHERE state='sent') AS delivered,(SELECT count(*)::integer FROM con.deliveries WHERE state IN ('failed','uncertain','sending')) AS attention`,
    ),
    db.query(
      `SELECT d.id,d.state,d.updated_at,d.last_error,p.title,p.kind,w.name AS channel_name FROM con.deliveries d JOIN con.posts p ON p.id=d.post_id JOIN con.webhooks w ON w.id=d.webhook_id ORDER BY d.updated_at DESC LIMIT 100`,
    ),
  ]);
  return { summary: summary.rows[0], deliveries: deliveries.rows };
}

// HEADER 002: Channel settings never return stored webhook tokens to the client.
export async function webhooks(req, res, db, staff) {
  if (req.method === "GET") {
    const { rows } = await db.query(
      `SELECT ${safeWebhookColumns} FROM con.webhooks ORDER BY name`,
    );
    return json(res, 200, { webhooks: rows });
  }
  const body = bodyOf(req);
  if (req.method === "DELETE") {
    const existing = await db.query(
      "SELECT 1 FROM con.deliveries WHERE webhook_id=$1 LIMIT 1",
      [id(body.id)],
    );
    if (existing.rowCount)
      throw new AppError(
        409,
        "This connection has published posts. Disable it instead so message history is preserved.",
      );
    await db.query("DELETE FROM con.webhooks WHERE id=$1", [id(body.id)]);
    return json(res, 200, { ok: true });
  }
  if (!["POST", "PATCH"].includes(req.method))
    throw new AppError(405, "Method not allowed.");
  const suppliedName = typeof body.name === "string" ? body.name.trim() : "";
  const input = webhookInput({
    ...body,
    name: suppliedName || "Discord channel",
  });
  const existing =
    req.method === "PATCH" ? await findWebhook(db, body.id) : null;
  if (!suppliedName && existing && !input.url) input.name = existing.name;
  if (!input.url && !existing)
    throw new AppError(400, "A webhook URL is required.");
  let info;
  let cipher = existing?.url_cipher;
  if (input.url) {
    info = await discordRequest(input.url);
    if (!suppliedName)
      input.name =
        typeof info.name === "string" && info.name.trim()
          ? info.name.trim().slice(0, 80)
          : `Channel ${info.channel_id}`;
    if (
      info.type !== 1 ||
      !/^\d{17,20}$/.test(info.id) ||
      !/^\d{17,20}$/.test(info.channel_id)
    )
      throw new AppError(400, "Use a standard incoming channel webhook.");
    if (
      process.env.DISCORD_GUILD_ID &&
      info.guild_id !== process.env.DISCORD_GUILD_ID
    )
      throw new AppError(
        400,
        "This webhook belongs to a different Discord server.",
      );
    if (
      existing &&
      (existing.discord_id !== info.id ||
        existing.channel_id !== info.channel_id)
    ) {
      const history = await db.query(
        "SELECT 1 FROM con.deliveries WHERE webhook_id=$1 LIMIT 1",
        [existing.id],
      );
      if (history.rowCount)
        throw new AppError(
          409,
          "Create a new connection for a different webhook or channel; existing messages still need their original webhook.",
        );
    }
    cipher = encryptWebhook(input.url);
  }
  const values = [
    input.name,
    cipher,
    info?.id || existing.discord_id,
    info?.channel_id || existing.channel_id,
    info?.guild_id || existing?.guild_id || null,
    input.enabled,
  ];
  if (existing) {
    await db.query(
      "UPDATE con.webhooks SET name=$1,url_cipher=$2,discord_id=$3,channel_id=$4,guild_id=$5,enabled=$6,updated_at=now() WHERE id=$7",
      [...values, existing.id],
    );
  } else {
    await db.query(
      "INSERT INTO con.webhooks(name,url_cipher,discord_id,channel_id,guild_id,enabled,id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [...values, randomUUID(), staff.user.id],
    );
  }
  return json(res, 200, { ok: true });
}

// HEADER 003: Versioned drafts and website content; updates are never sent implicitly.
async function posts(req, res, db, staff) {
  if (req.method === "GET") {
    const { rows } = await db.query(
      `SELECT p.*, coalesce((SELECT json_agg(json_build_object('id',d.id,'webhook_id',d.webhook_id,'name',w.name,'message_id',d.message_id,'channel_id',w.channel_id,'guild_id',w.guild_id,'state',d.state,'last_error',d.last_error,'post_version',d.post_version)) FROM con.deliveries d JOIN con.webhooks w ON w.id=d.webhook_id WHERE d.post_id=p.id),'[]'::json) AS deliveries FROM con.posts p ORDER BY p.created_at DESC LIMIT 200`,
    );
    return json(res, 200, { posts: rows });
  }
  const body = bodyOf(req);
  if (req.method === "DELETE") {
    const post = await findPost(db, body.id);
    const sent = await db.query(
      "SELECT 1 FROM con.deliveries WHERE post_id=$1 LIMIT 1",
      [post.id],
    );
    if (post.published_at || sent.rowCount)
      throw new AppError(
        409,
        "Only unpublished drafts without Discord history can be deleted.",
      );
    await db.query("DELETE FROM con.posts WHERE id=$1", [post.id]);
    return json(res, 200, { ok: true });
  }
  if (!["POST", "PATCH"].includes(req.method))
    throw new AppError(405, "Method not allowed.");
  const input = postInput(body);
  const values = [
    input.kind,
    input.title,
    input.body,
    input.link_url,
    input.image_url,
    input.featured,
  ];
  if (req.method === "PATCH") {
    if (!Number.isInteger(body.version) || body.version < 1)
      throw new AppError(400, "Post version is required.");
    const result = await db.query(
      "UPDATE con.posts SET kind=$1,title=$2,body=$3,link_url=$4,image_url=$5,featured=$6,version=version+1,updated_at=now() WHERE id=$7 AND version=$8 RETURNING *",
      [...values, id(body.id), body.version],
    );
    if (!result.rowCount)
      throw new AppError(
        409,
        "This post changed in another session. Reload it before saving.",
      );
    return json(res, 200, { post: result.rows[0] });
  }
  const result = await db.query(
    "INSERT INTO con.posts(kind,title,body,link_url,image_url,featured,id,author_id,author_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
    [...values, randomUUID(), staff.user.id, staff.user.name],
  );
  return json(res, 201, { post: result.rows[0] });
}

// HEADER 004: Reserve delivery before network I/O; retry edits, never blind reposts.
export async function publish(db, input) {
  const postId = id(input.post_id);
  if (!input.webhook_id && input.website !== true && input.unpublish !== true)
    throw new AppError(400, "Choose the website or a Discord channel.");
  if (input.unpublish === true) {
    if (input.webhook_id || input.website)
      throw new AppError(400, "Unpublish must be a separate operation.");
    await db.query("UPDATE con.posts SET published_at=null WHERE id=$1", [
      postId,
    ]);
    return {
      ok: true,
      notice: "Removed from the website. Discord messages are retained.",
    };
  }
  const client = await db.connect();
  let post, webhook, delivery, action;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `con-publish-${postId}`,
    ]);
    post = await findPost(client, postId);
    if (input.version !== post.version)
      throw new AppError(
        409,
        "This post changed since your preview. Reload it before publishing.",
      );
    if (input.webhook_id) {
      webhook = await findWebhook(client, input.webhook_id);
      if (!webhook.enabled)
        throw new AppError(409, "This channel connection is disabled.");
      const result = await client.query(
        "SELECT * FROM con.deliveries WHERE post_id=$1 AND webhook_id=$2",
        [postId, webhook.id],
      );
      delivery = result.rows[0];
      // A concurrent edit/publish must finish before another request can touch it.
      if (delivery?.state === "sending")
        throw new AppError(
          409,
          "A delivery is already in progress. If it stalled, link the Discord message before retrying.",
        );
      action = deliveryAction(delivery);
      await client.query(
        `INSERT INTO con.deliveries(id,post_id,webhook_id,state,post_version) VALUES($1,$2,$3,'sending',$4) ON CONFLICT(post_id,webhook_id) DO UPDATE SET state='sending',post_version=$4,last_error=null,updated_at=now()`,
        [randomUUID(), postId, webhook.id, post.version],
      );
    }
    if (input.website === true)
      await client.query(
        "UPDATE con.posts SET published_at=coalesce(published_at,now()) WHERE id=$1",
        [postId],
      );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (!webhook) return { ok: true, notice: "Published to the website." };
  let message;
  try {
    const url = decryptWebhook(webhook.url_cipher);
    const destination =
      action === "edit"
        ? `${url}/messages/${delivery.message_id}`
        : `${url}?wait=true`;
    message = await discordRequest(destination, {
      method: action === "edit" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload(post)),
    });
    if (
      !/^\d{17,20}$/.test(message.id) ||
      message.channel_id !== webhook.channel_id
    )
      throw new Error("Invalid Discord confirmation");
    await db.query(
      "UPDATE con.deliveries SET state='sent',message_id=$3,last_error=null,updated_at=now() WHERE post_id=$1 AND webhook_id=$2",
      [postId, webhook.id, message.id],
    );
  } catch (error) {
    // A timeout/5xx can follow a successful send. Mark it uncertain to prevent duplicates.
    const uncertain =
      action === "send" && (!error.discordStatus || error.discordStatus >= 500);
    await db.query(
      "UPDATE con.deliveries SET state=$3,last_error=$4,updated_at=now() WHERE post_id=$1 AND webhook_id=$2",
      [
        postId,
        webhook.id,
        uncertain ? "uncertain" : "failed",
        uncertain
          ? "Delivery not confirmed. Check Discord and link the message before retrying."
          : error.message || "Discord update failed.",
      ],
    );
    throw new AppError(
      error.status || 502,
      `${input.website ? "Website saved. " : ""}${uncertain ? "Discord delivery is unconfirmed. Check the channel and link its message to avoid a duplicate." : error.message || "Discord update failed."}`,
    );
  }
  return {
    ok: true,
    notice:
      action === "edit"
        ? "Existing Discord message updated."
        : "Published to Discord.",
    message_id: message.id,
  };
}

// HEADER 005: Recover an uncertain send or import one of the existing channel posts.
export async function reconcile(db, input) {
  const post = await findPost(db, input.post_id);
  const webhook = await findWebhook(db, input.webhook_id);
  const current = await db.query(
    "SELECT 1 FROM con.deliveries WHERE post_id=$1 AND webhook_id=$2 AND state='sending' AND updated_at > now() - interval '2 minutes'",
    [post.id, webhook.id],
  );
  if (current.rowCount)
    throw new AppError(
      409,
      "A delivery is still in progress. Wait two minutes before recovering a stalled request.",
    );
  if (
    typeof input.message_id !== "string" ||
    !/^\d{17,20}$/.test(input.message_id)
  )
    throw new AppError(400, "Enter a Discord message ID, not its URL.");
  const message = await discordRequest(
    `${decryptWebhook(webhook.url_cipher)}/messages/${input.message_id}`,
  );
  if (
    message.channel_id !== webhook.channel_id ||
    message.webhook_id !== webhook.discord_id
  )
    throw new AppError(400, "This message belongs to another connection.");
  await db.query(
    `INSERT INTO con.deliveries(id,post_id,webhook_id,message_id,state,post_version) VALUES($1,$2,$3,$4,'sent',0) ON CONFLICT(post_id,webhook_id) DO UPDATE SET message_id=$4,state='sent',post_version=0,last_error=null,updated_at=now()`,
    [randomUUID(), post.id, webhook.id, message.id],
  );
  return {
    ok: true,
    notice:
      "Existing message linked. Publish again to update it with this draft.",
  };
}
