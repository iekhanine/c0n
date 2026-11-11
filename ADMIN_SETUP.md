# CoN administration

## Discord login

The public showcase stays at `/`. Staff sign in at `/admin` through Discord.
The exact registered redirect is:

`https://c0n.ivansays.com/api/auth/discord/callback`

Set Production environment variables in Vercel:

- `DISCORD_CLIENT_ID`: Discord application ID.
- `DISCORD_CLIENT_SECRET`: server-only Discord OAuth secret.
- `SESSION_SECRET`: random secret, at least 32 characters. Changing it signs out every session.
- `DISCORD_ADMIN_IDS`: comma-separated Discord user IDs with owner/admin access.

Optional role access:

- `DISCORD_GUILD_ID`: Cult of nix0n server ID.
- `DISCORD_ADMIN_ROLE_IDS`: comma-separated admin role IDs.
- `DISCORD_MOD_ROLE_IDS`: comma-separated moderator role IDs.

Redeploy after changing environment variables. No bot token is needed. Login requests only `identify` and `guilds.members.read`. The authenticated user sees their own Discord ID so the owner can configure the initial allowlist. There is no automatic first-user administrator.

OAuth state lasts ten minutes. Encrypted, HttpOnly, Secure, SameSite=Lax session cookies last at most thirty minutes. Tokens are not returned to browser JavaScript. Role membership is verified against Discord when staff permissions are checked. A Discord lookup failure never grants access.

## Publishing and storage

Set Production secrets `DATABASE_URL` (Supabase transaction pooler, port 6543) and `WEBHOOK_ENCRYPTION_KEY` (independent random secret of at least 32 characters). Optional `DATABASE_CA_CERT` accepts the database CA PEM if its certificate is not in Node's trust store. TLS certificate verification is always enabled. Keep the webhook encryption key stable: changing it without re-encrypting existing records makes stored connections unreadable.

At `/admin`, open Database. Check the connection, then select **Initialize CoN storage** as an administrator. This creates only the private `con` schema and its posts, webhooks, deliveries and migration tables. It refuses an existing schema with unrelated relations or functions. Setup is transactional and idempotent. RLS is enabled without public policies; anon/authenticated schema access is revoked. Do not expose the con schema through the Supabase Data API.

The shared database account needs permission to create and access this schema. All application queries use schema-qualified names and parameterized values. No changes are made to public or other application schemas. Integration tests use an isolated in-memory PostgreSQL engine rather than the shared production database.

### Workflow

1. Add channel webhooks under Channels. Saving verifies the webhook with Discord without sending a message. Stored tokens are encrypted and never returned by the API. Labels and enabled state can be edited; a replacement token can be pasted. An existing connection with message history cannot be repointed at another channel or webhook.
2. Create an Update or Project. Image and destination links are optional HTTPS URLs. Projects can be marked featured. Save Draft does not publish a new post.
3. Preview the embed, choose Website and/or a Discord channel, then publish. Public content appears on `/`; the public feed never returns drafts, delivery records, or webhook metadata.
4. Edit a published post and save. Website content updates immediately; select the same Discord channel and Publish to PATCH the original message. Each channel keeps its own message ID and content version.
5. Remove from Website unpublishes only the public website entry; Discord messages remain. Only drafts without delivery history may be deleted.

Discord delivery reserves a durable record before network I/O. Unconfirmed sends block blind retries. Check Discord and use **Link an existing Discord message** to recover an uncertain send or import a prior message from the same webhook. Wait two minutes before recovering an in-progress request. A linked message is not modified until the next Publish. If no message was created after an ambiguous send, an administrator must investigate the delivery record rather than repost automatically.

Published cards use the public logo URL, disable mentions, and replace attachments with the configured image URL. Linking and updating an older message replaces its embed with the current editor content, including removing old uploaded attachments. It does not import that message's content automatically.

All admin endpoints use server-side `requireStaff`; channel mutations and database setup require administrator access. POST/PATCH/DELETE check the canonical Origin. Publishing verifies the post version shown in the preview. There are no scheduled posts or automatic daily sends in this release.

## Validation

`npm run build`

`node --test tests/*.test.js`

Browser sign-in verification requires a real Discord user to complete OAuth. `vite` serves frontend development only; use Vercel Functions for the `/api` routes.

Production database connectivity and real Discord publication must be checked by the signed-in owner. Preview deployments do not receive production database credentials.
