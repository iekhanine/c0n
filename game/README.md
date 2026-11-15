# Project Reclamation backend / setup guide

Status: **branch-only foundation, not live or playable yet**. Do not deploy or apply until the real C0N database and Discord permissions are verified.

## Scope
- `sql/001_reclamation_foundation.sql`: private `game` schema, characters, 6 attributes, six professions, work templates, inventory storage, apartments, construction locations, campaigns, rolls, treasury and ledger, audit trail.
- `server/engine.js`: transaction-based create-character, publish-task, accept-timer-work, complete-timer-work, and dice primitives.
- `discord/setup-channels.js`: idempotent channel setup (dry-run unless APPLY=1).
- Treasury is seeded with **37,000,000,000 fictional CC** only if no treasury account exists. Never apply against an unrelated Supabase project.

## Operations
1. Confirm database ownership: Railway's `CON_PROFILE_DATABASE_URL` points at C0N; current Supabase connector may be a different account. Take a backup and apply SQL to the confirmed C0N database, not ROFFLE or ONETIMELABS.
2. Verify `select count(*) from game.professions`, `select balance from game.accounts where account_type='treasury'`, and that the `game` schema is **not** on Supabase's public Data API exposed-schema list.
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
