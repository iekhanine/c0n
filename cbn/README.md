# Compound Broadcast Network (CBN)

Independent Vercel project rooted at `cbn/` in the existing C0N repository.

## Current delivery
Static responsive network directory with honest empty states and a browser-local show proposal draft. **No recording, live-status feed, accounts, shared database writes, actual show submissions, or YouTube connection yet.** Example shows are labeled concepts.

## Domain configuration
This project intentionally uses relative links and no hard-coded production origin. Once `cbn.cultofnixon.com` is ready:
1. Open the CBN Vercel project → Settings → Domains.
2. Add `cbn.cultofnixon.com`.
3. Configure the DNS record exactly as Vercel instructs (often a CNAME to `cname.vercel-dns.com`, but verify the project dashboard).
4. Confirm verified / valid configuration and TLS issuance.
5. Set `PUBLIC_SITE_URL=https://cbn.cultofnixon.com` for a later dynamic application; the current static preview does not need this variable.

Do not add the domain to the existing C0N web project or change its primary domain. Once authentication is connected, add the exact new redirect URI to Discord OAuth settings.

## Next integrations
- Confirm the correct C0N Supabase project/connection before schema creation.
- Server-authorized Discord OAuth, roles, shows, reservations, and moderation.
- DAVE-compatible dedicated recording worker with affirmative consent.
- Media storage + recording processing + publishing flow.
- YouTube OAuth and OBS companion.
