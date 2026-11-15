# Compound character progression and public profiles

Staged on `feature/compound-profile-history`. Do **not** merge without checking the live Discord bot, public pages, and database migration.

## Rewards and historical reconciliation

- XP: existing configurable rates for bot-recorded eligible messages and reactions, with per-day caps in `con.compound_rules`. Defaults: 5 XP/message (20 per day) and 1 XP/reaction (15 per day).
- Charisma: starts at 5 and gains 1 point per 10 *eligible* messages across the member's recorded history, up to 2 per day under the default 20-message cap. No reward for reactions.
- Trivia: the bot records results directly using Discord user IDs, including members who have not signed into the website. The signed worker applies XP and Intellect once per match.
- The bot already records participation for Discord members without requiring any website account. When a Compound profile is first requested, the website reconstructs unclaimed historical rewards and records the reasons as immutable, deduplicated ledger entries.
- Events that predate bot monitoring or were excluded by the onboarding/eligibility criteria cannot be inferred or credited.
- Previous manual XP adjustments are preserved and represented as opening adjustment entries. Future staff adjustments record before/after values and actor ID.

## New API

- `GET /api/social?action=compound_history`: authenticated player's latest 100 XP/attribute events.
- `GET /api/social?action=compound_public_profile&id=<Discord snowflake>`: safe public details only for currently active, non-bot members of the configured Discord guild. Does not disclose history or staff metadata.

## Public page

- `https://thecompound.cultofnixon.com/u/<discord_id>`
- Shows **only** a membership card and character stats, without unrelated copy or navigation.
- Uses existing digital membership codename / ID conventions if the player has an active membership.
- A Discord resident with no site-issued membership is **not** falsely presented as a verified member.
- Apartment label is **The Unhoused** unless a current residency record exists.
- The logo at `https://cultofnixon.com/con-logo.png` is the Compound favicon.

## Bot commands

- Mention bot: `@cultofnixon profile`
- Slash command: `/profile` (optionally target a member)
- These return the public profile URL; the game state remains authoritative on the server.

## Release tests

1. Verify migration and RLS with a disposable PostgreSQL database, including existing records and previously completed trivia matches.
2. Seed a Discord member with two weeks of recorded messages and reactions **without website login**. Verify first-load XP, +1 Charisma per ten eligible messages, and stable totals after refresh.
3. Verify daily caps, multiple events at identical timestamps, repeat ingestion, and no double credit.
4. Play an actual trivia game. Verify one ledger entry per player per match and both XP and Intellect updates. Retry the same result and verify no duplicate.
5. Test staff XP adjustments and confirm a readable history entry with before/after values.
6. Visit a public profile signed out. Verify correct card and stat display, and no access to private history. Check a user who is not an active server member returns 404.
7. Test verified-member card, an unverified Discord resident, a housed player, and **The Unhoused**.
8. Verify `@cultofnixon profile` and `/profile` in Discord, with the correct destination and no accidental mentions.
9. Confirm favicon loads. Regression-check existing apartment management, OAuth, the main site, and the bot.
10. Merge and deploy website/backend and Compound frontend from the same reviewed branch; check matching production revisions and Railway readiness before declaring completion.
