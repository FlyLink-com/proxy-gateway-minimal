# Wallet four-region desktop validation

## Scope and identity

- Risk: B. Frontend presentation, component tests, and an isolated local validation profile; one intended PR.
- Worktree: `D:/Projects/proxy-gateway-minimal/.worktrees/portal-wallet-checkout-layout`.
- Branch: `codex/portal-wallet-checkout-layout`.
- Base source: `986318c475f5d6ecd932cd1d5aba0d95d11ab4bf`, with uncommitted changes.
- Classification: local candidate; not production identity or deployment evidence.
- Candidate chain: `admin/portal/index.html` -> `admin/src/portal-main.tsx` -> `UserPortalPage` -> `admin/src/portal-static-preserve.css` -> `admin/dist-portal`.
- No production backend, payment callback, schema, environment, or provider changes. The local-only validation launcher adds an explicitly closed recharge-payment boundary.
- This is the latest Wallet report. The previous marketplace-card QA remains available at `986318c475f5d6ecd932cd1d5aba0d95d11ab4bf:design-qa.md`; its historical result is not superseded by this separate Wallet scope.

## Intent and implemented changes

- Follow the user's corrected four-region layout: upper-left balance, upper-right recharge, lower-left recent ledger, and lower-right explanations.
- Make spendable balance the primary amount. Show purchased, bonus, reward, and reserved amounts in four secondary cells; retain pending rewards as auxiliary status rather than treating them as spendable balance.
- Display the six API-provided recharge offers in a compact three-column, two-row grid. No prices, methods, denominations, discounts, or bonus awards are hardcoded by this presentation change.
- Remove the visible wallet-overview heading; retain a named Wallet region for accessibility.
- Retain five recent ledger entries, with a working view-all/return path. Keep ledger date and amount cells on one line.
- Use thin borders, white light-theme surfaces, rounded cards, and existing theme tokens.
- Omit repeated offer labels only in the compact inline catalog; keep the actual Coins quantity, price, method, and payment action.
- Present payment amount, Coins, method, compact status, and a collapsed order reference in the checkout dialog. Show the selected offer while creation is pending.
- Use the existing `admin/public/payment-alipay-icon.png` asset for Alipay offers and orders; other methods retain generic labels.
- The ready-to-pay description is exactly `即将跳转支付页面`. The Alipay CTA is `支付宝支付`.
- Preserve the existing protected continuation function and real-order eligibility. Unknown creation recovers the original intent; busy state disables offer submission. No additional automatic create or payment action was added.
- The earlier checkout-summary work remains separate from the balance-card design. This run's final browser acceptance covers the four-region wallet, not a successful payment or a live waiting-for-payment state.
- Mobile redesign is out of scope. One-screen acceptance is measured at 1440 x 900, not promised for every viewport, zoom setting, or account state.

## Source and rendered evidence

- Source visual truth paths (user-provided):
  - `C:/Users/g/AppData/Local/Temp/codex-clipboard-759d3fe2-c146-4cf0-a65d-7930b8d1d8fc.png` (corrected numbered regions; source 2338 x 1422, conversation display 2048 x 1246).
  - `C:/Users/g/AppData/Local/Temp/codex-clipboard-cdc06f6a-52a0-47b1-ab76-a4e3ded7a3a2.png` (six recharge offers to bring inline).
  - `C:/Users/g/AppData/Local/Temp/codex-clipboard-8e75ba48-3210-482b-bf0f-23b6d046019b.png` (offer hierarchy reference only; its decorative styles and bonus awards are not new business requirements).
- Implementation URL: `http://127.0.0.1:5175/`, in-app browser.
- Observed title/state: GCC WebOS user center, signed into the authorized disposable local account. No production credentials or customer data were used.
- Final implementation screenshot: `.local-validation/wallet-four-regions-desktop.png`, 1440 x 900 pixels at a 1440 x 900 CSS viewport.
- The annotated source and final rendered screenshot were opened together in one comparison input. Comparison is region-relative: the source shows the old layout with numbered placement instructions, whereas the implementation includes application chrome and synthetic data. This is not a pixel-copy claim.
- Full-view and focused-region comparison checked balance hierarchy, six-offer alignment, ledger rows, explanatory copy, thin borders, and Alipay asset readability. All four regions are clearly visible in the full-resolution capture.
- Final geometry: document and body height 900; wallet bottom 857.59; upper row height 401.19; lower row height 330.40. Six offers and five ledger rows are visible without vertical scrolling.
- Experimental clipped captures with incorrect scaling are excluded from final evidence; only the normal browser capture above is authoritative.
- Login and the local challenge were completed under the user's existing local-preview permission. No recharge creation, payment, or callback was submitted through the final CNY preview.
- Wallet, ledger, recharge-offer, and recharge-order reads returned HTTP 200; the Alipay asset loaded (304 cache validation). Browser error-console count was zero.
- Refresh-wallet, view-all ledger, and return-to-wallet interactions were verified. The default wallet state has no dialog open.

