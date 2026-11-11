// HEADER 001: One permission catalog for the server and staff editor.
export const PERMISSION_GROUPS = [
  {
    label: "Updates",
    items: [
      ["updates.view", "View updates"],
      ["updates.create", "Create updates"],
      ["updates.edit", "Edit updates"],
      ["updates.publish", "Publish / update posted copies"],
      ["updates.delete", "Delete unpublished drafts"],
    ],
  },
  {
    label: "Featured projects",
    items: [
      ["projects.view", "View projects"],
      ["projects.create", "Create projects"],
      ["projects.edit", "Edit projects"],
      ["projects.publish", "Publish / update posted copies"],
      ["projects.delete", "Delete unpublished drafts"],
    ],
  },
  {
    label: "Site management",
    items: [
      ["website.publish", "Publish changes to the public website"],
      ["channels.manage", "Add and edit Discord channels"],
      ["reports.view", "View publishing reports"],
      ["staff.manage", "Approve accounts and manage access"],
      ["database.manage", "Apply storage updates"],
    ],
  },
];
export const PERMISSIONS = PERMISSION_GROUPS.flatMap((group) =>
  group.items.map(([key]) => key),
);
export function presetPermissions(role) {
  if (role === "admin") return [...PERMISSIONS];
  if (role === "moderator")
    return PERMISSIONS.filter(
      (key) =>
        key.startsWith("updates.") ||
        key.startsWith("projects.") ||
        key === "reports.view" ||
        key === "website.publish",
    );
  return role === "report" ? ["reports.view"] : [];
}
export function withViewPermissions(values) {
  const result = new Set(values.filter((value) => PERMISSIONS.includes(value)));
  for (const prefix of ["updates", "projects"])
    if ([...result].some((key) => key.startsWith(`${prefix}.`)))
      result.add(`${prefix}.view`);
  return PERMISSIONS.filter((key) => result.has(key));
}
export function effectivePermissions(grant) {
  if (typeof grant === "string") return presetPermissions(grant); // Legacy schema versions.
  if (grant?.owner) return [...PERMISSIONS];
  if (Array.isArray(grant?.permissions))
    return withViewPermissions(grant.permissions);
  return presetPermissions(grant?.access);
}
export const hasPermission = (grant, permission) =>
  effectivePermissions(grant).includes(permission);
export const contentPrefix = (kind) =>
  kind === "project" ? "projects" : "updates";
export function channelLabel(value) {
  return `#${
    String(value || "channel")
      .trim()
      .replace(/^#+\s*/, "") || "channel"
  }`;
}
// Discord snowflake timestamp: https://discord.com/developers/docs/reference#snowflakes
export function discordMessageTime(value) {
  if (typeof value !== "string" || !/^\d{17,20}$/.test(value)) return null;
  return new Date(
    Number((BigInt(value) >> 22n) + 1420070400000n),
  ).toISOString();
}
