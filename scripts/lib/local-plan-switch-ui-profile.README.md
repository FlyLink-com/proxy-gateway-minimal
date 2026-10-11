# Local plan-switch Portal profile

Source-only synthetic validation, not production or physical protocol evidence.
This closed profile extends the existing marker-owned disposable Coins UI
harness. It does not change the default profile, Portal source entry or auth.

```sh
npm run platform:coin-commerce:local-ui-validation -- --profile=plan-switch
npm run dev:portal:local-api-validation --prefix admin
```

Only `--profile=plan-switch` is accepted; custom paths, databases, ports, data
or env injection are not accepted. API stays on `127.0.0.1:3457`, Portal on
`127.0.0.1:5175`. The harness creates its own SQLite files and proxy config in
an OS-temporary marker-owned root. No `.env`, production database, real account,
credential, payment service, collector or protocol listener is used.

The profile uses `createRuntimeState`, `createApp`, the production catalog,
production fulfillment factory, real subscription core and real SQLite stores.
The only special behavior is seeding synthetic account/entitlement/issued-link
data and the temporary plan-switch migration. `mustRotate` remains unchanged;
login uses the existing local synthetic credential and real arithmetic challenge.
Do not publish credential values, cookies, session/order refs or subscription
URLs in logs/screenshots. A browser challenge must be normally submitted under
the operator's current permission, never replaced by an injected session.

Initial state: 1,000 paid Coins, basic 50 GB plan with 16 days remaining,
1,234 used bytes. Suggested UI sequence:

1. Sign in normally; open Marketplace and inspect current-plan/renew/upgrade.
2. Upgrade to plus for 5 Coins; verify 995 spendable, original expiry/used bytes.
3. Preview and cancel a basic downgrade inside the 3-second cancel window.
4. Buy the basic scheduled downgrade for 20 Coins; plus remains current.
5. Renew plus using the pending 20-Coin credit: pay 10 Coins, cancel the pending
   downgrade, extend expiry by 30 days, keep usage; final spendable 965, held 0.

The HTTP test runs that lifecycle using real password/challenge authentication
and legacy `X-Portal-Session` transport. It does not certify browser cookie/CSRF,
visual layout or real protocol delivery; those need separate browser/physical
evidence. The default-off isolated router returns 404; in the full app it falls
through to the existing protected 401 response. The current UI catches that
state-read failure and keeps its legacy catalog buttons without logging out.
Do not report the full-app response as a verified 404.

Stop Vite first, then signal the harness with SIGINT/SIGTERM. Verify both ports
are closed and the exact owned temporary root has been removed. The source
fixture/dependencies may be retained; do not delete unrelated temporary roots.
