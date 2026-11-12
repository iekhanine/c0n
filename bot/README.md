# C0N Discord worker

This worker maintains the Discord Gateway connection. The website remains on Vercel. It handles guild membership synchronization, selected public-channel message counts and the `/con site`, `/con projects`, and `/con me` commands. It does not collect chat text, grant staff roles, or implement the future profile/post/blog system.

## Launch

1. In the existing Discord application `1570103248453509281`, open **Bot** and enable **Server Members Intent**. Leave **Message Content Intent** and **Presence Intent** off; activity counting does not require them. Obtain the bot token through the Developer Portal and enter it directly in Railway secret variables, never source code or chat.
2. Sign in to C0N as the protected owner. Open **Admin → Discord bot**, save the Discord server ID, then generate a worker key.
3. Use the generated invite link in that screen to install the bot in the same server. The first release requests View Channel, Send Messages, Embed Links, and Read Message History. It does not request Administrator, Manage Roles, member moderation or message-content access. Leave the application's Interactions Endpoint URL unset: slash commands arrive over the Gateway.
4. Create a Railway service from `iekhanine/c0n`. Keep the source root at the repository root and select configuration file `bot/railway.toml`. It points to `bot/Dockerfile`. Use one replica and disable sleep/serverless mode for this worker.
5. Set `DISCORD_BOT_TOKEN`, `CON_SYNC_KEY`, and `CON_SITE_URL=https://c0n.ivansays.com` in Railway. Deploy. `/healthz` returns 200 only after Discord login, membership sync, and command registration complete; missing credentials or an unconnected bot return 503.
6. Back in C0N, refresh the connection screen. The public-channel checklist appears. Select the channels whose activity may appear on the public website and save. Activity sharing starts with none selected. Changes take effect within one minute. Changing servers requires restarting the worker.
7. Try `/con site`, `/con projects` and `/con me`. Confirm live member counts, recent members and selected channel activity on the website. These checks require the real Discord bot token and installation; local tests do not log in or send messages.

## Runtime and data

Node 24; pinned discord.js 14.28.1. The worker uses the Guilds, GuildMembers and GuildMessages intents. Metadata is sent to C0N with a purpose-specific HMAC signature, five-minute timestamp bound and one-use nonce. Connection keys are encrypted in the private CoN schema and can be rotated by the owner. The worker never receives the database URL, webhook encryption key, session secret or Discord OAuth secret.

Only channels visible to @everyone and explicitly selected by the owner count toward public analytics. Messages from bots and webhooks are excluded. Counts reflect events observed while the worker is connected, not historical message imports. A bounded in-memory queue retries sync failures; events can be lost during a process crash. Duplicate Discord message IDs are ignored in storage. Membership changes are queued for retry and a full snapshot reconciles membership on connection/reconnection. Public member names/avatars can be disabled independently.

Message IDs, author IDs, channel IDs and timestamps are retained for 30 days; analytics cover the last seven days. Raw message text is not stored. Departed members disappear from public member panels. No actual website profiles, posts or administrative grants are created by member sync.

## Development

From this directory, run `npm ci --ignore-scripts`, then configure the three runtime variables securely and run `npm start`. Keep local environment files out of Git. Run `npm run check` for syntax validation. Root tests cover HMAC verification, replay protection, owner authorization, channel filtering, metadata minimization, membership and private storage.
