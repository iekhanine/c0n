import { requireMembership } from "../server/membership.js";
import { publicProjects } from "../server/projects.js";
import { database } from "../server/db.js";
import { json } from "../server/auth.js";
export default async function handler(req, res) {
  if (!await requireMembership(req,res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed" });
  }
  try {
    let rows;
    try {
      const result = await database().query(
        "SELECT id,published_snapshot,published_at FROM con.posts WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 100",
      );
      rows = result.rows
        .filter((p) => p.published_snapshot)
        .map((p) => ({
          id: p.id,
          ...p.published_snapshot,
          published_at: p.published_at,
        }));
    } catch (error) {
      if (error.code !== "42703") throw error;
      // Keep the existing public feed online while the owner applies migration 3.
      rows = (
        await database().query(
          "SELECT id,kind,title,body,link_url,image_url,featured,author_name,published_at FROM con.posts WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 100",
        )
      ).rows;
    }
    const projectStorage = await database().query(
      "SELECT to_regclass('con.projects')::text AS marker",
    );
    if (projectStorage.rows[0].marker)
      rows = [
        ...rows.filter((p) => p.kind !== "project"),
        ...(await publicProjects(database())),
      ];
    return json(res, 200, { posts: rows });
  } catch (error) {
    if (error.code === "42P01" || !process.env.DATABASE_URL)
      return json(res, 200, { posts: [] });
    console.error("CoN public feed unavailable");
    return json(res, 503, { error: "Updates are temporarily unavailable." });
  }
}
