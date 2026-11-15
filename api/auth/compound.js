import { randomUUID } from "node:crypto";
import { ORIGIN, json, readSession, seal, privateResponse } from "../../server/auth.js";

// Short-lived, single-purpose identity handoff to the separate Compound host.
// The receiver consumes the nonce exactly once before issuing a host-only cookie.
export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "GET only" });
  const session = await readSession(req);
  if (!session?.user?.id) {
    privateResponse(res);
    res.statusCode = 303;
    res.setHeader("Location", ORIGIN + "/api/auth/discord/login");
    return res.end();
  }
  const ticket = await seal({
    purpose: "compound-login",
    user: session.user,
    nonce: randomUUID(),
  }, 60);
  privateResponse(res);
  res.setHeader("Referrer-Policy", "no-referrer");
  res.statusCode = 303;
  res.setHeader("Location", "https://thecompound.cultofnixon.com/api/auth/exchange?ticket=" + encodeURIComponent(ticket));
  res.end();
}
