# Project Reclamation

Project Reclamation is the Compound's community RPG, built around discovery, excavation, restoration, and expansion of an abandoned underground bunker.

## Verified installation (November 15, 2026)

- Database: ONETIMELABS Supabase project `vzbopyksyfognxfubncf`, existing `con` schema.
- All `con.game_*` migrations 001-009 applied. They coexist with existing profiles, apartments, and residency data; no originals were overwritten.
- 37,000,000,000 fictional Compound Credits seeded in the treasury. **No real money, cash-out or paid stat point integration.**
- 32 existing apartment storage containers; six professions mapped to Discord job channels.
- 12 initial published jobs, six craft recipes, three shared construction phases, attribute point-buy, accounts/ledger, campaigns, DM awards, and world event records.
- New Discord categories and 17 channels created through the running bot's signed control queue. The `Dungeon Master` role was created.
- **Exception:** `dm-chambers` has an `@everyone` View Channel deny. Adding DM and bot grants failed with "The bot cannot access this resource"; correct these permissions manually in Discord.
- Discord participation awards capped profession XP via DB trigger only after a character exists. Level and attributes also advance from XP. The triggers passed rolled-back SQL tests.

## Pending site and bot release

This branch is **not merged**. PR #28 is draft:
https://github.com/iekhanine/c0n/pull/28

- Website route: `/reclamation`.
- Game API: `/api/social?action=game_state` and POST actions with a `game_` prefix. Reuses existing Vercel serverless function to avoid a 13th function.
- The bot's `/roll` command is added to the feature branch and included in `bot/Dockerfile`, **not deployed to Railway**. Railway's running service still tracks `main`.
- GitHub Actions workflow `.github/workflows/reclamation-ci.yml` runs `npm run build`, JS syntax checks and game/bot dice unit tests. The new suite passed after creation. Existing site CI also remains enabled.
- Vercel preview deployments remain blocked by the account's daily free deployment allowance. Earlier builds compiled but Vercel rejected the extra function count; the extra function was deleted and the endpoint consolidated. **End-to-end authenticated website testing has not happened.**

## Game rules

- New characters choose one of six professions and allocate 20 points across Strength, Intelligence, Charisma, Agility, Endurance and Perception, starting at 5 and capped at 10 for creation.
- An accepted work order snapshots its terms. The Overseer can revise later templates without retroactively altering accepted jobs.
- Timed jobs become completable after their configured duration. D&D, collaborative, quiz and DM-approved jobs must be submitted and verified before granting rewards.
- A DM cannot approve their own job. A DM can propose campaign awards, but the Overseer must approve payment.
- Work pays net compensation out of the treasury; an employed salaried worker receives their weekly payroll instead of both salary and contract job pay.
- Jobs generate material drops into carry storage. Players may transfer them into apartment storage or donate them to the active reconstruction milestone.
- Each phase requires labor units plus physical materials. Once requirements are met, the phase is completed and the next one unlocks.
- Profession XP earned in the corresponding Discord channel is capped daily. Profession XP increases training in its primary attribute; overall XP determines level.
- The first phase is "Survey the Hidden Entrance"; progression continues through opening the blast doors and securing level one.
- Currency transfer taxes and weekly salaries are configurable by the Overseer; these are fictional game credits.

## Build and verification

1. View PR #28 GitHub Actions checks for a successful TypeScript/Vite build and backend unit tests.
2. When Vercel allows previews, validate the `feature/compound-reclamation-engine` preview, *not* production.
3. Test character creation, job acceptance/completion, inventory overflow and transfers, campaign permissions, material contributions, stage unlocks, tax accounting and payroll in an authenticated session. A passing build **does not prove** these end-to-end flows.
4. Correct Discord `dm-chambers` role visibility for Dungeon Master and bot, without exposing the room to all users.
5. Merge and deploy only after reviewing the security controls and production integration. The Railway bot must be deployed separately from a reviewed commit after the website release is ready.

## Current limitations and future work

- No automated NPC/AI Dungeon Master, live voice transcription or voice-triggered game rules.
- No in-game shop, resident marketplace UI, auctions or real-money payments. Avoid representing credits as redeemable.
- No graphical interactive bunker map, though location and project states exist.
- DM award approval and work-order reviews have initial functionality but need live authorization and concurrency tests.
- There is not yet a full server-side automated economy simulation or shift roster scheduler.
- Salary/tax rules, profession channel XP, and all item tables remain server-side; users cannot write them directly through browser Supabase credentials.
