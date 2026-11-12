import { createHmac, timingSafeEqual } from "node:crypto";
export function canonicalJson(value) {
  const normalize = (v) =>
    Array.isArray(v)
      ? v.map(normalize)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .filter((k) => v[k] !== undefined)
              .map((k) => [k, normalize(v[k])]),
          )
        : v;
  return JSON.stringify(normalize(value));
}
export function signBridge(secret, timestamp, nonce, payload) {
  return createHmac("sha256", secret)
    .update(`con-discord-v1\n${timestamp}\n${nonce}\n${canonicalJson(payload)}`)
    .digest("hex");
}
export function verifyBridge(secret, headers, payload, now = Date.now()) {
  const timestamp = headers["x-con-timestamp"],
    nonce = headers["x-con-nonce"],
    signature = headers["x-con-signature"];
  if (
    typeof timestamp !== "string" ||
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(now - Number(timestamp)) > 300000 ||
    typeof nonce !== "string" ||
    !/^[-\w]{16,80}$/.test(nonce) ||
    typeof signature !== "string" ||
    !/^[\da-f]{64}$/.test(signature)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(signBridge(secret, timestamp, nonce, payload), "hex"),
  );
}
