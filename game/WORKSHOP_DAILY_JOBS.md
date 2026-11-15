# Workshop Daily Objectives

## Operational status (2026-11-15)

The first set of 8 objectives was successfully published to the live C0N Discord server, guild `903106349850849370`.

The independent Supabase `pg_cron` job `con-workshop-daily-objectives` checks the rotation every minute and creates exactly one new objective per channel on each of the following schedules (America/Chicago, CST):

| Channel | Daily start after launch | Bonus | Extra stat |
| --- | --- | --- | --- |
| Job Board | 10:02 AM | 25 XP | +1 Skill |
| Carpentry | 10:32 AM | 35 XP | +1 Skill |
| Metalworking | 11:02 AM | 35 XP | +1 Skill |
| Medical | 11:32 AM | 35 XP | +1 Intellect |
| Agriculture | 12:02 PM | 35 XP | +1 Skill |
| Engineering | 12:32 PM | 40 XP | +1 Intellect |
| Scavenging | 1:02 PM | 35 XP | +1 Luck |
| Payroll | 1:32 PM | 25 XP | +1 Charisma |

The first eight objectives launched together on Sunday, November 15. Future daily editions start Monday, November 16. Rotations are tied to persisted database timestamps, not to the bot process remaining online.

## How members earn job bonuses

1. Read the latest daily objective in one of the eight Workshop channels.
2. Post a starting plan or work update in the same channel.
3. After at least 10 minutes, post a completion update.
4. The database applies the bonus automatically, once per person per objective. The bonus is saved in `con.compound_profiles.manual_xp`, the XP total, the affected character stat, `con.compound_progress_events`, and `con.workshop_job_claims`.
5. Ordinary Discord participation XP also applies independently. The activity and bonus systems each have their own idempotency keys.

This is self-reported participation: the database verifies two separate messages and elapsed time; it does **not** inspect message content or confirm real-world labor. The daily objective closes when the next edition is posted. Only non-bot active guild members can earn rewards.

## Scheduling architecture

- `con.workshop_job_rotations` stores the channel, objectives, current cycle, and next publication time.
- `con.workshop_job_posts` stores every edition, its Discord message ID and command receipts.
- `con.workshop_job_claims` prevents repeat payout per edition/member.
- `con.workshop_fallback_tick()` posts through the existing bot-controlled webhook bridge, records Discord receipts, and queues pin/unpin commands.
- `con.workshop_credit_daily_activity()` awards rewards when messages in the correct channel arrive 10+ minutes apart.
- `pg_cron` invokes the fallback function every minute. Bot, website, or Vercel deployment restarts do not lose the rotation.
- The signed Workshop API and interactive Discord buttons are committed but still require the C0N Vercel API deployment, which was blocked by the daily free deployment limit. Fallback rotations have `active=false` to prevent competing bot scheduling.

## Discord pinning needs owner permission

All 8 webhook messages were delivered successfully. Attempts to pin them failed because the bot's managed `ᴄᴜʟᴛᴏꜰɴɪxᴏɴ` role (`1570435483551404045`) lacks Discord's `Pin Messages` permission (`1 << 51`, `2251799813685248`).

The bot cannot grant itself a permission it does not already have. Server owner must update the Workshop category (`1570509075630923777`) to allow this role to **Pin Messages**, then sync or explicitly grant the setting to the eight child channels. The database retries failed pins every 30 minutes. New posts will unpin the preceding edition after a successful replacement. Never give `@everyone` that elevated permission just to make this work.

## Management

- To pause only the fallback scheduler, run `select cron.unschedule('con-workshop-daily-objectives')` in the ONETIMELABS Supabase SQL editor.
- To pause one channel, set its `next_at` to a later timestamp or pause the cron job.
- To adjust objective text, edit `con.workshop_job_rotations.objectives` with a valid JSON array of two or more items.
- Switching to the signed bot's button-based gameplay requires a reviewed Vercel API release, enabling the bot mode, and unscheduling fallback first. Never enable both at once.
