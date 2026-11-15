# Project Reclamation backend / setup guide

Status: **database foundation installed in C0N, application code is branch-only and not playable yet**. Do not deploy or apply until Discord permissions and application integration are verified.

## Scope
- `sql/001_reclamation_foundation.sql`: new `con.game_*` tables in the existing ONETIMELABS `con` schema, characters, 6 attributes, six professions, work templates, inventory storage, apartments, construction locations, campaigns, rolls, treasury and ledger, audit trail.
- `sql/002_reclamation_starter_content.sql`: 18 configurable starter work orders (12 published, 6 draft), salvage items, three reclamation construction projects.
- `server/engine.js`: transaction-based create-character, publish-task, accept-timer-work, complete-timer-work, and dice primitives.
- `discord/setup-channels.js`: idempotent channel setup (dry-run unless APPLY=1).
- Treasury is seeded with **37,000,000,000 fictional CC** only if no treasury account exists. Never apply against an unrelated Supabase project.

## Operations
1. Confirmed: the C0N database is the ONETIMELABS Supabase project (`vzbopyksyfognxfubncf`), schema `con`. The foundation and starter-content migrations have been successfully applied there. Do not apply them elsewhere.
2. Verified: six professions, a 37-billion-credit treasury, and RLS on all new `con.game_*` tables. No public access grants were given. Confirm the `con` schema's Data API exposure and existing application access before wiring clients.
3. Dry-run channel creation from a secure environment with `DISCORD_BOT_TOKEN` and `CON_GUILD_ID`, `node game/discord/setup-channels.js`. With validated permissions and names, run with `APPLY=1` to create missing categories/channels. Do not run as an automatic startup hook.
4. Wire authenticated server routes and Discord slash commands to the engine. All Overseer/DM actions must be authorized against **server-side Discord guild roles** or a trusted membership table, not client-submitted flags. Don't expose PG credentials.
5. Before enabling paid work: implement inventory reservation/crafting, server scheduling for pending work, payroll/tax checks, project contribution/room unlocking, and tests for concurrency, cooldowns, duplicate completion and worker role permissions.
6. Add UI for mandatory character creation, tasks, storage, world map, Overseer administration and campaign manager. Deploy once these routes and UI have been tested together.

## Design notes
- Task time, character XP, profession XP, pay, materials, stamina and publication status are all per-template values. Active work orders snapshot the values accepted by the worker, protecting them from later Overseer edits.
- Apartment storage is a separate container from carry inventory and the shared warehouse. Residence assignment, cohabitation approvals and warehouse withdrawals need permission-tested transaction functions before activating.
- DM awards are pending by default and need approval and application workflows.
- No paid stat points, fiat redemption or real-money features are included.
- `publishTask` must only be invoked after authentication **and** an Overseer authorization check. Other engine methods likewise require verified identity.
- The current timer work engine intentionally refuses tasks with material prerequisites until inventory deduction is implemented. It does not pay for complex non-timer tasks without approval.
- Deployment to Railway/Vercel is deliberately not automatic from this feature branch. Only a reviewed merge should deploy.

## Known gaps
This is a structural backend foundation, **not** a finished MMORPG. Session management, NPCs, payroll, taxation of trades, apartment transfer, crafting, trades, construction completion, DM moderation, tests and frontend are still pending.
