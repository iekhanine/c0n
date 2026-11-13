import { authorAvatars } from "./author-avatars.js";
import { randomUUID } from "node:crypto";
import { database } from "./db.js";
import { json, ORIGIN, readSession, accessFor } from "./auth.js";
import { lookupStaff } from "./staff.js";
import { AppError, id, httpsUrl } from "./content.js";
import { uploadImage } from "./images.js";
import { hasPermission } from "../shared/permissions.js";
export const socialSchema = [
  "CREATE TABLE IF NOT EXISTS con.profiles(user_id text PRIMARY KEY, name text NOT NULL, username text NOT NULL, avatar_url text NOT NULL DEFAULT '', cover_url text NOT NULL DEFAULT '', headline text NOT NULL DEFAULT '', bio text NOT NULL DEFAULT '', location text NOT NULL DEFAULT '', links jsonb NOT NULL DEFAULT '[]', show_projects boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS con.member_posts(id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES con.profiles(user_id), title text NOT NULL DEFAULT '', body text NOT NULL, image_url text NOT NULL DEFAULT '', pinned boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())",
  "ALTER TABLE con.profiles ADD COLUMN IF NOT EXISTS disciplines jsonb NOT NULL DEFAULT '[]'::jsonb",
  "ALTER TABLE con.profiles ADD COLUMN IF NOT EXISTS portfolio jsonb NOT NULL DEFAULT '[]'::jsonb",
  "ALTER TABLE con.profiles ADD COLUMN IF NOT EXISTS available_for_work boolean NOT NULL DEFAULT false",
  "CREATE INDEX IF NOT EXISTS con_member_posts_user ON con.member_posts(user_id,created_at DESC)",
  "CREATE TABLE IF NOT EXISTS con.post_likes(post_id uuid NOT NULL, user_id text NOT NULL, PRIMARY KEY(post_id,user_id))",
  "CREATE TABLE IF NOT EXISTS con.post_replies(id uuid PRIMARY KEY, post_id uuid NOT NULL,user_id text NOT NULL REFERENCES con.profiles(user_id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())",
  "CREATE INDEX IF NOT EXISTS con_post_replies_post ON con.post_replies(post_id,created_at)",
  "CREATE TABLE IF NOT EXISTS con.communities(slug text PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9_]{2,23}$'), name text NOT NULL CHECK (length(name) BETWEEN 3 AND 80), description text NOT NULL DEFAULT '', creator_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())",
  "ALTER TABLE con.member_posts ADD COLUMN IF NOT EXISTS community_slug text REFERENCES con.communities(slug)",
  "CREATE INDEX IF NOT EXISTS con_member_posts_community ON con.member_posts(community_slug,created_at DESC) WHERE community_slug IS NOT NULL",
  "CREATE TABLE IF NOT EXISTS con.post_votes(post_id uuid NOT NULL,user_id text NOT NULL,value smallint NOT NULL CHECK (value IN (-1,1)),PRIMARY KEY(post_id,user_id))",
  "ALTER TABLE con.member_posts ADD COLUMN IF NOT EXISTS link_url text NOT NULL DEFAULT ''",
  "ALTER TABLE con.member_posts ADD COLUMN IF NOT EXISTS video_url text NOT NULL DEFAULT ''",
  "ALTER TABLE con.member_posts ADD COLUMN IF NOT EXISTS notify_replies boolean NOT NULL DEFAULT true",
  "CREATE TABLE IF NOT EXISTS con.reply_notifications(id uuid PRIMARY KEY,post_id uuid NOT NULL,user_id text NOT NULL,actor_id text NOT NULL,actor_name text NOT NULL,reply_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz)",
  "CREATE INDEX IF NOT EXISTS con_reply_notifications_inbox ON con.reply_notifications(user_id,created_at DESC)",

  "INSERT INTO con.communities(slug,name,description,creator_id) VALUES\n('community','Community','General discussion, ideas and announcements.','system'),\n('technology','Technology','Hardware, software and tech discussion.','system'),\n('programming','Programming','Code, debugging and projects in progress.','system'),\n('gaming','Gaming','Games, multiplayer and everything in between.','system'),\n('projects','Projects','Show what you are building.','system'),\n('help','Help','Questions, advice and technical support.','system'),\n('creative','Creative','Design, art, audio and content creation.','system'),\n('offtopic','Off Topic','Everything that does not belong elsewhere.','system')\nON CONFLICT (slug) DO NOTHING",
  ...["profiles","member_posts","post_likes","post_replies","communities","post_votes","reply_notifications"].map((t) => `ALTER TABLE con.${t} ENABLE ROW LEVEL SECURITY`),
  ...["profiles","member_posts","post_likes","post_replies","communities","post_votes"].map((t) => `REVOKE ALL ON con.${t} FROM PUBLIC`),
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
const communitySlug = (value) => {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{2,23}$/.test(value))
    throw new AppError(400, "Use 3–24 lowercase letters, numbers or underscores; begin with a letter.");
  return value;
};
const userId = (value) => {
  if (typeof value !== "string" || !/^\d{17,20}$/.test(value))
    throw new AppError(400, "Invalid member ID.");
  return value;
};
export const disciplines = [
  "Developer", "Designer", "Artist", "Photographer", "Videographer",
  "Musician", "Writer", "Maker & Craftsperson", "Business & Marketing",
  "Project Manager", "Game Creator", "Other",
];
const portfolioKinds = new Set(["image", "website", "video", "game", "craft", "project", "other"]);
function profilePortfolio(items) {
  if (!Array.isArray(items) || items.length > 24)
    throw new AppError(400, "Add up to 24 portfolio pieces.");
  return items.map(item => {
    if (!item || typeof item !== "object" || !portfolioKinds.has(item.kind))
      throw new AppError(400, "Choose a valid type of work.");
    return {
      kind: item.kind,
      title: text(item.title, 120, true),
      description: text(item.description ?? "", 600),
      image_url: httpsUrl(item.image_url ?? ""),
      link_url: httpsUrl(item.link_url ?? ""),
    };
  });
}
export function profileInput(b) {
  if (
    !Array.isArray(b.links) ||
    b.links.length > 8 ||
    typeof b.show_projects !== "boolean"
  )
    throw new AppError(400, "Use up to eight social links.");
  if (!Array.isArray(b.disciplines ?? []) || (b.disciplines ?? []).length > 6 ||
      (b.disciplines ?? []).some(d => !disciplines.includes(d)) ||
      ![true, false].includes(b.available_for_work ?? false))
    throw new AppError(400, "Choose up to six creative disciplines.");
  return {
    name: text(b.name, 80, true),
    headline: text(b.headline, 160),
    bio: text(b.bio, 3000),
    location: text(b.location, 100),
    avatar_url: httpsUrl(b.avatar_url),
    cover_url: httpsUrl(b.cover_url),
    show_projects: b.show_projects,
    disciplines: [...new Set(b.disciplines ?? [])],
    portfolio: profilePortfolio(b.portfolio ?? []),
    available_for_work: b.available_for_work ?? false,
    links: b.links.map((l) => ({
      label: text(l.label, 40, true),
      url: httpsUrl(text(l.url, 2000, true)),
    })),
  };
}
export const canBlog = (grant) =>
  Boolean(
    grant?.owner ||
    (grant?.authorized && ["admin", "moderator"].includes(grant.access)),
  );
