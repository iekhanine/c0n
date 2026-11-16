# C0N Architecture & Navigation

**Status:** Source committed, pending Vercel production release. The production rollout must be validated separately. This inventory is the canonical home for C0N route ownership.

## Primary domains

| System | Canonical host | Purpose |
| --- | --- | --- |
| Community | `cultofnixon.com` | Public/member community, projects, transmissions, archive, militia, profiles |
| Community publishing | `cultofnixon.com/admin` | Website content, projects, moderation, channel publishing, bot controls, staff roles |
| Member access | `cultofnixon.com/membership` | Issue, redeem, and revoke single-use invitation codes; membership record |
| The Compound | `thecompound.cultofnixon.com` | Housing, resident progression, supplies, assignments, facility operations, restoration, expeditions |
| Overseer command | `thecompound.cultofnixon.com/overseer/...` | Restricted work-order, financial, expedition and supply controls |

The main website `The Compound` navigation entry links directly to the Compound subdomain. A C0N-wide header appears across community, website administration, and Compound, with the same brand and navigation destinations.

## Compound navigation

**Resident services:** `/` overview, `/apartments`, `/profile`, `/requests`, `/guide`.

**Field operations:** `/operations` overview, `/operations/registration` personnel intake, `/operations/work-orders` jobs, `/operations/restoration` sector milestones, `/operations/inventory` stockroom and fabrication, `/supplies` requisitions and reports, `/operations/campaigns` expeditions, `/operations/finance` resident finances.

**Overseer command (owner restricted):** `/overseer/work-orders` contract editor, `/overseer/campaigns` expedition management and awards, `/overseer/finance` treasury, tax and payroll controls, `/overseer/supplies` supply issuance, requisition approvals, field-report verification and directives.

**Overseer personnel (existing restricted Compound pages):** `/admin/residents`, `/admin/apartments`, `/admin/requests`, `/admin/progression`, `/admin/rules`, `/admin/audit`.

**Website admin:** Existing left navigation is grouped by Community Website, Discord Bot, System & Access, and Overseer direct links. Newcomer invitation codes remain under `/membership` on the community host; owner dashboards link there.

## Legacy routes and migration

- `cultofnixon.com/reclamation` permanently redirects to `thecompound.cultofnixon.com/operations`.
- `cultofnixon.com/facility` redirects to `thecompound.cultofnixon.com/supplies`.
- `cultofnixon.com/facility/control` redirects to `thecompound.cultofnixon.com/overseer/supplies`.
- Old Reclamation and Facility React components are no longer included in the main site's App bundle. Server APIs are deliberately retained for existing jobs, ledgers and records.

## Authentication and API boundary

The Discord login session is set on `cultofnixon.com` as a secure, HTTP-only `__Host-` cookie. **Do not move that cookie to a shared parent-domain cookie without a security review.**

The Compound subdomain authenticates by making credentialed browser requests directly to the existing `https://cultofnixon.com/api/social` endpoints. Only the exact trusted Compound origin receives CORS credentials access. The API allows preflight OPTIONS before membership checks, then requires an authenticated, active member for actual operations. Privileged operations verify Overseer role on the server, not merely in the sidebar.

The `game_*` and `facility_*` API action names remain internal compatibility contracts. They do not need to appear in resident-facing language.

## Existing finances: three distinct ledgers

**Do not sum or merge without a reconciled migration.** Reclamation `game_accounts` balances, Workshop `workshop_wallets` earnings, and Facility `facility_transactions`/reputation-based allowances are currently separate. The Compound finance overview displays them side by side with explicit labels. The Discord `/wallet` command currently shows the Workshop balance only, not combined funds. Main treasury and Workshop settlements use existing transactions and may not be treated as interchangeable cash accounts.

No money was moved or rewritten in this navigation redesign. Currency display uses a dollar prefix. Any future unified wallet requires a dedicated ledger reconciliation, transaction history migration, and regression tests.

## UI implementation

- Community shell: `src/App.tsx` and `src/PublicNavigation.tsx`
- Community admin shell: `src/features/admin/Admin.tsx` and `Publishing.tsx`
- Compound shell: `compound/index.html`, `operations.css`, `operations.js`
- Authenticated server gateways: `api/social.js`, `server/reclamation.js`, `server/facility.js`, `server/compound.js`
- Main-site route redirects: `vercel.json`
- Compound Vercel routing: `compound/vercel.json`

Form controls adopt the same high-contrast, rectangular typography and spacing as personnel registration. Existing data models are preserved.

## Release checklist

1. Verify current main repository revision builds successfully using `npm run build` and tests.
2. Deploy **main C0N API changes first** (OPTIONS and strict cross-origin credentials) while old Compound remains operational. Verify only the trusted origin receives CORS allow headers.
3. Deploy **Compound project** including `index.html`, `operations.js`, `operations.css`, `vercel.json`; verify all new URLs and actual owner/session permissions.
4. Release main navigation and route redirects when the target Compound pages are healthy. Reconfirm owner admin, invitation issue/revoke, resident registration and cross-domain sign-in.
5. Test live controls end-to-end on a **test resident**, including a work order, a restoration material contribution, a facility requisition, an Overseer approval, and personal / treasury wallet views. Preserve transaction history and rollback deployment if cross-domain authenticated mutations fail.
6. Remove remaining legacy code only after the cutover is verified. Do not delete user records or original ledger tables as part of this UI migration.

**Outstanding:** Full live end-to-end verification, unified finance ledger design, and production build. Both Vercel projects hit the daily deployment limit at the time of implementation; do not claim this release is live until READY on the expected commit and domain.