## Findings and fidelity coverage

- Fonts/typography: the primary balance is prominent and the four secondary quotas remain subordinate; offer quantities and prices remain readable after compacting repeated labels.
- Spacing/layout rhythm: the four requested regions form two aligned rows. The ledger stays compact and its dates do not wrap.
- Colors/tokens: existing theme tokens, white card surfaces, and thin borders are retained. No decorative gold/gradient reference styling was introduced.
- Image quality/assets: the existing Alipay image is displayed at 22 x 22 with white backing for contrast, without modifying or approximating the asset.
- Copy/content: API amounts and methods are preserved. No bonus claims were copied from the reference. The balance is not presented as an order summary.
- Final four-region wallet comparison: no unresolved P0, P1, or P2 visual finding. Payment-flow acceptance, narrow-screen redesign, and production readiness are excluded.

## Review and comparison history

- The earlier reversed balance/recharge placement was corrected to the user's numbered layout.
- Static review found a main-balance font-size specificity collision; scoped selectors and a regression contract fix it.
- A browser comparison found ledger date wrapping. Desktop columns now use 22/22/40/16 proportions with automatic table layout and non-wrapping cells.
- A subsequent comparison found excess height: wallet bottom was 937.59 before compacting repeated offer labels and is now 857.59 at 1440 x 900.
- Low Alipay icon contrast on the blue action was corrected using the original asset on a small white backing. The final source/rendered comparison includes this fix.
- Independent frontend review and local-profile review reported no confirmed P0/P1/P2 issues. These source reviews complement, rather than replace, the final browser comparison.

## Closed local catalog validation

- `scripts/start-local-coin-commerce-cny-catalog-readonly-ui-validation.mjs` is a separate zero-argument local entry using the existing runtime and actual CNY pricebook projection. Existing validation profiles are unchanged.
- Fixed synthetic local configuration supplies six CNY Alipay offers without inheriting provider credentials. An injected provider transport rejects every outbound call.
- The outer HTTP boundary permits only the canonical payment catalog/order GET paths and rejects creation, capture, and callback requests before the application handler. This is a read-only recharge-payment boundary, not a claim that login or the entire validation runtime is read-only.
- Marker-owned disposable data supplies five local wallet credits totaling 1000, allowing realistic balance and ledger layout checks without customer data.
- Random-loopback integration verified six correct offers, no provider calls, and zero orders before and after a denied create attempt. Its exact temporary root was cleaned.

## Automated validation

- TDD red evidence was captured for four-region structure, single-line ledger dates, compact offer labels, and Alipay contrast; corresponding focused reruns passed after each minimal change.
- Final frontend suite: 57 files, 898 passed, 0 failed (`.local-validation/admin-test-four-regions.log`).
- Final Portal build and artifact verifier: passed (`.local-validation/portal-build-four-regions.log`). The bundle-size warning is non-fatal.
- New closed-profile tests: 7 passed. Related five-file regression: 58 tests, 57 passed, 0 failed, 1 POSIX-only skip.
- Portal verifier uses empty local recharge-adapter configuration. This is not an approved production-configured artifact.
- `git diff --check`: passed.
- Earlier root regression: 4408 tests; 4341 passed, 11 failed, 56 skipped. No baseline comparison was run, so these failures are not classified as confirmed pre-existing. The full root suite was not rerun after the final UI/local-profile changes; full-root-suite success is not claimed.
- Local detailed test logs are under `.local-validation/`; this directory is not intended for blanket inclusion in a commit.

## Preview lifecycle and next checks

- The old preview was stopped Vite-first/backend-second; the backend emitted its successful stopped receipt and both listener ports were absent before starting the new profile.
- The new Vite and owned disposable backend remain running only on `127.0.0.1:5175` and `127.0.0.1:3457` for user inspection. No production services were accessed.
- Preview cleanup has not been performed because the preview is intentionally retained. When finished, stop Vite first, then the backend; verify both ports close and the harness removes its exact marker-owned temporary root.
- The temporary viewport override was reset after desktop capture, and the browser was returned to the Wallet overview for handoff.
- Wallet payment mutation consistency and a valid live checkout waiting state were not exercised by this read-only catalog preview. The earlier generic local stub did not provide acceptance evidence for those states.
- Next: user review of the four-region desktop proportions. Any merge or deployment remains a separate request and gate.
- No merge, push, production deployment, or production activation performed.

