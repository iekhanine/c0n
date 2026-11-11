import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { databaseStatus, initializeDatabase } from "../server/db.js";
import {
  postInput,
  webhookUrl,
  encryptWebhook,
  decryptWebhook,
  deliveryAction,
  discordPayload,
} from "../server/content.js";
import { publish, reconcile, adminHandler } from "../server/admin.js";

process.env.SESSION_SECRET =
  "a-test-only-encryption-secret-at-least-thirty-two-characters";
process.env.WEBHOOK_ENCRYPTION_KEY =
  "another-test-only-encryption-key-at-least-thirty-two-characters";
const hookUrl = `https://discord.com/api/webhooks/123456789012345678/${"a".repeat(60)}`;
const channel = "234567890123456789";

test("input validation blocks arbitrary webhook destinations and unsafe links", () => {
  for (const value of [
    "https://evil.example/api/webhooks/123/abc",
    hookUrl + "?x=1",
    hookUrl.replace("https:", "http:"),
    "https://discord.com@evil.example/webhooks/123/abc",
    hookUrl.replace("discord.com", "discord.com.evil.example"),
  ])
    assert.throws(() => webhookUrl(value));
  assert.equal(webhookUrl(hookUrl), hookUrl);
  assert.throws(() =>
    postInput({
      kind: "update",
      body: "hello",
      link_url: "javascript:alert(1)",
    }),
  );
  assert.throws(() =>
    postInput({ kind: "project", title: "", body: "Project" }),
  );
  assert.throws(() => postInput({ kind: "update", body: " " }));
  assert.throws(() => postInput({ kind: "update", body: "a".repeat(1801) }));
});
test("webhook ciphertext is authenticated and non-deterministic", () => {
  const a = encryptWebhook(hookUrl),
    b = encryptWebhook(hookUrl);
  assert.notEqual(a, b);
  assert.equal(a.includes("discord.com"), false);
  assert.equal(decryptWebhook(a), hookUrl);
  const pieces = a.split(".");
  pieces[1] = Buffer.alloc(16).toString("base64url");
  assert.throws(() => decryptWebhook(pieces.join(".")));
});
test("embeds suppress mentions and keep logo inside the card", () => {
  const payload = discordPayload({
    kind: "update",
    body: "@everyone Hello",
    author_name: "Test",
    title: "News",
  });
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.equal(
    payload.embeds[0].thumbnail.url,
    "https://c0n.ivansays.com/con-logo.png",
  );
  assert.deepEqual(payload.attachments, []);
  assert.throws(() => deliveryAction({ state: "uncertain" }));
  assert.equal(deliveryAction({ state: "failed", message_id: "123" }), "edit");
});
test("mutations reject cross-origin and anonymous requests before touching database", async () => {
  const response = () => ({
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(body) {
      this.body = body;
    },
  });
  let res = response();
  await adminHandler(
    {
      method: "POST",
      url: "/api/admin?action=setup",
      headers: { origin: "https://evil.example" },
      body: {},
    },
    res,
  );
  assert.equal(res.statusCode, 403);
  res = response();
  await adminHandler(
    { method: "GET", url: "/api/admin?action=webhooks", headers: {} },
    res,
  );
  assert.equal(res.statusCode, 401);
});

