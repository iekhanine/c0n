import { randomUUID } from "node:crypto";
import { database } from "./db.js";
import { AppError } from "./content.js";

// HEADER 001: Permission policy used by every admin endpoint.
export const ownerIds = () =>
  (process.env.DISCORD_ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
export function canAccess(access, action, method) {
  if (access === "admin")
    return [
      "status",
      "setup",
      "posts",
      "publish",
      "reconcile",
      "webhooks",
      "staff",
      "reports",
    ].includes(action);
  if (access === "report")
    return method === "GET" && ["status", "reports"].includes(action);
  if (access === "moderator")
    return (
      (method === "GET" &&
        ["status", "posts", "webhooks", "reports"].includes(action)) ||
      (action === "posts" && ["POST", "PATCH", "DELETE"].includes(method)) ||
      (["publish", "reconcile"].includes(action) && method === "POST")
    );
  return false;
}
export async function lookupStaff(discordId, db = database()) {
  try {
    const { rows } = await db.query(
      "SELECT discord_id, access, enabled FROM con.staff_users WHERE discord_id=$1",
      [discordId],
    );
    return rows[0] || null;
  } catch (error) {
    if (error.code === "42P01") return null; // Existing installs before migration 2.
    throw error; // A connection failure must never grant access.
  }
}
export function assignedAccess(member) {
  if (!member) return null;
  if (
    !member.enabled ||
    !["admin", "moderator", "report"].includes(member.access)
  )
    return { authorized: false, access: "denied" };
  return { authorized: true, access: member.access };
}
export function staffInput(input) {
  if (
    typeof input.discord_id !== "string" ||
    !/^\d{17,20}$/.test(input.discord_id)
  )
    throw new AppError(400, "Enter a valid Discord user ID, not a username.");
  if (!["admin", "moderator", "report"].includes(input.access))
    throw new AppError(400, "Choose Admin, Moderator, or Report.");
  if (typeof input.display_name !== "string" || input.display_name.length > 80)
    throw new AppError(400, "Display name must be at most 80 characters.");
  if (typeof input.enabled !== "boolean")
    throw new AppError(400, "Choose whether access is enabled.");
  return {
    discord_id: input.discord_id,
    display_name: input.display_name.trim(),
    access: input.access,
    enabled: input.enabled,
  };
}
export async function listStaff(db = database()) {
  const { rows } = await db.query(
    "SELECT discord_id,display_name,access,enabled,created_at,updated_at FROM con.staff_users ORDER BY created_at DESC",
  );
  const owners = ownerIds();
  return [
    ...owners.map((discord_id) => ({
      discord_id,
      display_name: "Owner account",
      access: "admin",
      enabled: true,
      owner: true,
    })),
    ...rows
      .filter((row) => !owners.includes(row.discord_id))
      .map((row) => ({ ...row, owner: false })),
  ];
}
// HEADER 002: Explicit grants; disabled records override role-based fallback.
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
    const { rows } = await client.query(
      "SELECT access,enabled FROM con.staff_users WHERE discord_id=$1 FOR UPDATE",
      [member.discord_id],
    );
    const old = rows[0];
    await client.query(
      `INSERT INTO con.staff_users(discord_id,display_name,access,enabled,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT(discord_id) DO UPDATE SET display_name=$2,access=$3,enabled=$4,updated_by=$5,updated_at=now()`,
      [
        member.discord_id,
        member.display_name,
        member.access,
        member.enabled,
        actorId,
      ],
    );
    await client.query(
      "INSERT INTO con.staff_audit(id,actor_id,target_id,old_access,new_access,old_enabled,new_enabled) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        actorId,
        member.discord_id,
        old?.access || null,
        member.access,
        old?.enabled ?? null,
        member.enabled,
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
