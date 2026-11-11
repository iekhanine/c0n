import test from "node:test";
import assert from "node:assert/strict";
import {
  accessFor,
  discordCallback,
  login,
  logout,
  readSession,
  requireStaff,
  seal,
  sessionInfo,
  unseal,
} from "../server/auth.js";

process.env.SESSION_SECRET =
  "a-test-only-secret-at-least-thirty-two-characters";
process.env.DISCORD_CLIENT_ID = "1570103248453509281";
process.env.DISCORD_CLIENT_SECRET = "test-only-client-secret";
delete process.env.DISCORD_ADMIN_IDS;
delete process.env.DISCORD_GUILD_ID;
delete process.env.DISCORD_ADMIN_ROLE_IDS;
delete process.env.DISCORD_MOD_ROLE_IDS;
function response() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(body) {
      this.body = body;
    },
  };
}
const identity = {
  user: {
    id: "123456789012345678",
    name: "Test",
    username: "test",
    avatar: null,
  },
  accessToken: "private-access-token",
};

test("session encryption hides access tokens and rejects modified ciphertext", async () => {
  const token = await seal(identity, 60);
  assert.equal(token.includes("private-access-token"), false);
  assert.equal((await unseal(token)).user.id, identity.user.id);
  const pieces = token.split(".");
  pieces[3] = (pieces[3][0] === "A" ? "B" : "A") + pieces[3].slice(1);
  await assert.rejects(unseal(pieces.join(".")));
});
test("unconfigured authorization denies access rather than claiming first user", async () => {
  assert.deepEqual(await accessFor(identity), {
    authorized: false,
    access: "pending",
    permissions: [],
  });
});
test("explicit owner access is evaluated on each request", async () => {
  process.env.DISCORD_ADMIN_IDS = identity.user.id;
  assert.equal((await accessFor(identity)).access, "admin");
  delete process.env.DISCORD_ADMIN_IDS;
  assert.equal((await accessFor(identity)).authorized, false);
});
test("anonymous and invalid sessions cannot access protected endpoints", async () => {
  assert.equal(
    await readSession({ headers: { cookie: "__Host-con_session=invalid" } }),
    null,
  );
  const res = response();
  assert.equal(await requireStaff({ headers: {} }, res), null);
  assert.equal(res.statusCode, 401);
});
test("signed-in unapproved user receives 403", async () => {
  const token = await seal(identity, 60);
  const res = response();
  assert.equal(
    await requireStaff(
      { headers: { cookie: `__Host-con_session=${token}` } },
      res,
    ),
    null,
  );
  assert.equal(res.statusCode, 403);
});
test("session response exposes profile and access only, never token", async () => {
  const token = await seal(identity, 60);
  const res = response();
  await sessionInfo(
    { method: "GET", headers: { cookie: `__Host-con_session=${token}` } },
    res,
  );
  const body = JSON.parse(res.body);
  assert.equal(body.user.id, identity.user.id);
  assert.equal(body.authorized, false);
  assert.equal(res.body.includes("private-access-token"), false);
  assert.equal(res.headers["Cache-Control"], "private, no-store");
});
test("login uses canonical callback and secure state cookie", async () => {
  const res = response();
  await login({ method: "GET", headers: {} }, res);
  const url = new URL(res.headers.Location);
  assert.equal(url.hostname, "discord.com");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://c0n.ivansays.com/api/auth/discord/callback",
  );
  assert.equal(url.searchParams.get("scope"), "identify");
  assert.ok(url.searchParams.get("state").length >= 32);
  assert.match(res.headers["Set-Cookie"], /HttpOnly/);
  assert.match(res.headers["Set-Cookie"], /Secure/);
});
test("callback rejects missing and mismatched OAuth state before exchange", async () => {
  const missing = response();
  await discordCallback(
    {
      method: "GET",
      url: "/api/auth/discord/callback?code=fake&state=wrong",
      headers: {},
    },
    missing,
  );
  assert.equal(missing.headers.Location, "/admin?error=login");
  const token = await seal({ state: "expected-state" }, 60);
  const mismatch = response();
  await discordCallback(
    {
      method: "GET",
      url: "/api/auth/discord/callback?code=fake&state=wrong",
      headers: { cookie: `__Host-con_oauth=${token}` },
    },
    mismatch,
  );
  assert.equal(mismatch.headers.Location, "/admin?error=login");
});
test("successful callback exchanges the code and sets a private session", async () => {
  const original = globalThis.fetch;
  const state = "a-validated-authorization-state";
  const saved = await seal({ state }, 60);
  let calls = 0;
  try {
    globalThis.fetch = async (url) => {
      calls++;
      if (String(url).includes("/oauth2/token"))
        return Response.json({
          access_token: "provider-access-token",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "identify guilds.members.read",
        });
      return Response.json({
        id: identity.user.id,
        username: "test",
        global_name: "Test",
        avatar: null,
      });
    };
    const res = response();
    await discordCallback(
      {
        method: "GET",
        url: `/api/auth/discord/callback?code=valid-code&state=${state}`,
        headers: { cookie: `__Host-con_oauth=${saved}` },
      },
      res,
    );
    assert.equal(res.headers.Location, "/admin");
    assert.equal(calls, 2);
    const sessionCookie = res.headers["Set-Cookie"].find((c) =>
      c.startsWith("__Host-con_session="),
    );
    assert.match(sessionCookie, /Max-Age=1800/);
    assert.equal(sessionCookie.includes("provider-access-token"), false);
    const session = await readSession({
      headers: { cookie: sessionCookie.split(";")[0] },
    });
    assert.equal(session.user.id, identity.user.id);
  } finally {
    globalThis.fetch = original;
  }
});
test("sign out requires POST and same-origin request", async () => {
  const get = response();
  await logout({ method: "GET", headers: {} }, get);
  assert.equal(get.statusCode, 405);
  const foreign = response();
  await logout(
    { method: "POST", headers: { origin: "https://example.com" } },
    foreign,
  );
  assert.equal(foreign.statusCode, 403);
  const valid = response();
  await logout(
    { method: "POST", headers: { origin: "https://c0n.ivansays.com" } },
    valid,
  );
  assert.equal(valid.statusCode, 200);
  assert.match(valid.headers["Set-Cookie"], /Max-Age=0/);
});
test("Discord roles do not bypass approval and permission lookups fail closed", async () => {
  const originalUrl = process.env.DATABASE_URL;
  process.env.DISCORD_GUILD_ID = "234567890123456789";
  process.env.DISCORD_ADMIN_ROLE_IDS = "345678901234567890";
  try {
    assert.equal((await accessFor(identity)).authorized, false);
    process.env.DATABASE_URL = "test-only";
    assert.deepEqual(
      await accessFor(identity, async () => ({
        enabled: false,
        access: "admin",
        approval_status: "approved",
        permissions: [],
      })),
      { authorized: false, access: "denied", permissions: [] },
    );
    await assert.rejects(
      accessFor(identity, async () => {
        throw new Error("unavailable");
      }),
    );
  } finally {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    delete process.env.DISCORD_GUILD_ID;
    delete process.env.DISCORD_ADMIN_ROLE_IDS;
  }
});
