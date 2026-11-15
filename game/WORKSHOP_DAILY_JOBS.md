# The Workshop: Exclusive Contracts

## Live gameplay, November 15, 2026

Eight Workshop channels each have exactly one published and pinned objective. The first round launched together, and Supabase `pg_cron` rotates the channel objectives every 24 hours with a 30-minute offset between channels. Each channel has ten rotating objective prompts.

### Claim and complete

1. An active server member types **`accept`** as a standalone message in the Workshop channel containing a published objective.
2. The Railway bot calls `con.bot_workshop_claim` using its restricted database login. A row lock ensures only the first claimant wins. A member can have only one active shift at a time.
3. In the same transaction, the Overseer reserves that profession's tools and consumable supplies from the shared `game_storage` warehouse, records issued items on `workshop_assignments`, and stamps an assignment and due time. If supplies are insufficient, the entire claim rolls back and no job is assigned.
4. The bot posts a story-flavored dispatch telling the member where in The Compound to complete the job, which items were issued, and the salary/XP reward.
5. After the minimum shift (currently 10 minutes), the Railway bot posts a reminder and pings the assignee with **Yes, completed** and **Not yet** buttons.
6. **Not yet** leaves the shift assigned, rescheduling a new reminder for 30 minutes later. **Yes** pays exactly once in a locked database transaction, credits Compound XP and the appropriate stat, and checks reusable tool kits back into the stockroom. Consumed materials stay deducted.
7. If a member has already created a Reclamation game character, completing a job also credits that character's XP and profession skill XP. Existing regular Compound accounts require no character creation.

The user receives **10 × listed XP** in fictional Compound Credits for the completed contract: 250, 350, or 400 credits depending on channel. Salary is debited from the game treasury, moved into the game system clearing account with balanced ledger entries, and reflected in a dedicated `workshop_wallets` balance per Discord member. This is separate from periodic salaried employment payroll.

### Safety, audit and identity

- No roleplay message alone awards a Workshop contract bonus. The previous two-message automatic XP trigger has been dropped.
- Exclusive claims, payout confirmation and warehouse writes are protected by database transactions, unique keys and row locks.
- Only live, non-bot members of the configured Discord guild can claim and complete jobs.
- The Discord bot database login is `con_bot_profile_reader`: it retains read-only profile view access and can execute **only four explicitly granted Workshop functions**. All other normal database tables remain inaccessible to the login.
- `con.game_audit`, `con.compound_progress_events`, `con.game_transactions`, `con.game_entries`, and `con.workshop_salary_receipts` store audit and payout history.
- A rollback-protected SQL test validated first-claim exclusivity, supply checkout/return, delayed reminder, and payout exactly once.
- Discord Message Content privileged intent was enabled in the Railway bot and the deployment reached SUCCESS; no live member has yet accepted a job as of the verification.

### Architecture

Production execution uses `bot/workshop-assignments.js` and the isolated PostgreSQL functions in `game/sql/017_workshop_bot_functions.sql` for claims, reminders, and salary. These do not require Vercel.

The existing `server/workshop-assignments.js` contains an equivalent signed-bridge implementation for a future Vercel release, which was blocked by the Vercel Hobby daily deployment quota. Do not enable competing claim/payout implementations without reviewing shared idempotency and migration history.

The daily objective publisher continues using the independent `con.workshop_fallback_tick()` database job and signed Discord control/webhook bridge. The current and future pinned messages were updated to instruct players to type `accept`.

The starter warehouse originally had zero items. The game was provisioned with fictional supplies: 24 toolkits, 160 lumber, 180 scrap metal, 120 medical supplies, 100 seeds, 110 electrical parts, 120 food, and 80 steel brackets. Stock is finite; do not issue nonexistent inventory.

### Unfinished player-experience features

- An Overseer dashboard to view active contracts, stockroom holdings and individual Workshop wallet balances.
- Job cancellation and reclaiming unreturned supplies for members who leave or fail to complete a shift.
- Manual Overseer approval for disputed/exceptional tasks.