test("database migration and delivery lifecycle", async (t) => {
  const pg = new PGlite();
  await pg.exec(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE public.existing_app(id int); INSERT INTO public.existing_app VALUES(7);",
  );
  const db = {
    async query(sql, args) {
      const result =
        !args && sql.split(";").length > 2
          ? (await pg.exec(sql)).at(-1)
          : await pg.query(sql, args);
      return {
        ...result,
        rowCount: result.rows.length || result.affectedRows || 0,
      };
    },
    async connect() {
      return { query: this.query.bind(this), release() {} };
    },
  };
  async function seed() {
    await pg.exec("TRUNCATE con.deliveries,con.posts,con.webhooks;");
    const postId = randomUUID(),
      webhookId = randomUUID();
    await db.query(
      "INSERT INTO con.posts(id,kind,title,body,author_id,author_name) VALUES($1,'update','Test','Hello world','owner','Owner')",
      [postId],
    );
    await db.query(
      "INSERT INTO con.webhooks(id,name,url_cipher,discord_id,channel_id,guild_id,created_by) VALUES($1,'transmissions',$2,'123456789012345678',$3,'345678901234567890','owner')",
      [webhookId, encryptWebhook(hookUrl), channel],
    );
    return {
      post_id: postId,
      webhook_id: webhookId,
      version: 1,
      website: true,
    };
  }
  try {
    await t.test(
      "refuses an unrelated schema, then migrates idempotently without changing public tables",
      async () => {
        assert.deepEqual(await databaseStatus(db), {
          connected: true,
          initialized: false,
        });
        await pg.exec("CREATE SCHEMA con; CREATE TABLE con.unrelated(id int);");
        await assert.rejects(initializeDatabase(db), /unrelated/);
        await pg.exec("DROP TABLE con.unrelated;");
        await initializeDatabase(db);
        await initializeDatabase(db);
        assert.deepEqual(await databaseStatus(db), {
          connected: true,
          initialized: true,
        });
        assert.equal(
          (await db.query("SELECT id FROM public.existing_app")).rows[0].id,
          7,
        );
        const permissions = await db.query(
          "SELECT has_schema_privilege('anon','con','USAGE') AS anon, has_schema_privilege('authenticated','con','USAGE') AS authenticated",
        );
        assert.equal(permissions.rows[0].anon, false);
        assert.equal(permissions.rows[0].authenticated, false);
      },
    );
    const original = globalThis.fetch;
    try {
      await t.test(
        "publishes once, persists the message ID, and edits on the next publish",
        async () => {
          const input = await seed();
          const calls = [];
          globalThis.fetch = async (url, options) => {
            calls.push({ url, method: options.method });
            return Response.json({
              id: "456789012345678901",
              channel_id: channel,
            });
          };
          await publish(db, input);
          await publish(db, input);
          assert.equal(calls[0].method, "POST");
          assert.match(calls[0].url, /\?wait=true$/);
          assert.equal(calls[1].method, "PATCH");
          assert.match(calls[1].url, /\/messages\/456789012345678901$/);
          assert.equal(
            (await db.query("SELECT state FROM con.deliveries")).rows[0].state,
            "sent",
          );
        },
      );
      await t.test(
        "a timeout records uncertainty and prevents duplicate sends",
        async () => {
          const input = await seed();
          let calls = 0;
          globalThis.fetch = async () => {
            calls++;
            throw new Error("timeout");
          };
          await assert.rejects(publish(db, input), /unconfirmed/);
          await assert.rejects(publish(db, input), /duplicate/);
          assert.equal(calls, 1);
          assert.equal(
            (await db.query("SELECT state FROM con.deliveries")).rows[0].state,
            "uncertain",
          );
          assert.ok(
            (await db.query("SELECT published_at FROM con.posts")).rows[0]
              .published_at,
          );
        },
      );
      await t.test(
        "rate-limited requests can retry safely without fabricating a message ID",
        async () => {
          const input = await seed();
          globalThis.fetch = async () => new Response("{}", { status: 429 });
          await assert.rejects(publish(db, input), /rate limit/);
          const { rows } = await db.query(
            "SELECT state,message_id FROM con.deliveries",
          );
          assert.equal(rows[0].state, "failed");
          assert.equal(rows[0].message_id, null);
          globalThis.fetch = async () =>
            Response.json({ id: "456789012345678901", channel_id: channel });
          await publish(db, input);
        },
      );
      await t.test(
        "stale previews cannot publish newer content accidentally",
        async () => {
          const input = await seed();
          await db.query("UPDATE con.posts SET version=2 WHERE id=$1", [
            input.post_id,
          ]);
          await assert.rejects(
            publish(db, input),
            /changed since your preview/,
          );
          assert.equal(
            (await db.query("SELECT * FROM con.deliveries")).rowCount,
            0,
          );
        },
      );
      await t.test(
        "website-only publishing never calls Discord; unpublish retains drafts",
        async () => {
          const input = await seed();
          globalThis.fetch = async () => {
            throw new Error("Discord should not be called");
          };
          await publish(db, { ...input, webhook_id: undefined });
          await publish(db, { post_id: input.post_id, unpublish: true });
          assert.equal(
            (await db.query("SELECT published_at FROM con.posts")).rows[0]
              .published_at,
            null,
          );
          assert.equal(
            (await db.query("SELECT * FROM con.deliveries")).rowCount,
            0,
          );
        },
      );
      await t.test(
        "linking an existing message verifies channel and webhook ownership",
        async () => {
          const input = await seed();
          globalThis.fetch = async () =>
            Response.json({
              id: "456789012345678901",
              channel_id: channel,
              webhook_id: "123456789012345678",
            });
          await reconcile(db, { ...input, message_id: "456789012345678901" });
          assert.equal(
            (await db.query("SELECT post_version FROM con.deliveries")).rows[0]
              .post_version,
            0,
          );
          globalThis.fetch = async () =>
            Response.json({
              id: "456789012345678901",
              channel_id: "wrong",
              webhook_id: "123456789012345678",
            });
          await assert.rejects(
            reconcile(db, { ...input, message_id: "456789012345678901" }),
            /another connection/,
          );
        },
      );
    } finally {
      globalThis.fetch = original;
    }
  } finally {
    await pg.close();
  }
});
