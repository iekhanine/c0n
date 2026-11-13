import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
// HEADER 001: Strict input validation, including a fixed Discord API destination.
export function id(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new AppError(400, "Invalid record ID.");
  return value;
}
function text(value, max, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new AppError(
      400,
      `Text must ${required ? "not be empty and " : ""}be at most ${max} characters.`,
    );
  return value.trim();
}
export function httpsUrl(value) {
  if (value === "") return "";
  if (typeof value !== "string" || value.length > 2000)
    throw new AppError(400, "Use a valid HTTPS link.");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, "Use a valid HTTPS link.");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new AppError(400, "Use an HTTPS link without embedded credentials.");
  return url.toString();
}
export function webhookUrl(value) {
  const url = httpsUrl(value);
  const parsed = new URL(url);
  if (
    parsed.hostname !== "discord.com" ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    !/^\/api\/(?:v10\/)?webhooks\/\d{17,20}\/[A-Za-z0-9_-]{30,150}$/.test(
      parsed.pathname,
    )
  )
    throw new AppError(
      400,
      "Paste a Discord webhook URL, without query parameters.",
    );
  return url;
}
export function postInput(input) {
  if (!["update", "project"].includes(input.kind))
    throw new AppError(400, "Choose update or project.");
  return {
    kind: input.kind,
    title: text(input.title ?? "", 200, input.kind === "project"),
    body: text(input.body, 1800, true),
    link_url: httpsUrl(input.link_url ?? ""),
    image_url: httpsUrl(input.image_url ?? ""),
    featured: input.kind === "project" && input.featured === true,
  };
}
export function webhookInput(input) {
  return {
    name: text(input.name, 80, true),
    enabled: input.enabled !== false,
    url: input.url ? webhookUrl(input.url) : null,
  };
}

// HEADER 002: Webhook tokens are encrypted at rest under a separate derived key.
function encryptionKey() {
  if (
    !process.env.WEBHOOK_ENCRYPTION_KEY ||
    process.env.WEBHOOK_ENCRYPTION_KEY.length < 32
  )
    throw new AppError(503, "Webhook encryption configuration unavailable.");
  return hkdfSync(
    "sha256",
    process.env.WEBHOOK_ENCRYPTION_KEY,
    "con-storage",
    "webhooks-v1",
    32,
  );
}
export function encryptWebhook(url) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function decryptWebhook(value) {
  const [iv, tag, encrypted] = value
    .split(".")
    .map((s) => Buffer.from(s, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return webhookUrl(
    Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
      "utf8",
    ),
  );
}

// HEADER 003: Structured embeds; no arbitrary payloads, pings or token exposure.
export function discordPayload(post) {
  const embed = {
    color: 0x58783b,
    description: post.body,
    footer: {
      text: `CoN // ${post.kind === "project" ? "FEATURED PROJECT" : "TRANSMISSION"} · ${post.author_name}`,
    },
    thumbnail: { url: "https://cultofnixon.com/con-logo.png" },
  };
  if (post.title) embed.title = post.title;
  if (post.link_url) {
    embed.fields = [
      {
        name: post.kind === "project" ? "EXPLORE THE PROJECT" : "READ MORE",
        value: post.link_url,
      },
    ];
    if (post.title) embed.url = post.link_url;
  }
  if (post.image_url) embed.image = { url: post.image_url };
  return {
    username: "Cult of nix0n",
    allowed_mentions: { parse: [] },
    embeds: [embed],
    attachments: [],
  };
}
export function deliveryAction(delivery) {
  if (delivery?.message_id) return "edit";
  if (delivery && ["sending", "uncertain"].includes(delivery.state))
    throw new AppError(
      409,
      "Discord may already have received this post. Link the existing message before trying again to avoid duplicates.",
    );
  return "send";
}
export async function discordRequest(url, options = {}) {
  // URL has already been validated, and all redirects are rejected.
  const response = await fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const message =
      response.status === 429
        ? "Discord rate limit reached. Wait a moment before retrying."
        : response.status === 404
          ? "Discord could not find this webhook or message."
          : response.status === 401 || response.status === 403
            ? "Discord rejected this webhook. Check its credentials and channel permissions."
            : "Discord could not complete this request.";
    const error = new AppError(response.status === 429 ? 429 : 502, message);
    error.discordStatus = response.status;
    throw error;
  }
  return response.json();
}
