import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import {
  socialHandler,
  profileInput,
  memberPostInput,
  canBlog,
} from "../server/social.js";
import { migration, staffMigration, approvalMigration } from "../server/db.js";
import { projectMigration } from "../server/project-schema.js";
import { ORIGIN, seal } from "../server/auth.js";
import { listImages, uploadImage } from "../server/images.js";
import { pinRequest } from "../server/pins.js";
import { controlInput } from "../shared/discord-control.js";
const alice = "123456789012345678",
  bob = "234567890123456789";
process.env.SESSION_SECRET =
  "community-test-session-secret-at-least-32-characters";
const profile = {
  name: "Alice",
  headline: "Product manager",
  bio: "Ideas and stories",
  location: "",
  avatar_url: "",
  cover_url: "",
  links: [{ label: "Website", url: "https://example.com" }],
  show_projects: true,
};
test("creative portfolio validates image links, disciplines and legacy profiles", () => {
  const original = profileInput(profile);
  assert.deepEqual(original.disciplines, []);
  assert.deepEqual(original.portfolio, []);
  assert.equal(original.available_for_work, false);
  const creative = profileInput({
    ...profile,
    disciplines: ["Photographer", "Maker & Craftsperson"],
    available_for_work: true,
    portfolio: [
      { kind: "image", title: "Concert photography", description: "Live music",
        image_url: "https://example.com/photo.jpg", link_url: "" },
      { kind: "craft", title: "Hand-forged knife", description: "Custom steel work",
        image_url: "", link_url: "https://example.com/portfolio" },
    ],
  });
  assert.equal(creative.portfolio.length, 2);
  assert.equal(creative.disciplines[0], "Photographer");
  assert.equal(creative.available_for_work, true);
  assert.throws(() => profileInput({...profile, disciplines: ["Administrator"]}));
  assert.throws(() => profileInput({...profile, portfolio: [{
    kind: "image", title: "Bad", description: "", image_url: "javascript:alert(1)", link_url: "",
  }]}));
  assert.throws(() => profileInput({...profile, portfolio: [{
    kind: "madeup", title: "Bad", description: "", image_url: "", link_url: "",
  }]}));
  assert.throws(() => profileInput({...profile, portfolio: Array(25).fill({
    kind: "image", title: "Too many", description: "", image_url: "", link_url: "",
  })}));
});
test("profile validation rejects unsafe links and oversized content", () => {
  assert.equal(profileInput(profile).name, "Alice");
  for (const patch of [
    { name: "" },
    { bio: "x".repeat(3001) },
    { avatar_url: "javascript:alert(1)" },
    { links: [{ label: "Bad", url: "http://example.com" }] },
    { show_projects: "yes" },
  ])
    assert.throws(() => profileInput({ ...profile, ...patch }));
});
test("member posts, profiles, likes, replies and published transmissions keep ownership and visibility", async () => {
  const pg = new PGlite();
  try {
    await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    await pg.exec(migration);
    await pg.exec(staffMigration);
    await pg.exec(approvalMigration);
    await pg.exec(projectMigration);
    const db = {
      async query(sql, args) {
        const r = await pg.query(sql, args);
        return { ...r, rowCount: r.affectedRows ?? r.rows.length };
      },
    };
    async function call(
      uid,
      action,
      method = "GET",
      body = {},
      extraHeaders = {},
    ) {
      const res = {
        setHeader() {},
        end(s) {
          this.body = JSON.parse(s);
        },
      };
      await socialHandler(
        {
          method,
          url: "/api/social?action=" + action,
          body,
          headers: {
            origin: ORIGIN,
            ...(uid
              ? {
                  cookie:
                    "__Host-con_session=" +
                    (await seal(
                      {
                        user: {
                          id: uid,
                          name: uid === alice ? "Alice" : "Bob",
                          username: uid === alice ? "alice" : "bob",
                        },
                      },
                      60,
                    )),
                }
              : {}),
            ...extraHeaders,
          },
        },
        res,
        () => db,
      );
      return res;
    }
    assert.equal(
      (await call(null, "post", "POST", { body: "Hello" })).statusCode,
      401,
    );
    assert.equal(
      (
        await call(alice, "profile", "PUT", profile, {
          origin: "https://evil.example",
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await call(alice, "profile", "PUT", profile)).statusCode,
      200,
    );
    assert.equal(
      (
        await call(alice, "post", "POST", {
          body: "x".repeat(1201),
          can_blog: true,
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await call(alice, "post", "POST", {
          title: "Not a member feature",
          body: "Short",
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await call(alice, "profile&id=" + alice)).body.can_blog,
      false,
    );
    const created = await call(alice, "post", "POST", {
      title: "",
      body: "Hello community",
      image_url: "https://example.com/photo.png",
    });
    assert.equal(created.statusCode, 201);
    const postId = created.body.id;
    const publicPost = (await call(null, "post&id=" + postId)).body.post;
    assert.equal(publicPost.image_url, "https://example.com/photo.png");
    assert.equal(publicPost.author_id, alice);
    assert.equal(publicPost.can_edit, false);
    const edit = {
      id: postId,
      title: "",
      body: "Changed",
      image_url: "",
      version: 1,
      pinned: true,
    };
    assert.equal(
      (await call(alice, "post", "PUT", { ...edit, body: "x".repeat(1201) }))
        .statusCode,
      400,
    );
    assert.equal((await call(bob, "post", "PUT", edit)).statusCode, 403);
    assert.equal((await call(alice, "post", "PUT", edit)).statusCode, 200);
    assert.equal((await call(alice, "post", "PUT", edit)).statusCode, 409);
    assert.equal(
      (await call(bob, "like", "PUT", { id: postId, liked: true })).statusCode,
      200,
    );
    await call(bob, "like", "PUT", { id: postId, liked: true });
    assert.equal((await call(bob, "post&id=" + postId)).body.post.likes, 1);
    assert.equal(
      (await call(bob, "reply", "POST", { id: postId, body: "Great work!" }))
        .statusCode,
      201,
    );
    const reply = (await call(null, "post&id=" + postId)).body.replies[0];
    assert.equal(
      (await call(alice, "reply", "DELETE", { id: postId, reply_id: reply.id }))
        .statusCode,
      403,
    );
    assert.equal(
      (await call(bob, "reply", "DELETE", { id: postId, reply_id: reply.id }))
        .statusCode,
      200,
    );
    const projectId = randomUUID();
    await db.query(
      "INSERT INTO con.projects(id,owner_id,owner_name,draft,published,status)VALUES($1,$2,'Alice',$3,$3,'approved')",
      [projectId, alice, JSON.stringify({ title: "My app", body: "Project" })],
    );
    assert.equal(
      (await call(null, "profile&id=" + alice)).body.projects.length,
      1,
    );
    await call(alice, "profile", "PUT", { ...profile, show_projects: false });
    assert.equal(
      (await call(null, "profile&id=" + alice)).body.projects.length,
      0,
    );
    const transmission = randomUUID();
    await db.query(
      "INSERT INTO con.posts(id,kind,body,author_id,author_name,published_at,published_snapshot)VALUES($1,'update','Unsaved draft',$2,'Alice',now(),$3)",
      [
        transmission,
        alice,
        JSON.stringify({
          title: "Announcement",
          body: "Published copy",
          image_url: "https://example.com/banner.png",
          author_name: "Alice",
        }),
      ],
    );
    assert.equal(
      (await call(null, "post&id=" + transmission)).body.post.body,
      "Published copy",
    );
    const profilePosts = (await call(null, "profile&id=" + alice)).body.posts;
    assert.equal(profilePosts.length, 1);
    assert.ok(profilePosts.every(p => p.kind === "member"));
    assert.equal(profilePosts[0].id, postId);
    const highlights = await call(null, "top_member_posts");
    assert.equal(highlights.statusCode, 200);
    assert.equal(highlights.body.posts.length, 1);
    assert.equal(highlights.body.posts[0].id, postId);
    assert.equal(highlights.body.posts[0].likes, 1);
    const feed = (await call(null, "feed")).body.posts;
    assert.equal(feed.length, 1);
    assert.ok(feed.every((p) => p.kind === "update"));
    assert.ok(!feed.some((p) => p.id === postId));
    assert.ok(feed.some((p) => p.id === transmission));
    // Subcons are namespaced, creator-owned, and vote totals are user-specific.
    const createdCommunity = await call(bob, "community", "POST", {
      slug: "homelab", name: "Home Lab", description: "Show us your setup",
    });
    assert.equal(createdCommunity.statusCode, 201);
    assert.equal(createdCommunity.body.community.slug, "homelab");
    assert.equal((await call(alice, "community", "POST", {
      slug: "homelab", name: "Impersonation", description: "",
    })).statusCode, 409);
    assert.equal((await call(alice, "community", "PUT", {
      slug: "homelab", name: "Hijacked", description: "",
    })).statusCode, 403);
    assert.equal((await call(bob, "community", "PUT", {
      slug: "homelab", name: "Home Lab", description: "Hardware and software",
    })).statusCode, 200);
    const submission = await call(bob, "post", "POST", {
      title: "My lab build", body: "Servers and cables", community_slug: "homelab",
    });
    assert.equal(submission.statusCode, 201, JSON.stringify(submission.body));
    const communityPost = submission.body.id;
    const subnet = (await call(null, "feed&community=homelab")).body.posts;
    assert.equal(subnet.length, 1);
    assert.equal(subnet[0].id, communityPost);
    assert.equal(subnet[0].community_slug, "homelab");
    const vote = await call(alice, "vote", "PUT", { id: communityPost, value: 1 });
    assert.equal(vote.statusCode, 200);
    assert.equal(vote.body.score, 1);
    assert.equal((await call(alice, "feed&community=homelab")).body.posts[0].vote, 1);
    assert.equal((await call(bob, "vote", "PUT", { id: communityPost, value: -1 })).body.score, 0);
    assert.equal((await call(null, "feed&community=homelab")).body.posts[0].score, 0);
    assert.equal((await call(alice, "vote", "PUT", { id: communityPost, value: 0 })).body.score, -1);
    assert.equal((await call(null, "post&id=" + communityPost)).body.post.title, "My lab build");
    assert.equal((await call(null, "community&slug=homelab")).body.community.creator_id, bob);
    const response = await call(alice, "reply", "POST", { id: communityPost, body: "Nice setup!" });
    assert.equal(response.statusCode, 201);
    const inbox = await call(bob, "inbox");
    assert.equal(inbox.statusCode, 200);
    assert.equal(inbox.body.unread, 1);
    assert.equal(inbox.body.notifications[0].post_id, communityPost);
    const noticeId = inbox.body.notifications[0].id;
    assert.equal((await call(alice, "inbox", "PUT", { id: noticeId })).statusCode, 404);
    assert.equal((await call(bob, "inbox", "PUT", { id: noticeId })).statusCode, 200);
    assert.equal((await call(bob, "inbox")).body.unread, 0);
    const linkEdit = await call(bob, "post", "PUT", {
      id: communityPost, version: 1, pinned: false, title: "My lab build",
      body: "", link_url: "https://example.com/build", image_url: "",
      video_url: "https://example.com/demo.mp4", notify_replies: false,
    });
    assert.equal(linkEdit.statusCode, 200);
    const editedPost = (await call(null, "post&id=" + communityPost)).body.post;
    assert.equal(editedPost.link_url, "https://example.com/build");
    assert.equal(editedPost.video_url, "https://example.com/demo.mp4");
    assert.equal(editedPost.notify_replies, false);
    await db.query("UPDATE con.post_replies SET created_at=now()-interval '20 seconds' WHERE id=$1", [response.body.id]);
    const child = await call(bob, "reply", "POST", {
      id: communityPost, parent_id: response.body.id, body: "Thanks Alice!",
    });
    assert.equal(child.statusCode, 201);
    assert.equal((await call(alice, "inbox_count")).body.unread, 1);
    assert.equal((await call(alice, "inbox")).body.notifications[0].reply_id, child.body.id);
    await db.query("UPDATE con.post_replies SET created_at=now()-interval '20 seconds' WHERE id=$1", [child.body.id]);
    const grandchild = await call(alice, "reply", "POST", {
      id: communityPost, parent_id: child.body.id, body: "You're welcome!",
    });
    assert.equal(grandchild.statusCode, 201);
    const nested = (await call(null, "post&id=" + communityPost)).body.replies;
    assert.equal(nested.find(r => r.id === child.body.id).parent_id, response.body.id);
    assert.equal(nested.find(r => r.id === grandchild.body.id).parent_id, child.body.id);
    assert.equal((await call(bob, "inbox_count")).body.unread, 0);
    assert.equal((await call(alice, "reply", "POST", {
      id: communityPost, parent_id: randomUUID(), body: "Invalid parent",
    })).statusCode, 400);
    assert.equal((await call(alice, "reply", "DELETE", {
      id: communityPost, reply_id: response.body.id,
    })).statusCode, 200);
    const afterRemove = (await call(null, "post&id=" + communityPost)).body.replies;
    assert.equal(afterRemove.find(r => r.id === response.body.id).body, "[deleted]");
    assert.equal(afterRemove.find(r => r.id === child.body.id).parent_id, response.body.id);
    assert.equal((await call(alice, "reply", "POST", {
      id: communityPost, parent_id: response.body.id, body: "Deleted parent",
    })).statusCode, 400);
    assert.equal((await call(bob, "post", "DELETE", {id:communityPost})).statusCode, 200);



    await db.query("UPDATE con.posts SET published_at=NULL WHERE id=$1", [
      transmission,
    ]);
    assert.equal((await call(null, "post&id=" + transmission)).statusCode, 404);
    assert.equal(
      (await call(bob, "post", "DELETE", { id: postId })).statusCode,
      403,
    );
    assert.equal(
      (await call(alice, "post", "DELETE", { id: postId })).statusCode,
      200,
    );
    assert.equal((await call(null, "post&id=" + postId)).statusCode, 404);
    const security = await db.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid='con.member_posts'::regclass",
    );
    assert.equal(security.rows[0].relrowsecurity, true);
  } finally {
    await pg.close();
  }
});
test("named shared images are visible to staff while member uploads stay out of the picker", async () => {
  const pg = new PGlite();
  try {
    await pg.exec("CREATE SCHEMA con");
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
    await uploadImage(
      pg,
      { data: png, name: "Announcement" },
      { user: { id: alice } },
    );
    await uploadImage(
      pg,
      { data: png, name: "Avatar" },
      { user: { id: bob } },
      false,
    );
    const images = await listImages(pg);
    assert.equal(images.length, 1);
    assert.equal(images[0].name, "Announcement");
    assert.ok(images[0].image_url.startsWith(ORIGIN));
    await assert.rejects(
      uploadImage(pg, { data: png, name: "   " }, { user: { id: alice } }),
    );
  } finally {
    await pg.close();
  }
});
test("pin commands validate exact targets and refuse staff without destination access", async () => {
  assert.throws(() =>
    controlInput("messages.pin", {
      channel_id: "arbitrary",
      message_id: alice,
      pinned: true,
      reason: "Pin",
    }),
  );
  assert.throws(() =>
    controlInput("messages.pin", {
      channel_id: bob,
      message_id: alice,
      pinned: "yes",
      reason: "Pin",
    }),
  );
  assert.equal(
    controlInput("messages.pin", {
      channel_id: bob,
      message_id: alice,
      pinned: true,
      reason: "Pin",
    }).pinned,
    true,
  );
  const db = {
    query: async () => ({
      rows: [
        {
          message_id: alice,
          channel_id: bob,
          kind: "update",
          webhook_id: "restricted",
        },
      ],
    }),
  };
  await assert.rejects(
    pinRequest(
      db,
      {
        method: "POST",
        url: "/api/admin?action=pin",
        body: { delivery_id: randomUUID(), pinned: true },
      },
      {
        user: { id: alice },
        permissions: ["updates.publish"],
        all_channels: false,
        channel_ids: [],
      },
    ),
    (e) => e.status === 403,
  );
});

test("regular member posts stop at 1200 characters; approved staff retain blog posts", () => {
  assert.equal(memberPostInput({ body: "x".repeat(1200) }).body.length, 1200);
  assert.throws(() => memberPostInput({ body: "x".repeat(1201) }));
  assert.throws(() => memberPostInput({ title: "Blog title", body: "Short" }));
  assert.equal(canBlog({ authorized: true, access: "moderator" }), true);
  assert.equal(canBlog({ authorized: true, access: "admin" }), true);
  assert.equal(canBlog({ authorized: false, access: "moderator" }), false);
  assert.equal(canBlog({ authorized: true, access: "report" }), false);
  assert.equal(
    memberPostInput({ title: "Blog title", body: "x".repeat(10000) }, true).body
      .length,
    10000,
  );
  assert.throws(() => memberPostInput({ body: "x".repeat(10001) }, true));
});
