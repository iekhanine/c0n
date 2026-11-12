// Shared command validation. Never accept arbitrary Discord routes or webhook URLs.
export const CONTROL_OPERATIONS = [
  "overview",
  "messages.pin",
  "channels.list",
  "channels.create",
  "channels.edit",
  "channels.delete",
  "channels.permissions",
  "roles.list",
  "roles.create",
  "roles.edit",
  "roles.delete",
  "members.list",
  "members.role",
  "members.nickname",
  "members.timeout",
  "members.kick",
  "members.ban",
  "bans.list",
  "bans.remove",
  "guild.edit",
  "webhooks.list",
  "webhooks.create",
  "webhooks.connect",
  "webhooks.edit",
  "webhooks.delete",
  "webhooks.send",
  "webhooks.message.edit",
  "webhooks.message.delete",
];
export const destructive = (op) =>
  [
    "channels.delete",
    "roles.delete",
    "members.kick",
    "members.ban",
    "bans.remove",
    "webhooks.delete",
    "webhooks.message.delete",
  ].includes(op);
export const readOperation = (op) => op === "overview" || op.endsWith(".list");
const bad = (message) => {
  throw Object.assign(Error(message), { status: 400 });
};
const id = (value) => {
  if (typeof value !== "string" || !/^\d{17,20}$/.test(value))
    bad("A valid Discord ID is required.");
  return value;
};
const str = (value, max, label, empty = false) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim())
  )
    bad(`Enter a valid ${label} (up to ${max} characters).`);
  return value.trim();
};
const int = (value, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max)
    bad(`Enter a number between ${min} and ${max}.`);
  return value;
};
const bool = (value) => {
  if (typeof value !== "boolean") bad("Expected a checkbox value.");
  return value;
};
const bits = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{1,20}$/.test(value) ||
    BigInt(value) >= 2n ** 64n
  )
    bad("Invalid permission bitfield.");
  return value;
};
export function controlInput(op, input = {}) {
  if (
    !CONTROL_OPERATIONS.includes(op) ||
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  )
    bad("Unknown Discord command.");
  const p = {};
  if (op === "messages.pin") {
    p.channel_id = id(input.channel_id);
    p.message_id = id(input.message_id);
    p.pinned = bool(input.pinned);
  }
  const copy = (key, validate) => {
    if (input[key] !== undefined) p[key] = validate(input[key]);
  };
  if (!readOperation(op)) p.reason = str(input.reason, 300, "audit reason");
  if (destructive(op)) {
    p.id = id(input.id);
    if (input.confirm !== p.id)
      bad("Confirm the exact target ID before continuing.");
    p.confirm = p.id;
  }
  if (
    [
      "channels.edit",
      "channels.permissions",
      "roles.edit",
      "members.role",
      "members.nickname",
      "members.timeout",
      "webhooks.edit",
      "webhooks.message.edit",
      "webhooks.send",
      "webhooks.message.delete",
    ].includes(op)
  )
    p.id = id(input.id);
  if (
    op.startsWith("channels.") &&
    ["channels.create", "channels.edit"].includes(op)
  ) {
    p.name = smallCaps(str(input.name, 100, "channel name"));
    if (op.endsWith("create")) {
      p.type = int(input.type, 0, 15);
      if (![0, 2, 4, 5, 13, 15].includes(p.type))
        bad("Unsupported channel type.");
    }
    copy("parent", (v) => (v === null || v === "" ? null : id(v)));
    copy("topic", (v) => str(v, 1024, "topic", true));
    copy("position", (v) => int(v, 0, 499));
    copy("rateLimitPerUser", (v) => int(v, 0, 21600));
    copy("nsfw", bool);
    copy("userLimit", (v) => int(v, 0, 99));
  }
  if (op === "channels.permissions") {
    p.role_id = id(input.role_id);
    p.allow = bits(input.allow);
    p.deny = bits(input.deny);
    if ((BigInt(p.allow) & BigInt(p.deny)) !== 0n)
      bad("A permission cannot be both allowed and denied.");
  }
  if (["roles.create", "roles.edit"].includes(op)) {
    p.name = smallCaps(str(input.name, 100, "role name"));
    copy("color", (v) => {
      if (!/^#[\da-f]{6}$/i.test(v)) bad("Use a hex role color.");
      return v;
    });
    copy("permissions", bits);
    copy("hoist", bool);
    copy("mentionable", bool);
  }
  if (op === "members.role") {
    p.role_id = id(input.role_id);
    p.remove = bool(input.remove);
  }
  if (op === "members.nickname")
    p.nickname = str(input.nickname, 32, "nickname", true);
  if (op === "members.timeout") p.minutes = int(input.minutes, 0, 40320);
  if (["members.list", "bans.list"].includes(op))
    copy("after", (v) => (v === "" ? "" : id(v)));
  if (op === "guild.edit") {
    p.name = str(input.name, 100, "server name");
    p.description = str(input.description, 120, "server description", true);
    p.verificationLevel = int(input.verificationLevel, 0, 4);
    p.defaultMessageNotifications = int(
      input.defaultMessageNotifications,
      0,
      1,
    );
    p.explicitContentFilter = int(input.explicitContentFilter, 0, 2);
  }
  if (["webhooks.create", "webhooks.edit"].includes(op))
    p.name = str(input.name, 80, "webhook name");
  if (["webhooks.create", "webhooks.connect"].includes(op))
    p.channel_id = id(input.channel_id);
  if (op === "webhooks.send" || op === "webhooks.message.edit")
    p.content = str(input.content, 2000, "message");
  if (op.startsWith("webhooks.message.")) p.message_id = id(input.message_id);
  return p;
}
const alphabet = "abcdefghijklmnopqrstuvwxyz";
const small = [..."ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ"];
export const smallCaps = (value) =>
  String(value).replace(
    /[a-z]/gi,
    (c) => small[alphabet.indexOf(c.toLowerCase())],
  );
