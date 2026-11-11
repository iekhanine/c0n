# Cult of nix0n administration

## Production configuration

The public feed is at `/`; the staff workspace is at `/admin`.
Discord's exact OAuth redirect is `https://c0n.ivansays.com/api/auth/discord/callback`.

Server-only Production values in Vercel:

- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`: Discord OAuth application.
- `SESSION_SECRET`: random secret of at least 32 characters; rotating it signs everyone out.
- `DISCORD_ADMIN_IDS`: protected owner Discord IDs, comma-separated. Owners retain recovery access and all permissions.
- `DATABASE_URL`: Supabase transaction-pooler URI, with its password percent-encoded.
- `DATABASE_CA_CERT`: the downloaded Supabase root CA PEM. Certificate verification stays enabled.
- `WEBHOOK_ENCRYPTION_KEY`: independent random secret. Keep stable; changing it without re-encrypting stored records makes existing webhook tokens unreadable.

No bot is required. Login requests only the Discord profile (`identify`). The OAuth token is used server-side to obtain the profile and is not retained in the session. Cookies are encrypted, Secure, HttpOnly, SameSite=Lax and expire after at most thirty minutes.

## Storage update

After this release, open **Database → Apply storage update** as the owner. Migration 3 adds pending-request fields, explicit permissions, allowed posting channels, expanded audit data and published website snapshots. Existing approved database staff keep their previous capabilities and current/future channel access. New sign-ins get no rights until reviewed. Discord server-role fallback is no longer used.

Updates are transactional and idempotent, confined to the private `con` schema. Existing posts, webhooks and deliveries are preserved. Public/other application schemas are not modified. The public feed has a read-only compatibility path during the upgrade; admin tools wait for the update. Schema migrations never run during deployment.

CoN tables have RLS enabled and no browser-facing policies. `anon` and `authenticated` have no schema/table privileges. Do not expose `con` through the Supabase Data API. Queries use parameters and schema-qualified names.

## Approval workflow

1. A person signs in with Discord and opens the site/admin page.
2. Their first authenticated session check creates a pending request with no permissions or allowed channels. Later sign-ins update profile/last-seen fields only; they never re-enable disabled/rejected access.
3. The waiting page checks approval every fifteen seconds and has a manual Check status button.
4. A staff manager opens **Staff approval → Pending**, selects the request, checks capabilities and allowed channels, and approves it.
5. The person's next request/status check opens the enabled tools. Every server action re-checks their current permissions.

The role name (Admin, Moderator, Report) is a label. Preset buttons fill the checklist; only checked capabilities are granted. Capabilities are independent for Updates and Projects: view, create, edit, publish, and delete unpublished drafts. Additional checks cover website publication, channel management, reports, account approval and storage updates.

Discord posting needs both the content's publish capability and an allowed channel. Website publication additionally needs `website.publish`. Choosing “All current and future channels” explicitly grants that scope. New requests default to none. Checking a content action also checks its view permission; unchecking view clears the other actions in that group.

Owners cannot be changed through the UI. No one can modify their own access. A staff manager cannot grant or manage permissions/channels beyond their own authority. Approval, permission, channel-scope and enabled-state changes are recorded in `con.staff_audit`.

## Editing and publishing

The left post list shows each website/Discord destination, original posting time and last sync time. Discord message creation time is decoded from its message ID using Discord's documented snowflake format; later sync time comes from the delivery record. Times use the viewer's local timezone.

Selecting a post with one existing Discord destination selects that channel. Multiple destinations require an explicit choice. The sticky top toolbar shows its current targets and Save & Update / Save & Publish actions.

Saving edits changes only the draft. Published website snapshots and Discord messages remain unchanged until explicitly published. Publish can target the website, one allowed Discord channel, or both. The same post can have copies in multiple channels, each with its own message ID and last-synced version. Updating one destination does not update the others automatically.

The public homepage leads with posts in a compact sidebar/header layout. Project copy describes work by community builders. All channel labels are normalized to a single leading `#`.

## Channels and recovery

Under **Channels**, paste a Discord webhook URL; its optional label defaults to the webhook name. Saving verifies the connection without sending a message. Tokens are encrypted and never returned to browser JavaScript. Used connections cannot be repointed to a different webhook/channel; disable one and create another instead.

Delivery reservations are stored before network I/O. Timeouts/ambiguous sends block blind retries. Check Discord, then use **Link or recover an existing Discord message** to attach its ID. A linked message is not changed until a later explicit publication. Linking verifies webhook/channel ownership and respects allowed-channel permissions. A send still marked in progress must wait two minutes before recovery.

Updating a linked older message replaces its embed and uploaded attachments with the current editor configuration. Mentions are disabled. Images use optional HTTPS URLs. There are no scheduled posts, automatic daily sends, file uploads or Discord server-role changes in this release.

## Verification

- `npm run build`
- `node --test tests/*.test.js`

Tests use isolated in-memory PostgreSQL and stubbed Discord responses. They never query/migrate the shared production database or send real Discord posts. Preview deployments do not receive production database credentials. Authenticated browser QA needs an actual Discord session; the cloud browser's session is separate from the owner's browser.


## Community projects (storage version 4)

After this deployment, the owner must open **Admin → Database → Apply storage update**, or choose **Owner: apply project storage update** in `/my-projects`. The additive transaction creates private `con.projects`, `con.project_votes`, and `con.project_comments` tables and imports existing project posts without changing updates or Discord deliveries. No production migration runs during deployment.

Any signed-in Discord member can create their own projects in `/my-projects` and access that workspace from `/admin`. Staff approval is separate. New projects and edits are drafts until submitted and reviewed. Existing approved snapshots stay public during editing/rejection. Approvers need both `projects.publish` and `website.publish` (owners always qualify); review controls appear in the project workspace. Owners of projects cannot edit another person's project. The site owner alone retains fixed website-copy editing.

Approved projects have `/projects/<uuid>` pages, one reversible upvote per Discord account, and comments with a 15-second per-account cooldown. Default listings sort by upvotes, then publication date. Comment authors and authorized project reviewers can delete comments. Disabled/rejected accounts cannot mutate projects, votes or comments. Anonymous users can read only approved snapshots and comments. Bodies are plain text, not HTML.

Sample projects remain frontend-only previews with illustrative counts; they do not accept votes/comments. Real projects replace sample cards. The server membership/activity panels are still labeled demonstrations pending the Discord bot connection. The Join Discord link points to `https://discord.gg/dSHMeZ4ETJ`.
