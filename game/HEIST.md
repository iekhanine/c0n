# The Heist (C0N Compound)

A player-versus-player robbery mechanic using **existing Compound Dollar resident wallets**.

## Discord command
`/heist target:@resident`

- Only members who have a Compound character and resident wallet can play.
- A successful heist has a 45% probability and steals 10% of the victim's cash up to **$500**.
- A failed attempt transfers up to **$50** from attacker to victim as restitution, or $0 if the attacker is broke.
- Two-hour cooldown per attacker. A resident cannot be targeted again within 30 minutes.
- Targets with less than $10 cannot be robbed. Bot accounts and self-targeting are rejected.
- Discord replies state the outcome. Both players can verify balances using `/wallet`.
- All currency transfers are atomic and double-entry recorded in `con.game_transactions` and `con.game_entries`.
- Discord interaction IDs are idempotency keys; repeated deliveries cannot double-charge or double-pay.

## Required release sequence

1. Review and apply `game/sql/025_heist.sql` to the ONETIMELABS Supabase database. Check the migration under the actual production DB role.
2. Verify `con_bot_profile_reader` has EXECUTE permission on `con.bot_heist_attempt(text,text,text)`, **not direct UPDATE access** to wallet tables.
3. Deploy bot from this branch to Railway and check `/heist` is registered to the correct C0N guild.
4. Test with two **test residents** before exposing it to regular members: successful robbery, failed attempt, empty wallet, repeat interaction, simultaneous attacks, attacker cooldown, target protection, and proper ledger balance.
5. Merge and deploy after review. Do not apply this migration in an unreviewed environment.

### Future multiplayer extension

Crew formation, planning, defenses, disguises, item-based bonuses, loot splitting, escape rounds, achievements and website leaderboards can use the same ledger. This initial implementation is **one robber versus one target**; it does not yet provide group raids or equipment.
