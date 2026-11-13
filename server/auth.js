import { PERMISSIONS, hasPermission } from "../shared/permissions.js";
import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import { parseCookie as parse, stringifySetCookie } from "cookie";
import * as oauth from "oauth4webapi";
import { lookupStaff, assignedAccess, registerApplicant } from "./staff.js";

// HEADER 001: Canonical origin and private, encrypted cookies.
export const ORIGIN = "https://cultofnixon.com";
const SESSION = "__Host-con_session";
const STATE = "__Host-con_oauth";
const options = { httpOnly: true, secure: true, sameSite: "lax", path: "/" };
const issuer = "cult-of-nix0n";
const serialize = (name, value, settings) =>
  stringifySetCookie({ name, value, ...settings });
const list = (name) =>
  (process.env[name] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
function key() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw new Error("Session configuration missing");
  return createHash("sha256").update(process.env.SESSION_SECRET).digest();
}
export async function seal(value, seconds) {
  return new EncryptJWT(value)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer(issuer)
    .setAudience(ORIGIN)
    .setIssuedAt()
    .setExpirationTime(`${seconds}s`)
    .encrypt(key());
}
export async function unseal(value) {
  const { payload } = await jwtDecrypt(value, key(), {
    issuer,
    audience: ORIGIN,
    keyManagementAlgorithms: ["dir"],
    contentEncryptionAlgorithms: ["A256GCM"],
  });
  return payload;
}
export function privateResponse(res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}
export function json(res, status, value) {
  privateResponse(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(value));
}
function redirect(res, location) {
  privateResponse(res);
  res.statusCode = 303;
  res.setHeader("Location", location);
  res.end();
}
function cookies(req) {
  return parse(req.headers.cookie || "");
}
function method(req, res, expected) {
  if (req.method === expected) return true;
  res.setHeader("Allow", expected);
  json(res, 405, { error: "Method not allowed" });
  return false;
}
function client() {
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET)
    throw new Error("Discord configuration missing");
  return { client_id: process.env.DISCORD_CLIENT_ID };
}
const as = {
  issuer: "https://discord.com",
  authorization_endpoint: "https://discord.com/oauth2/authorize",
  token_endpoint: "https://discord.com/api/oauth2/token",
};
const callback = `${ORIGIN}/api/auth/discord/callback`;

// HEADER 002: Login uses a short-lived, authenticated state cookie.
export async function login(req, res) {
  if (!method(req, res, "GET")) return;
  try {
    const c = client();
    const state = oauth.generateRandomState();
    res.setHeader(
      "Set-Cookie",
      serialize(STATE, await seal({ state }, 600), { ...options, maxAge: 600 }),
    );
    const url = new URL(as.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: c.client_id,
      redirect_uri: callback,
      response_type: "code",
      scope: "identify",
      state,
    }).toString();
    redirect(res, url.toString());
  } catch {
    console.error("Discord login configuration unavailable");
    redirect(res, "/?error=configuration");
  }
}

// HEADER 003: Exchange the code server-side; tokens never enter client JS.
export async function discordCallback(req, res) {
  if (!method(req, res, "GET")) return;
  res.setHeader("Set-Cookie", serialize(STATE, "", { ...options, maxAge: 0 }));
  try {
    const saved = cookies(req)[STATE];
    if (!saved) throw new Error("Missing state cookie");
    const { state } = await unseal(saved);
    if (typeof state !== "string") throw new Error("Invalid state");
    const c = client();
    const parameters = oauth.validateAuthResponse(
      as,
      c,
      new URL(req.url, ORIGIN),
      state,
    );
    const response = await oauth.authorizationCodeGrantRequest(
      as,
      c,
      oauth.ClientSecretPost(process.env.DISCORD_CLIENT_SECRET),
      parameters,
      callback,
      oauth.nopkce,
      { signal: AbortSignal.timeout(15000) },
    );
    const tokens = await oauth.processAuthorizationCodeResponse(
      as,
      c,
      response,
    );
    const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!userResponse.ok) throw new Error("Profile lookup failed");
    const user = await userResponse.json();
    if (!/^\d{17,20}$/.test(user.id) || typeof user.username !== "string")
      throw new Error("Invalid profile");
    const seconds = Math.min(1800, Number(tokens.expires_in) || 1800);
    const session = await seal(
      {
        user: {
          id: user.id,
          name: user.global_name || user.username,
          username: user.username,
          avatar: user.avatar || null,
        },
      },
      seconds,
    );
    res.setHeader("Set-Cookie", [
      serialize(STATE, "", { ...options, maxAge: 0 }),
      serialize(SESSION, session, { ...options, maxAge: seconds }),
    ]);
    redirect(res, "/");
  } catch {
    // Do not log the callback URL, authorization code, token or cookie.
    console.error("Discord OAuth callback rejected");
    redirect(res, "/?error=login");
  }
}

// HEADER 004: Owners retain recovery access. Every other account requires approval.
export async function accessFor(session, lookup = lookupStaff) {
  if (list("DISCORD_ADMIN_IDS").includes(session.user.id))
    return {
      authorized: true,
      access: "admin",
      owner: true,
      permissions: [...PERMISSIONS],
      all_channels: true,
      channel_ids: [],
    };
  if (process.env.DATABASE_URL) {
    const assigned = assignedAccess(await lookup(session.user.id));
    if (assigned) return assigned;
  }
  return { authorized: false, access: "pending", permissions: [] };
}
export async function readSession(req) {
  try {
    const token = cookies(req)[SESSION];
    if (!token) return null;
    const session = await unseal(token);
    if (!session.user?.id) return null;
    return session;
  } catch {
    return null;
  }
}
export async function sessionInfo(req, res) {
  if (!method(req, res, "GET")) return;
  const session = await readSession(req);
  if (!session) return json(res, 200, { user: null, authorized: false });
  try {
    const requestRegistered = process.env.DATABASE_URL
      ? await registerApplicant(session.user)
      : false;
    json(res, 200, {
      user: session.user,
      requestRegistered,
      ...(await accessFor(session)),
    });
  } catch {
    json(res, 503, {
      error: "Could not verify your staff access. Try again shortly.",
    });
  }
}
// Reuse this guard on every future publishing/settings endpoint.
export async function requireStaff(req, res, adminOnly = false) {
  const session = await readSession(req);
  if (!session) {
    json(res, 401, { error: "Sign in required" });
    return null;
  }
  const access = await accessFor(session);
  if (
    !access.authorized ||
    (adminOnly && !hasPermission(access, "staff.manage"))
  ) {
    json(res, 403, { error: "Staff access required" });
    return null;
  }
  return { ...session, ...access };
}
export async function logout(req, res) {
  if (!method(req, res, "POST")) return;
  if (req.headers.origin !== ORIGIN)
    return json(res, 403, { error: "Invalid origin" });
  res.setHeader(
    "Set-Cookie",
    serialize(SESSION, "", { ...options, maxAge: 0 }),
  );
  json(res, 200, { ok: true });
}