export function memberPostInput(b, blog = false) {
  if (!blog && b.title)
    throw new AppError(400, "Member posts do not use titles.");
  if (b.notify_replies !== undefined && typeof b.notify_replies !== "boolean")
    throw new AppError(400, "Invalid reply notification preference.");
  const link_url = httpsUrl(b.link_url ?? "");
  const video_url = httpsUrl(b.video_url ?? "");
  const body = text(b.body ?? "", blog ? 10000 : 1200, !link_url);
  if (video_url && !/^https:\/\/[^\s?#]+\.(mp4|webm)(?:[?#].*)?$/i.test(video_url))
    throw new AppError(400, "Use a direct HTTPS MP4 or WebM video URL.");
  return {
    title: text(b.title ?? "", 200),
    body,
    image_url: httpsUrl(b.image_url ?? ""),
    link_url,
    video_url,
    notify_replies: b.notify_replies === undefined ? true : b.notify_replies,
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
const memberSelect = `SELECT m.id,m.user_id AS author_id,p.name AS author_name,p.username,p.avatar_url,m.title,m.body,m.image_url,m.pinned,m.version,m.community_slug,m.link_url,m.video_url,m.notify_replies,m.created_at AS published_at,m.updated_at,'member' AS kind FROM con.member_posts m JOIN con.profiles p ON p.user_id=m.user_id`;
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
  const votes = (await db.query(
    "SELECT post_id,coalesce(sum(value),0)::int AS score,coalesce(max(CASE WHEN user_id=$2 THEN value END),0)::int AS vote FROM con.post_votes WHERE post_id=ANY($1::uuid[]) GROUP BY post_id",
    [ids, viewer || ""],
  )).rows;
  const avatars = await authorAvatars(db, posts.map(p => p.author_id));
  return posts.map((p) => ({
    ...p,
    avatar_url: avatars.get(p.author_id) || p.avatar_url || "",
    likes: likes.find((l) => l.post_id === p.id)?.n || 0,
    liked: likes.find((l) => l.post_id === p.id)?.liked || false,
    replies: replies.find((r) => r.post_id === p.id)?.n || 0,
    score: votes.find((v) => v.post_id === p.id)?.score || 0,
    vote: votes.find((v) => v.post_id === p.id)?.vote || 0,
    community_slug: p.community_slug || "community",
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
        community_slug: "community",
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
    if (action === "inbox" && req.method === "GET") {
      if (!user) throw new AppError(401, "Sign in to see your inbox.");
      const items = (await db.query(
        "SELECT id,post_id,actor_id,actor_name,created_at,read_at FROM con.reply_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [user.id],
      )).rows;
      return json(res, 200, { notifications: items, unread: items.filter(n => !n.read_at).length });
    }
    if (action === "inbox" && req.method === "PUT") {
      const notificationId = id(b.id);
      const result = await db.query(
        "UPDATE con.reply_notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id",
        [notificationId,user.id],
      );
      if (!result.rowCount) throw new AppError(404, "Notification not found.");
      return json(res, 200, { ok:true });
    }
    if (action === "communities" && req.method === "GET") {
      const communities = (await db.query(
        "SELECT c.slug,c.name,c.description,c.creator_id,c.created_at,(SELECT count(*)::int FROM con.member_posts m WHERE m.community_slug=c.slug) AS post_count FROM con.communities c ORDER BY CASE WHEN c.slug='community' THEN 0 ELSE 1 END,c.slug",
      )).rows;
      return json(res, 200, { communities });
    }
    if (action === "community" && req.method === "GET") {
      const slug = communitySlug(url.searchParams.get("slug"));
      const community = (await db.query("SELECT * FROM con.communities WHERE slug=$1", [slug])).rows[0];
      if (!community) throw new AppError(404, "Community not found.");
      return json(res, 200, { community });
    }
    if (action === "community" && req.method === "POST") {
      const slug = communitySlug(b.slug);
      const name = text(b.name, 80, true);
      const description = text(b.description ?? "", 2000);
      if (name.length < 3) throw new AppError(400, "Community name must be at least three characters.");
      const recent = await db.query(
        "SELECT count(*)::int AS n FROM con.communities WHERE creator_id=$1 AND created_at>now()-interval '24 hours'",
        [user.id],
      );
      if (Number(recent.rows[0].n) >= 3) throw new AppError(429, "You can create up to three communities per day.");
      const created = await db.query(
        "INSERT INTO con.communities(slug,name,description,creator_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *",
        [slug,name,description,user.id],
      );
      if (!created.rowCount) throw new AppError(409, "That community name is taken.");
      return json(res, 201, { community: created.rows[0] });
    }
    if (action === "community" && req.method === "PUT") {
      const slug = communitySlug(b.slug);
      const description = text(b.description ?? "", 2000);
      const name = text(b.name, 80, true);
      const grant = await accessFor(session);
      const updated = await db.query(
        "UPDATE con.communities SET name=$2,description=$3 WHERE slug=$1 AND (creator_id=$4 OR $5) RETURNING *",
        [slug,name,description,user.id,Boolean(grant.owner)],
      );
      if (!updated.rowCount) throw new AppError(403, "Only the creator or site owner can edit this community.");
      return json(res, 200, { community: updated.rows[0] });
    }
    if (action === "directory" && req.method === "GET")
      return json(res, 200, {
        profiles: (
          await db.query(
            "SELECT user_id,name,username,avatar_url,headline,bio,location,disciplines,available_for_work,portfolio FROM con.profiles ORDER BY updated_at DESC LIMIT 200",
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
          disciplines: [], portfolio: [], available_for_work: false,
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
      // Profile timelines contain only the member's short social posts.
      // Admin/mod transmissions are editorial content, shown on the home/community feeds.
      const posts = await decorate(db, memberPosts, user?.id);
      return json(res, 200, {
        profile,
        projects,
        posts,
        own: uid === user?.id,
        can_blog: user
          ? canBlog(await accessFor(session, (uid) => lookupStaff(uid, db)))
          : false,
      });
    }
    if (action === "profile" && req.method === "PUT") {
      const v = profileInput(b);
      await db.query(
        "UPDATE con.profiles SET name=$2,headline=$3,bio=$4,location=$5,avatar_url=$6,cover_url=$7,links=$8::jsonb,show_projects=$9,disciplines=$10::jsonb,portfolio=$11::jsonb,available_for_work=$12,updated_at=now() WHERE user_id=$1",
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
          JSON.stringify(v.disciplines),
          JSON.stringify(v.portfolio),
          v.available_for_work,
        ],
      );
      return json(res, 200, { ok: true });
    }
    if (action === "top_member_posts" && req.method === "GET") {
      // Public, bounded and text-only. Likes determine ranking, newest breaks ties.
      const top = (await db.query(
        `SELECT m.id,m.user_id AS author_id,p.name AS author_name,p.username,
          m.body,m.created_at AS published_at,
          (SELECT count(*)::int FROM con.post_likes l WHERE l.post_id=m.id) AS likes
          FROM con.member_posts m JOIN con.profiles p ON p.user_id=m.user_id
          ORDER BY likes DESC,m.created_at DESC LIMIT 5`,
      )).rows;
      const avatars = await authorAvatars(db, top.map(p => p.author_id));
      return json(res, 200, { posts: top.map(p => ({
        ...p, avatar_url: avatars.get(p.author_id) || "",
      })) });
    }
    if (action === "feed" && req.method === "GET") {
      const before = url.searchParams.get("before");
      if (before && !Number.isFinite(Date.parse(before)))
        throw new AppError(400, "Invalid page cursor.");
      const slug = url.searchParams.get("community");
      if (slug) {
        communitySlug(slug);
        const exists = await db.query("SELECT 1 FROM con.communities WHERE slug=$1", [slug]);
        if (!exists.rowCount) throw new AppError(404, "Community not found.");
      }
      const updates = slug && slug !== "community" ? [] : (
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
        community_slug: "community",
      }));
      const memberRows = (await db.query(
        memberSelect + " WHERE m.community_slug IS NOT NULL AND ($1::text IS NULL OR m.community_slug=$1) AND m.created_at < $2::timestamptz ORDER BY m.created_at DESC LIMIT 51",
        [slug || null, before || "infinity"],
      )).rows;
      const merged = [...updates, ...memberRows].sort((a,b) => Date.parse(b.published_at)-Date.parse(a.published_at));
      const page = merged.slice(0, 50);
      return json(res, 200, {
        posts: await decorate(db, page, user?.id),
        next: merged.length > 50 ? page.at(-1).published_at : null,
      });
    }
    if (action === "post" && req.method === "POST") {
      const community = b.community_slug ? communitySlug(b.community_slug) : null;
      if (community) {
        const exists = await db.query("SELECT 1 FROM con.communities WHERE slug=$1", [community]);
        if (!exists.rowCount) throw new AppError(404, "Community not found.");
        if (!text(b.title, 200, true)) throw new AppError(400, "Community posts need a title.");
      }
      const v = memberPostInput(
          b,
          Boolean(community) || canBlog(await accessFor(session, (uid) => lookupStaff(uid, db))),
        ),
        postId = randomUUID();
      const recent = await db.query(
        "SELECT 1 FROM con.member_posts WHERE user_id=$1 AND created_at>now()-interval '10 seconds' LIMIT 1",
        [user.id],
      );
      if (recent.rowCount)
        throw new AppError(429, "Wait a few seconds before posting again.");
      await db.query(
        "INSERT INTO con.member_posts(id,user_id,title,body,image_url,community_slug,link_url,video_url,notify_replies)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [postId, user.id, v.title, v.body, v.image_url, community, v.link_url, v.video_url, v.notify_replies],
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
        can_blog: canBlog(grant),
        can_moderate: Boolean(
          grant?.owner || hasPermission(grant, "updates.delete"),
        ),
      });
    }
    if (action === "post" && req.method === "PUT") {
      if (!post.can_edit)
        throw new AppError(403, "You can edit only your own member posts.");
      const v = memberPostInput(
        b,
        Boolean(post.community_slug && post.community_slug !== "community") || Boolean(post.title) || canBlog(await accessFor(session, (uid) => lookupStaff(uid, db))),
      );
      if (typeof b.pinned !== "boolean" || !Number.isSafeInteger(b.version))
        throw new AppError(400, "Missing post version or pin option.");
      const result = await db.query(
        "UPDATE con.member_posts SET title=$3,body=$4,image_url=$5,pinned=$6,version=version+1,updated_at=now(),link_url=$8,video_url=$9,notify_replies=$10 WHERE id=$1 AND user_id=$2 AND version=$7 RETURNING id",
        [postId, user.id, v.title, v.body, v.image_url, b.pinned, b.version, v.link_url, v.video_url, v.notify_replies],
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
      await db.query("DELETE FROM con.reply_notifications WHERE post_id=$1", [postId]);
      await db.query("DELETE FROM con.post_votes WHERE post_id=$1", [postId]);
      await db.query("DELETE FROM con.member_posts WHERE id=$1", [postId]);
      await db.query("DELETE FROM con.post_likes WHERE post_id=$1", [postId]);
      await db.query("DELETE FROM con.post_replies WHERE post_id=$1", [postId]);
      return json(res, 200, { ok: true });
    }
    if (action === "vote" && req.method === "PUT") {
      if (![-1,0,1].includes(b.value) || typeof b.value !== "number")
        throw new AppError(400, "Invalid vote.");
      if (b.value === 0) {
        await db.query("DELETE FROM con.post_votes WHERE post_id=$1 AND user_id=$2", [postId,user.id]);
      } else {
        await db.query(
          "INSERT INTO con.post_votes(post_id,user_id,value)VALUES($1,$2,$3) ON CONFLICT(post_id,user_id) DO UPDATE SET value=EXCLUDED.value",
          [postId,user.id,b.value],
        );
      }
      const score = (await db.query("SELECT coalesce(sum(value),0)::int AS score FROM con.post_votes WHERE post_id=$1",[postId])).rows[0].score;
      return json(res, 200, { score, vote: b.value });
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
      const replyId = randomUUID();
      await db.query(
        "INSERT INTO con.post_replies(id,post_id,user_id,body)VALUES($1,$2,$3,$4)",
        [replyId, postId, user.id, body],
      );
      if (post.kind === "member" && post.author_id !== user.id) {
        await db.query(
          "INSERT INTO con.reply_notifications(id,post_id,user_id,actor_id,actor_name,reply_id) SELECT $1,m.id,m.user_id,$2,$3,$4 FROM con.member_posts m WHERE m.id=$5 AND m.notify_replies=true",
          [randomUUID(),user.id,user.name,replyId,postId],
        );
      }
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
      await db.query("DELETE FROM con.reply_notifications WHERE reply_id=$1 AND post_id=$2", [id(b.reply_id),postId]);
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
