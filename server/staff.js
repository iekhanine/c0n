import { randomUUID } from "node:crypto";
import { database } from "./db.js";
import { AppError } from "./content.js";
import {
  PERMISSIONS,
  effectivePermissions,
  hasPermission,
  withViewPermissions,
} from "../shared/permissions.js";
export const ownerIds = () =>
  (process.env.DISCORD_ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// HEADER 001: Actions and individual content operations are independently authorized.
export function canAccess(grant, action, method) {
  const p = effectivePermissions(grant);
  if (action === "status") return method === "GET";
  if (action === "setup")
    return method === "POST" && p.includes("database.manage");
  if (action === "reports")
    return method === "GET" && p.includes("reports.view");
  if (action === "staff")
    return ["GET", "POST"].includes(method) && p.includes("staff.manage");
  if (action === "webhooks")
    return (
      p.includes("channels.manage") ||
      (method === "GET" && p.includes("staff.manage")) ||
      (method === "GET" && p.some((key) => key.endsWith(".publish")))
    );
  if (action === "pin")
    return (
      ["GET", "POST"].includes(method) &&
      p.some((key) => key.endsWith(".publish"))
    );
  if (action === "images" && method === "GET")
    return p.some(
      (key) => key.startsWith("updates.") || key.startsWith("projects."),
    );
  if (action === "images")
    return (
      ["POST", "PATCH"].includes(method) &&
      p.some((key) =>
        [
          "updates.create",
          "updates.edit",
          "projects.create",
          "projects.edit",
        ].includes(key),
      )
    );
  if (action === "posts") {
    const operation = {
      GET: "view",
      POST: "create",
      PATCH: "edit",
      DELETE: "delete",
    }[method];
    return (
      !!operation &&
      p.some(
        (key) =>
          key === `updates.${operation}` || key === `projects.${operation}`,
      )
    );
  }
  if (["publish", "reconcile"].includes(action))
    return method === "POST" && p.some((key) => key.endsWith(".publish"));
  return false;
}
export async function lookupStaff(discordId, db = database()) {
  try {
    const { rows } = await db.query(
      "SELECT * FROM con.staff_users WHERE discord_id=$1",
      [discordId],
    );
    return rows[0] || null;
  } catch (error) {
    if (error.code === "42P01") return null;
    throw error;
  }
}
export function assignedAccess(member) {
  if (!member) return null;
  if (member.approval_status === "pending")
    return { authorized: false, access: "pending", permissions: [] };
  if (
    !member.enabled ||
    member.approval_status === "rejected" ||
    !["admin", "moderator", "report"].includes(member.access)
  )
    return { authorized: false, access: "denied", permissions: [] };
  return {
    authorized: true,
    access: member.access,
    permissions: effectivePermissions(member),
    all_channels: member.all_channels ?? true,
    channel_ids: Array.isArray(member.channel_ids) ? member.channel_ids : [],
  };
}

// HEADER 002: Signing in registers a request, never a grant. Re-login preserves decisions.
export async function registerApplicant(user, db = database()) {
  if (ownerIds().includes(user.id)) return true;
  try {
    await db.query(
      `INSERT INTO con.staff_users(discord_id,display_name,username,avatar,access,enabled,approval_status,permissions,created_by,updated_by,requested_at,last_seen_at) VALUES($1,$2,$3,$4,'moderator',false,'pending','[]'::jsonb,$1,$1,now(),now()) ON CONFLICT(discord_id) DO UPDATE SET display_name=$2,username=$3,avatar=$4,last_seen_at=now()`,
      [user.id, user.name, user.username, user.avatar],
    );
    return true;
  } catch (error) {
    if (["42P01", "42703"].includes(error.code)) return false;
    throw error;
  }
}
export function staffInput(input) {
  if (
    typeof input.discord_id !== "string" ||
    !/^\d{17,20}$/.test(input.discord_id)
  )
    throw new AppError(400, "Invalid Discord account.");
  if (!["admin", "moderator", "report"].includes(input.access))
    throw new AppError(400, "Choose Admin, Moderator, or Report.");
  if (typeof input.display_name !== "string" || input.display_name.length > 80)
    throw new AppError(400, "Display name must be at most 80 characters.");
  if (typeof input.enabled !== "boolean")
    throw new AppError(400, "Choose whether access is enabled.");
  if (!["approved", "rejected"].includes(input.approval_status))
    throw new AppError(400, "Approve or reject this request.");
  if (
    !Array.isArray(input.permissions) ||
    input.permissions.some(
      (key) => typeof key !== "string" || !PERMISSIONS.includes(key),
    )
  )
    throw new AppError(400, "Choose permissions from the checklist.");
  if (
    typeof input.all_channels !== "boolean" ||
    !Array.isArray(input.channel_ids) ||
    input.channel_ids.some(
      (value) =>
        typeof value !== "string" ||
        !/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(
          value,
        ),
    )
  )
    throw new AppError(400, "Choose allowed posting channels.");
  return {
    all_channels: input.all_channels,
    channel_ids: input.all_channels ? [] : [...new Set(input.channel_ids)],
    discord_id: input.discord_id,
    display_name: input.display_name.trim(),
    access: input.access,
    enabled: input.enabled && input.approval_status === "approved",
    approval_status: input.approval_status,
    permissions: withViewPermissions(input.permissions),
  };
}
export async function listStaff(db = database()) {
  const { rows } = await db.query(
    "SELECT discord_id,display_name,username,avatar,access,enabled,approval_status,permissions,all_channels,channel_ids,requested_at,last_seen_at,created_at,updated_at FROM con.staff_users ORDER BY (approval_status='pending') DESC,requested_at DESC NULLS LAST,created_at DESC",
  );
  const owners = ownerIds();
  return [
    ...owners.map((discord_id) => ({
      discord_id,
      display_name: "Owner account",
      access: "admin",
      enabled: true,
      approval_status: "approved",
      permissions: [...PERMISSIONS],
      all_channels: true,
      channel_ids: [],
      owner: true,
    })),
    ...rows
      .filter((row) => !owners.includes(row.discord_id))
      .map((row) => ({ ...row, owner: false })),
  ];
}

// HEADER 003: Grant only capabilities the acting administrator can delegate.
export async function saveStaff(actorId, input, db = database()) {
  const member = staffInput(input);
  if (ownerIds().includes(member.discord_id))
    throw new AppError(403, "Owner accounts cannot be changed here.");
  if (member.discord_id === actorId)
    throw new AppError(
      403,
      "You cannot change your own access. Ask another administrator.",
    );
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('con-staff-management'))",
    );
    const actor = ownerIds().includes(actorId)
      ? { owner: true }
      : assignedAccess(await lookupStaff(actorId, client));
    if (!actor || !hasPermission(actor, "staff.manage"))
      throw new AppError(403, "Staff management permission is required.");
    const { rows } = await client.query(
      "SELECT * FROM con.staff_users WHERE discord_id=$1 FOR UPDATE",
      [member.discord_id],
    );
    const old = rows[0];
    if (!old)
      throw new AppError(
        404,
        "Ask this person to sign in with Discord first. Their request will appear here.",
      );
    if (
      input.expected_updated_at &&
      new Date(old.updated_at).toISOString() !==
        new Date(input.expected_updated_at).toISOString()
    )
      throw new AppError(
        409,
        "Another administrator changed this account. Refresh the list before saving.",
      );
    const allowed = effectivePermissions(actor);
    if (
      member.permissions.some((key) => !allowed.includes(key)) ||
      effectivePermissions(old).some((key) => !allowed.includes(key))
    )
      throw new AppError(
        403,
        "You cannot grant or change permissions beyond your own access. Ask the owner.",
      );
    if (
      !actor.owner &&
      !actor.all_channels &&
      (member.all_channels ||
        member.channel_ids.some(
          (value) => !actor.channel_ids.includes(value),
        ) ||
        old.all_channels ||
        (old.channel_ids || []).some(
          (value) => !actor.channel_ids.includes(value),
        ))
    )
      throw new AppError(
        403,
        "You cannot grant or manage posting channels beyond your own access.",
      );
    if (member.channel_ids.length) {
      const known = await client.query(
        "SELECT id FROM con.webhooks WHERE id=ANY($1::uuid[])",
        [member.channel_ids],
      );
      if (known.rowCount !== member.channel_ids.length)
        throw new AppError(
          400,
          "One of the selected channels no longer exists.",
        );
    }
    await client.query(
      "UPDATE con.staff_users SET access=$2,enabled=$3,approval_status=$4,permissions=$5::jsonb,updated_by=$6,all_channels=$7,channel_ids=$8::jsonb,updated_at=now() WHERE discord_id=$1",
      [
        member.discord_id,
        member.access,
        member.enabled,
        member.approval_status,
        JSON.stringify(member.permissions),
        actorId,
        member.all_channels,
        JSON.stringify(member.channel_ids),
      ],
    );
    await client.query(
      "INSERT INTO con.staff_audit(id,actor_id,target_id,old_access,new_access,old_enabled,new_enabled,old_permissions,new_permissions,old_status,new_status,old_channels,new_channels,old_all_channels,new_all_channels) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12::jsonb,$13::jsonb,$14,$15)",
      [
        randomUUID(),
        actorId,
        member.discord_id,
        old.access,
        member.access,
        old.enabled,
        member.enabled,
        JSON.stringify(effectivePermissions(old)),
        JSON.stringify(member.permissions),
        old.approval_status,
        member.approval_status,
        JSON.stringify(old.channel_ids || []),
        JSON.stringify(member.channel_ids),
        old.all_channels,
        member.all_channels,
      ],
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
