import { randomUUID } from "node:crypto";
import { database } from "./db.js";
import { json, ORIGIN, readSession, accessFor } from "./auth.js";
import { lookupStaff } from "./staff.js";
import { AppError, id, httpsUrl } from "./content.js";
import { uploadImage } from "./images.js";
import { hasPermission } from "../shared/permissions.js";
export const socialSchema = [
  `CREATE TABLE IF NOT EXISTS con.profiles(user_id text PRIMARY KEY, name text NOT NULL, username text NOT NULL, avatar_url text NOT NULL DEFAULT '', cover_url text NOT NULL DEFAULT '', headline text NOT NULL DEFAULT '', bio text NOT NULL DEFAULT '', location text NOT NULL DEFAULT '', links jsonb NOT NULL DEFAULT '[]', show_projects boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS con.member_posts(id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES con.profiles(user_id), title text NOT NULL DEFAULT '', body text NOT NULL, image_url text NOT NULL DEFAULT '', pinned boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS con_member_posts_user ON con.member_posts(user_id,created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS con.post_likes(post_id uuid NOT NULL, user_id text NOT NULL, PRIMARY KEY(post_id,user_id))`,
  `CREATE TABLE IF NOT EXISTS con.post_replies(id uuid PRIMARY KEY, post_id uuid NOT NULL,user_id text NOT NULL REFERENCES con.profiles(user_id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS con_post_replies_post ON con.post_replies(post_id,created_at)`,
  ...["profiles", "member_posts", "post_likes", "post_replies"].map(
    (t) => `ALTER TABLE con.${t} ENABLE ROW LEVEL SECURITY`,
  ),
  ...["profiles", "member_posts", "post_likes", "post_replies"].map(
    (t) => `REVOKE ALL ON con.${t} FROM PUBLIC`,
  ),
];
const ready = new WeakMap();
export async function ensureSocial(db) {
  if (!ready.has(db))
    ready.set(
      db,
      (async () => {
        for (const sql of socialSchema) await db.query(sql);
      })().catch((e) => {
        ready.delete(db);
        throw e;
      }),
    );
  await ready.get(db);
}
const text = (value, max, required = false) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new AppError(400, `Enter text within ${max} characters.`);
  return value.trim();
};
const userId = (value) => {
  if (typeof value !== "string" || !/^\d{17,20}$/.test(value))
    throw new AppError(400, "Invalid member ID.");
  return value;
};
export function profileInput(b) {
  if (
    !Array.isArray(b.links) ||
    b.links.length > 8 ||
    typeof b.show_projects !== "boolean"
  )
    throw new AppError(400, "Use up to eight social links.");
  return {
    name: text(b.name, 80, true),
    headline: text(b.headline, 160),
    bio: text(b.bio, 3000),
    location: text(b.location, 100),
    avatar_url: httpsUrl(b.avatar_url),
    cover_url: httpsUrl(b.cover_url),
    show_projects: b.show_projects,
    links: b.links.map((l) => ({
      label: text(l.label, 40, true),
      url: httpsUrl(text(l.url, 2000, true)),
    })),
  };
}
export function memberPostInput(b) {
  return {
    title: text(b.title ?? "", 200),
    body: text(b.body, 10000, true),
    image_url: httpsUrl(b.image_url ?? ""),
  };
}
const discordAvatar = (u) =>
  u.avatar
    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`
    : "";
async function registerProfile(db, u) {
  await db.query(
    "INSERT INTO con.profiles(user_id,name,username,avatar_url)VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO NOTHING",
    [u.id, u.name, u.username || u.name, discordAvatar(u)],
  );
}
const memberSelect = `SELECT m.id,m.user_id AS author_id,p.name AS author_name,p.username,p.avatar_url,m.title,m.body,m.image_url,m.pinned,m.version,m.created_at AS published_at,m.updated_at,'member' AS kind FROM con.member_posts m JOIN con.profiles p ON p.user_id=m.user_id`;
async function decorate(db, posts, viewer) {
  if (!posts.length) return [];
  const ids = posts.map((p) => p.id);
  const likes = (
    await db.query(
      "SELECT post_id,count(*)::int AS n,bool_or(user_id=$2) AS liked FROM con.post_likes WHERE post_id=ANY($1::uuid[]) GROUP BY post_id",
      [ids, viewer || ""],
    )
  ).rows;
  const replies = (
    await db.query(
      "SELECT post_id,count(*)::int AS n FROM con.post_replies WHERE post_id=ANY($1::uuid[]) GROUP BY post_id",
      [ids],
    )
  ).rows;
  return posts.map((p) => ({
    ...p,
    likes: likes.find((l) => l.post_id === p.id)?.n || 0,
    liked: likes.find((l) => l.post_id === p.id)?.liked || false,
    replies: replies.find((r) => r.post_id === p.id)?.n || 0,
    can_edit: p.kind === "member" && viewer === p.author_id,
  }));
}
export async function getPost(db, postId, viewer) {
  let row = (await db.query(memberSelect + " WHERE m.id=$1", [id(postId)]))
    .rows[0];
  if (!row) {
    const r = (
      await db.query(
        "SELECT id,author_id,published_snapshot,published_at FROM con.posts WHERE id=$1 AND kind='update' AND published_at IS NOT NULL AND published_snapshot IS NOT NULL",
        [postId],
      )
    ).rows[0];
    if (r)
      row = {
        ...r.published_snapshot,
        id: r.id,
        author_id: r.author_id,
        published_at: r.published_at,
        kind: "update",
      };
  }
  if (!row) throw new AppError(404, "Post not found.");
  return (await decorate(db, [row], viewer))[0];
}
export async function socialHandler(req, res, dbFactory = database) {
  try {
    if (!["GET", "POST", "PUT", "DELETE"].includes(req.method))
      throw new AppError(405, "Method not allowed.");
    const url = new URL(req.url, ORIGIN),
      action = url.searchParams.get("action") || "feed";
    if (req.method !== "GET" && req.headers.origin !== ORIGIN)
      throw new AppError(403, "Invalid origin.");
    const session = await readSession(req),
      user = session?.user;
    if (req.method !== "GET" && !user)
      throw new AppError(401, "Sign in with Discord first.");
    const db = dbFactory();
    await ensureSocial(db);
    const b =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (req.method !== "GET") {
      const staff = await lookupStaff(user.id, db);
      if (
        staff &&
        (staff.approval_status === "rejected" ||
          (staff.approval_status === "approved" && !staff.enabled))
      )
        throw new AppError(403, "Your account is disabled.");
      await registerProfile(db, user);
    }
    if (action === "upload" && req.method === "POST")
      return json(
        res,
        201,
        await uploadImage(db, { ...b, name: "Member image" }, { user }, false),
      );
    if (action === "directory" && req.method === "GET")
      return json(res, 200, {
        profiles: (
          await db.query(
            "SELECT user_id,name,username,avatar_url,headline FROM con.profiles ORDER BY updated_at DESC LIMIT 200",
          )
        ).rows,
      });
    if (action === "profile" && req.method === "GET") {
      const uid = userId(url.searchParams.get("id") || user?.id);
      let profile = (
        await db.query("SELECT * FROM con.profiles WHERE user_id=$1", [uid])
      ).rows[0];
      if (!profile) {
        let fallback = (
          await db.query(
            "SELECT owner_name AS name FROM con.projects WHERE owner_id=$1 AND published IS NOT NULL LIMIT 1",
            [uid],
          )
        ).rows[0];
        if (!fallback)
          fallback = (
            await db.query(
              "SELECT author_name AS name FROM con.posts WHERE author_id=$1 AND published_at IS NOT NULL LIMIT 1",
              [uid],
            )
          ).rows[0];
        if (!fallback && uid === user?.id) fallback = { name: user.name };
        if (!fallback)
          throw new AppError(404, "This member has not created a profile yet.");
        profile = {
          user_id: uid,
          name: fallback.name,
          username: uid === user?.id ? user.username || user.name : "",
          avatar_url: uid === user?.id ? discordAvatar(user) : "",
          cover_url: "",
          headline: "",
          bio: "",
          location: "",
          links: [],
          show_projects: true,
        };
      }
      const projects = profile.show_projects
        ? (
            await db.query(
              "SELECT id,published FROM con.projects WHERE owner_id=$1 AND published IS NOT NULL ORDER BY published_at DESC",
              [uid],
            )
          ).rows
        : [];
      const memberPosts = (
        await db.query(
          memberSelect +
            " WHERE m.user_id=$1 ORDER BY m.pinned DESC,m.created_at DESC LIMIT 100",
          [uid],
        )
      ).rows;
      const transmissions = (
        await db.query(
          "SELECT id,author_id,published_snapshot,published_at FROM con.posts WHERE author_id=$1 AND kind='update' AND published_at IS NOT NULL AND published_snapshot IS NOT NULL ORDER BY published_at DESC LIMIT 100",
          [uid],
        )
      ).rows.map((r) => ({
        ...r.published_snapshot,
        id: r.id,
        author_id: r.author_id,
        published_at: r.published_at,
        kind: "update",
      }));
      const posts = await decorate(
        db,
        [...memberPosts, ...transmissions]
          .sort(
            (a, b) =>
              Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
              new Date(b.published_at) - new Date(a.published_at),
          )
          .slice(0, 100),
        user?.id,
      );
      return json(res, 200, {
        profile,
        projects,
        posts,
        own: uid === user?.id,
      });
    }
    if (action === "profile" && req.method === "PUT") {
      const v = profileInput(b);
      await db.query(
        "UPDATE con.profiles SET name=$2,headline=$3,bio=$4,location=$5,avatar_url=$6,cover_url=$7,links=$8::jsonb,show_projects=$9,updated_at=now() WHERE user_id=$1",
        [
          user.id,
          v.name,
          v.headline,
          v.bio,
          v.location,
          v.avatar_url,
          v.cover_url,
          JSON.stringify(v.links),
          v.show_projects,
        ],
      );
      return json(res, 200, { ok: true });
    }
    if (action === "feed" && req.method === "GET") {
      const before = url.searchParams.get("before");
      if (before && !Number.isFinite(Date.parse(before)))
        throw new AppError(400, "Invalid page cursor.");
      const rows = (
        await db.query(
          memberSelect +
            " WHERE m.created_at < $1::timestamptz ORDER BY m.created_at DESC LIMIT 51",
          [before || "infinity"],
        )
      ).rows;
      const updates = (
        await db.query(
          "SELECT id,author_id,published_snapshot,published_at FROM con.posts WHERE kind='update' AND published_at IS NOT NULL AND published_snapshot IS NOT NULL AND published_at < $1::timestamptz ORDER BY published_at DESC LIMIT 51",
          [before || "infinity"],
        )
      ).rows.map((r) => ({
        ...r.published_snapshot,
        id: r.id,
        author_id: r.author_id,
        published_at: r.published_at,
        kind: "update",
      }));
      const merged = [...rows, ...updates].sort(
        (a, b) => new Date(b.published_at) - new Date(a.published_at),
      );
      const page = merged.slice(0, 50);
      return json(res, 200, {
        posts: await decorate(db, page, user?.id),
        next: merged.length > 50 ? page.at(-1).published_at : null,
      });
    }
    if (action === "post" && req.method === "POST") {
      const v = memberPostInput(b),
        postId = randomUUID();
      const recent = await db.query(
        "SELECT 1 FROM con.member_posts WHERE user_id=$1 AND created_at>now()-interval '10 seconds' LIMIT 1",
        [user.id],
      );
      if (recent.rowCount)
        throw new AppError(429, "Wait a few seconds before posting again.");
      await db.query(
        "INSERT INTO con.member_posts(id,user_id,title,body,image_url)VALUES($1,$2,$3,$4,$5)",
        [postId, user.id, v.title, v.body, v.image_url],
      );
      return json(res, 201, { id: postId });
    }
    const postId = id(url.searchParams.get("id") || b.id);
    const post = await getPost(db, postId, user?.id);
    if (action === "post" && req.method === "GET") {
      const replies = (
        await db.query(
          "SELECT r.*,p.name AS author_name,p.avatar_url FROM con.post_replies r JOIN con.profiles p ON p.user_id=r.user_id WHERE r.post_id=$1 ORDER BY r.created_at LIMIT 300",
          [postId],
        )
      ).rows;
      const grant = user ? await accessFor(session) : null;
      return json(res, 200, {
        post,
        replies,
        can_moderate: Boolean(
          grant?.owner || hasPermission(grant, "updates.delete"),
        ),
      });
    }
    if (action === "post" && req.method === "PUT") {
      if (!post.can_edit)
        throw new AppError(403, "You can edit only your own member posts.");
      const v = memberPostInput(b);
      if (typeof b.pinned !== "boolean" || !Number.isSafeInteger(b.version))
        throw new AppError(400, "Missing post version or pin option.");
      const result = await db.query(
        "UPDATE con.member_posts SET title=$3,body=$4,image_url=$5,pinned=$6,version=version+1,updated_at=now() WHERE id=$1 AND user_id=$2 AND version=$7 RETURNING id",
        [postId, user.id, v.title, v.body, v.image_url, b.pinned, b.version],
      );
      if (!result.rowCount)
        throw new AppError(409, "Post changed. Reload before editing.");
      return json(res, 200, { ok: true });
    }
    if (action === "post" && req.method === "DELETE") {
      const grant = await accessFor(session);
      if (
        post.kind !== "member" ||
        (!post.can_edit &&
          !grant.owner &&
          !hasPermission(grant, "updates.delete"))
      )
        throw new AppError(403, "You cannot delete this post.");
      await db.query("DELETE FROM con.member_posts WHERE id=$1", [postId]);
      await db.query("DELETE FROM con.post_likes WHERE post_id=$1", [postId]);
      await db.query("DELETE FROM con.post_replies WHERE post_id=$1", [postId]);
      return json(res, 200, { ok: true });
    }
    if (action === "like" && req.method === "PUT") {
      if (typeof b.liked !== "boolean")
        throw new AppError(400, "Invalid like.");
      if (b.liked)
        await db.query(
          "INSERT INTO con.post_likes(post_id,user_id)VALUES($1,$2) ON CONFLICT DO NOTHING",
          [postId, user.id],
        );
      else
        await db.query(
          "DELETE FROM con.post_likes WHERE post_id=$1 AND user_id=$2",
          [postId, user.id],
        );
      return json(res, 200, { ok: true });
    }
    if (action === "reply" && req.method === "POST") {
      const body = text(b.body, 2000, true);
      const recent = await db.query(
        "SELECT 1 FROM con.post_replies WHERE user_id=$1 AND created_at>now()-interval '10 seconds' LIMIT 1",
        [user.id],
      );
      if (recent.rowCount)
        throw new AppError(429, "Wait a few seconds before replying again.");
      await db.query(
        "INSERT INTO con.post_replies(id,post_id,user_id,body)VALUES($1,$2,$3,$4)",
        [randomUUID(), postId, user.id, body],
      );
      return json(res, 201, { ok: true });
    }
    if (action === "reply" && req.method === "DELETE") {
      const grant = await accessFor(session);
      const result = await db.query(
        "DELETE FROM con.post_replies WHERE id=$1 AND post_id=$2 AND (user_id=$3 OR $4) RETURNING id",
        [
          id(b.reply_id),
          postId,
          user.id,
          Boolean(grant.owner || hasPermission(grant, "updates.delete")),
        ],
      );
      if (!result.rowCount)
        throw new AppError(403, "You cannot delete this reply.");
      return json(res, 200, { ok: true });
    }
    throw new AppError(405, "Unsupported operation.");
  } catch (e) {
    if (!e.status)
      console.error("Community operation failed", {
        code: e.code || "application",
      });
    return json(res, e.status || 503, {
      error: e.status
        ? e.message
        : "Community service temporarily unavailable.",
    });
  }
}