## 2026-09-06 follow-up: copy cleanup and automatic Wallet reads

This section supersedes the manual-refresh interaction and earlier validation
counts above. Classification remains a local candidate, not production. Risk B
copy/read refresh is implemented; Risk A login persistence is inventory/proposal
only in `docs/PORTAL_SESSION_PERSISTENCE_PLAN.md` and is not part of this pass.

### Implemented behavior

- Removed the visible balance heading, normal active-status line, manual Wallet
  refresh button, and six duplicate Alipay method pills. Retained the accessible
  balance region, non-active Wallet warnings, all actual prices and quantities,
  and six Alipay icon/payment buttons. Multi-method/non-Alipay labels remain.
- Visible, online Wallet reads refresh about every 30 seconds. Focus, visible,
  and online transitions share a 5-second throttle. Hidden/offline/away/unmounted
  states stop new automatic scheduling; existing GETs have a 15-second real
  AbortController deadline covering headers and body, not immediate view-exit
  cancellation. No automatic create, payment, capture, or callback is introduced.
- Refresh retains prior data; refresh failures explicitly label it as old data
  with retry. Mutation invalidation rejects old responses and queues one
  single-flight successor. Account generation changes mask prior-account data.
- History paging pauses ledger replacement but not balance updates. Returning
  to overview explicitly reloads the first page and resumes ledger refresh on
  success, including when a history-page read is still in flight.

### Source and browser comparison

- Latest user source: `C:/Users/g/AppData/Local/Temp/codex-clipboard-575a366c-80c6-461c-93c5-ba88e8e6546b.png`, 2194 x 1350; red marks define removals, not a new visual design.
- Final rendered capture: `.local-validation/wallet-clean-auto-refresh-desktop.png`, 1440 x 900, same local Portal entry chain and four-region arrangement.
- Opened the latest source and final capture together in one comparison input.
  This is region-relative comparison across different source dimensions, not
  pixel-equivalence. All marked removals and all four regions are visible.
- Typography: balance remains the primary amount, with four subordinate quotas.
  Spacing: aligned two-by-two regions, six offers, and five non-wrapping ledger
  rows; document height 900 and Wallet bottom 795.99 at the tested viewport.
  Colors: existing white surfaces and thin-border/theme tokens retained.
  Assets: original Alipay icon retained without approximation or distortion.
  Copy: redundant text removed while amounts, warnings, and payment actions stay.
- Final visual comparison: no unresolved P0/P1/P2. Browser title is GCC WebOS
  user center, one Portal shell, no default dialog, and zero error-console entries.
- Browser observed automatic summary/ledger GETs returning 200 without manual
  refresh. Away from Wallet for 64 seconds, no Wallet GETs were observed. In the
  latest reloaded code, view-all/return re-read the ledger first page with 200.
- Ordinary reload still returns to login. Source diagnosis confirms normal
  login is React-memory-only and the remember checkbox is not used by the auth
  request. This is explicitly unresolved, not masked by a frontend login flag.
- Used only the authorized disposable local account/challenge. No order was
  created, no payment performed, and no callback sent in browser acceptance.

### Final verification and lifecycle

- Node 22.23.1: frontend 58 files, 935 passed, 0 failed, 0 skipped; Admin build,
  Portal build and Portal artifact verifier passed. Bundle-size warnings remain
  non-fatal. Local verifier adapter configuration remains empty, not a
  production payment-configured artifact.
- Independent changed-scope review: 93 tests passed, 0 failed, 0 skipped; no
  unresolved P0/P1/P2. TDD covered removals, error retention, pagination/return,
  mutation invalidation, request deadlines, and account/view transition races.
- Initial root run: 4340 passed, 19 failed, 56 skipped. One new documentation
  metadata defect was corrected. The owned preview was stopped Vite-first and
  backend-second; stopped receipt and zero listeners were verified to remove
  port conflicts. Isolated root rerun: 4348 passed, 11 failed, 56 skipped (4415
  total). Remaining failures concern release/workflow contracts, path handling,
  and checkout normalization; no clean-baseline comparison was performed, so
  confirmed-pre-existing status and full-root success are not claimed.
- Strict document metadata validates 392 blocks; `git diff --check` passes.
  Logs are `.local-validation/*wallet-refresh*.log`, not for blanket commit.
- Owned loopback preview was restarted and retained on 5175/3457. Temporary
  viewport override is reset for handoff. No production, auth implementation,
  provider, merge, push, deployment, or real-account mutation took place.
- Next gate: approve exact login-persistence implementation scope and remembered
  session lifetime; any production release remains separately gated.

## 2026-09-07 follow-up: approved local login persistence

