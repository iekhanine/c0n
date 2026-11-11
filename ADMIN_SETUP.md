# CoN administration

## Current milestone: Discord login

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

## Next milestone: publishing and persistence

Connect a dedicated database before implementing draft/post persistence and webhook management. No webhook credentials belong in browser bundles, localStorage, or Git. Future API endpoints must use `requireStaff` from `server/auth.js`; webhook settings require its `adminOnly` flag. Mutations must additionally require POST/PATCH/DELETE and validate the canonical Origin.

Planned content types: short updates and featured projects. Publishing records must store webhook and Discord message IDs to support editing an existing message rather than reposting it. Do not use local function memory or filesystem storage for durable records.

## Validation

`npm run build`

`node --test tests/auth.test.js`

Browser sign-in verification requires a real Discord user to complete OAuth. `vite` serves frontend development only; use Vercel Functions for the `/api` routes.
