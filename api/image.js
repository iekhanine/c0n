import { vaultBackgroundHandler } from "../server/vault-background.js";
import { requireMembership } from "../server/membership.js";
import { database } from "../server/db.js";
import { id } from "../server/content.js";
import { ORIGIN, json } from "../server/auth.js";
export default async function handler(req, res) {
  if (new URL(req.url, ORIGIN).searchParams.get("asset") === "vault") return vaultBackgroundHandler(req,res);
  if (!await requireMembership(req,res)) return;
  if (!["GET", "HEAD"].includes(req.method))
    return json(res, 405, { error: "Method not allowed." });
  try {
    const imageId = id(new URL(req.url, ORIGIN).searchParams.get("id"));
    const { rows } = await database().query(
      "SELECT content_type,data FROM con.post_images WHERE id=$1",
      [imageId],
    );
    if (!rows[0]) return json(res, 404, { error: "Image not found." });
    res.setHeader("Content-Type", rows[0].content_type);
    res.setHeader("Content-Length", rows[0].data.length);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).end(req.method === "HEAD" ? undefined : rows[0].data);
  } catch (e) {
    return json(res, e.status || (e.code === "42P01" ? 404 : 503), {
      error: "Image unavailable.",
    });
  }
}