This section supersedes the earlier unresolved reload-login finding and retained
preview lifecycle. Risk A auth work is implemented locally under
`docs/PORTAL_SESSION_PERSISTENCE_PLAN.md`; it is not a production release.

- Worktree: `D:/Projects/proxy-gateway-minimal/.worktrees/portal-wallet-checkout-layout`;
  branch `codex/portal-wallet-checkout-layout`; base HEAD
  `986318c475f5d6ecd932cd1d5aba0d95d11ab4bf`, with task-owned dirty changes retained.
- Classification: local candidate / source-only. Chain remains
  `admin/portal/index.html` -> `admin/src/portal-main.tsx` -> `UserPortalPage` ->
  `admin/src/portal-static-preserve.css` -> `admin/dist-portal`.
- Ordinary login retains the existing 30-minute absolute TTL. Remember-me uses
  the approved seven-day absolute TTL, bound through existing authentication/MFA.
  The Cookie is HttpOnly and server-validated; credentials are not placed in web
  storage. No schema/migration or authentication-policy relaxation was needed.
- TDD covered strict transport, expiry, revocation, stale-account context,
  malformed Cookie recovery, actual request deadlines, bounded auth locks,
  logout-pending recovery and old credential-handoff cleanup.
- Final browser QA exposed a real same-page BroadcastChannel race that an earlier
  empty-postMessage mock missed. The page received its own login-change event,
  invalidated hydration and stayed at login despite a successful Cookie. Two
  realistic asynchronous dispatch tests were red; sharing a same-page channel
  instance fixed it without removing cross-tab invalidation. Final focused
  frontend tests: 32 passed, zero failed.
  A separate final read-only review verified the frozen helper/page hashes,
  reran those 32 tests with zero failures or skips, and found no new P0/P1 in
  the shared-channel and logout-recovery changes.
- Final in-app browser checks on `http://127.0.0.1:5175/`: ordinary login enters
  Wallet directly, reload keeps the selected Wallet view, one bootstrap restores
  the same context without extending expiry, and no Portal write is replayed.
  Browser response TTL was 1800 seconds. Remembered login returned 604800 seconds,
  produced a persistent local Cookie and restored in a second tab. Explicit
  logout hid content in both tabs; reload remained logged out; Cookie count zero.
- Verified HttpOnly and SameSite=Lax via attribute-only browser inspection; no
  credential was printed. Local Cookie is intentionally non-Secure over opted-in
  loopback HTTP. Production HTTPS attributes are covered by source tests, not a
  live production check. No seven-day wall-clock soak is claimed.
- Wallet DOM and screenshots retained the desktop four-region layout, six Alipay
  actions and cleaned copy. No payment button was exercised. Wallet summary,
  ledger, offer and recharge-order reads returned 200. Browser JavaScript errors:
  zero. No new mobile design or pixel-equivalence claim is made in this auth pass.
- A separate existing `/api/portal/payments/current` hydration call still returns
  401: both HEAD and this source have no handler and the existing source-boundary
  contract excludes the removed legacy payment routes. Hydration catches it; it
  is not a Cookie failure or a Coins order-source failure. This obsolete frontend
  call was recorded rather than adding an unapproved payment endpoint.
- Final frontend: 60 files / 968 passed / 0 failed / 0 skipped. Admin and Portal
  builds (including TypeScript), Portal verifier and diff check pass. Three new
  backend session files: 52 passed / 0 failed / 0 skipped. Verifier adapter config
  is empty/local; chunk-size warnings are non-fatal, not production readiness.
- Root suite: 4467 total / 4400 passed / 11 failed / 56 skipped. Remaining failures
  concern release/workflow/source and path-normalization checks. No clean-baseline
  comparison was performed, so they are not claimed as proven pre-existing. Full
  root success, merge readiness and production approval are not claimed.
  The post-broadcast-fix rerun, with both preview listeners stopped, reproduced
  the same counts and eleven names in
  `.local-validation/portal-cookie-root-frozen-20260907.log`. Strict document
  metadata validates 392 blocks and `git diff --check` passes.
- Browser acceptance ended logged out. Stopped Vite before the disposable backend;
  successful stopped receipt includes marker-owned root absence verification.
  Both 5175/3457 listeners are absent and temporary viewport emulation is cleared.
  The disposable local data is removed and cannot be recovered; no customer data
  was present. No merge, push, deploy, live payment or production mutation occurred.
- Next production gate must coordinate the backend Cookie transport, explicit
  trusted HTTPS origin and frontend artifacts, after validation blockers are
  resolved. This cannot be deployed as an isolated static refresh.

final result: local browser acceptance passed; full root regression not green;
production release not authorized
