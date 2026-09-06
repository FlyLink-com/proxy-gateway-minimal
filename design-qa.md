# Compact marketplace cards — scoped follow-up QA

final result: passed

- Risk: B; local-only presentation follow-up in `D:/Projects/proxy-gateway-minimal/.worktrees/portal-product-card-polish`, branch `codex/fix-portal-product-cards`, base HEAD `6c37d543a1698192e03c8195dc1730f0eee3b523` plus preserved local changes. No commit, push, new PR or production action.
- Classification: **local candidate**. Entry/bootstrap/stylesheet/output remain `admin/portal/index.html` -> `admin/src/portal-main.tsx` -> `UserPortalPage` -> `admin/src/portal-static-preserve.css` -> `admin/dist-portal`.
- Scope: remove the visible category headings Plans and Data packs from both marketplace implementations while retaining translated accessible region names. Actual product titles, summaries, prices, purchase/reserve semantics and deferred-transition controls are unchanged.
- Shared cards use 20px padding and 14px content gaps; price spacing is 6px with no extra padding, and action top padding is 4px. Price remains 48px; primary button remains at least 48px high.
- Selected sources: `C:/Users/g/AppData/Local/Temp/codex-clipboard-b8279033-bf4c-4172-abc6-6a72ff7a8a44.png` (2318 x 742) and `C:/Users/g/AppData/Local/Temp/codex-clipboard-44053f50-8ad1-4574-8556-dca42d082b28.png` (2240 x 782). These are enlarged annotated content crops, not a request to change fonts, colors or product names.
- Chrome desktop evidence: `.codex-artifacts/portal-product-card-polish/compact-cards-desktop.png` (1440 x 769 capture). Three plan cards and two data-pack cards retain their rows, with zero visible category h2 elements. Each card measures 264.992 CSS px high, down from the pre-change 304.992px; all buttons measure 48px. Cards are approximately 355.33px wide in the final desktop viewport.
- Narrow evidence: `.codex-artifacts/portal-product-card-polish/compact-cards-mobile.png`, captured after a 390 x 844 viewport override. The document has 375px client/scroll width (scrollbar excluded), so no horizontal overflow; cards are 301px wide and 264.992px high, buttons 48px. The existing bottom navigation and long-page scrolling remain. Viewport override was reset afterward.
- Both reference images and both final screenshots were opened together in one comparison input. Compared the same loaded Chinese/light catalog with dialogs closed, accounting for the reference crop scale. Titles, price hierarchy, normal-weight summaries, blue CTA, borders and radius are retained; requested whitespace and category labels are removed. No clipped card content or actionable visual defect found within this scope. No image assets or dependencies were added. No mobile source was supplied; narrow-screen evidence validates adaptation, not pixel identity.
- Browser uses the authorized disposable local account at `http://127.0.0.1:5175/`; login and anti-bot check succeeded after refresh. Catalog is loaded, no dialog is open, and no order, recharge, callback or purchase submission was made. Browser is left signed in on the marketplace; both owned loopback services remain running for preview, so cleanup is intentionally not performed.
- Validation: targeted RED 50 passed / 6 failed -> GREEN 56 passed / 0 failed; later Data packs assertions were added after implementation and passed without a separately claimed RED. Full Admin: **54 files / 799 passed / 0 failed** on Node v22.23.1. TypeScript and Portal build/verifier passed; existing large-bundle warning remains.
- Known limits: the pre-existing Vite development WebSocket/send-error messages remain in console; this is not a clean-console claim. No new dark-mode, purchase-preview or production verification was performed for this heading/spacing-only follow-up. The prior full-server failure evidence below remains unresolved and was not rerun or waived. This scoped visual pass does not close the broader historical rollout gates.
- Final closeout: Admin build/verifier, scoped ESLint and `git diff --check` also passed. The existing bundle-size and Git line-ending warnings are retained, not classified as new failures.

---

## Historical checkpoint — unified catalog before compact-card follow-up

# Unified marketplace catalog design QA

final result: blocked

## Current scope and verified implementation

- Risk: B; one continuing Portal UI change, no new PR, commit, push or deployment.
- Worktree: `D:/Projects/proxy-gateway-minimal/.worktrees/portal-product-card-polish`; branch `codex/fix-portal-product-cards`; HEAD `6c37d543a1698192e03c8195dc1730f0eee3b523` plus local changes.
- Classification: **local candidate**, not production identity.
- Entry chain remains `admin/portal/index.html` -> `admin/src/portal-main.tsx` -> `UserPortalPage` -> `admin/src/portal-static-preserve.css` -> `admin/dist-portal`.
- Each category now occupies a full row. Product grid: three columns above 1100px, two at 721–1100px, one at 720px and below.
- Plans and data packs use one shared title / prominent Coins price / summary / single CTA card. Catalog Details, repeated metadata and notices are removed.
- Purchase terms, delivered benefits and accepted Coins remain in confirmation, bound to the current `quote.offer`. Purchase and deferred reserve remain distinct actions; this is not an automatic purchase.
- The five local UI harness products use consumer-facing copy. Exact IDs, versions, amounts, benefits and local safety markers are unchanged. No production catalog was edited.

## Source and visual validation boundary

- Selected source: `C:/Users/g/AppData/Local/Temp/codex-clipboard-aac2023e-d91d-49f5-9e36-023c2d8287d4.png`, 2273 x 766 source pixels, red annotations indicating three equal product slots.
- Intentional adaptation: keep existing light/dark theme tokens and fonts, preserve real Coins prices and available SKUs; no invented quarterly package, fiat conversion, recommended badge or recurring charge.
- Browser: user-selected Chrome, `http://127.0.0.1:5175/`.
- The updated harness required a clean restart. Chrome is now at the local login screen awaiting confirmation for its fresh anti-bot challenge.
- **No current rendered catalog screenshot or source/implementation comparison yet.** Previous screenshots below are historical and do not prove this iteration.
- Therefore current browser geometry, focus, primary-preview interaction, mobile/dark appearance and console checks are pending. Code, build and component tests are not substituted for visual evidence.
- Required fidelity surfaces: typography, spacing, tokens and consumer copy are implemented but await rendered comparison; no new image asset is required or generated.

## Validation recorded so far

- TDD card/CSS: 16 failed / 29 passed before the change -> **45 passed / 0 failed** after it.
- Purchase integration: **87 passed / 0 failed**, including quote-bound notices and retained async/focus/order safeguards.
- Final full Admin suite: **54 files, 796 passed / 0 failed**. Two shared legacy text assertions were updated after the old technical message caused seven initial failures; all routing and no-legacy-checkout assertions remain. Four further tests cover the deferred-list style boundary and Chinese/English consumer loading/unavailable copy.
- TypeScript, Portal build + verifier, Admin build + verifier, targeted lint, and `git diff --check`: passed at this checkpoint. Existing >500 kB bundle warnings remain.
- Local UI display + harness: **15 total / 14 passed / 0 failed / 1 Windows platform skip / 0 cancelled**.
- Full server: **4287 total / 4220 passed / 11 failed / 56 skipped / 0 cancelled**, exit 1. Complete log: `.codex-artifacts/portal-product-card-polish/catalog-server-validation.log`. The suite is **not green**; failure causes were not classified or waived.
- Independent read-only review found P0=0, P1=0 and one P2: shared product styles still used by the existing deferred-transition list. The list now has independent grid/card/title/facts/actions classes scoped under its existing queue. Its time, amount and cancellation behavior remain covered; new boundary tests failed before the fix and passed afterward. Final full Admin, builds, verifiers and scoped lint passed after this correction.
- Follow-up independent source review confirms that P2 is closed: P0=0, P1=0, open P2=0. This does not replace the still-pending rendered browser comparison.
- Old Vite stopped before old API; both listeners were zero and old owned p41188 temporary root was absent. New preview listeners are loopback-only. Historical temporary roots were not touched.
- Root checkout `package.json` and `vercel.json` hashes remain unchanged. No production, real account, order, payment or callback action.

## Remaining gate

- After the user confirms this fresh anti-bot check, complete local login, then compare desktop/mobile screenshots with the selected source and verify purchase-preview -> close without submitting an order.
- Keep current result blocked until that browser evidence exists.

---

## Historical predecessor QA — not evidence for the current unified catalog

# Subscription pricing-card design QA

final result: passed

## Scope and identity

- Risk: B. One compact Portal UI change, continuing the existing card-polish work. Expected PR count: 1; no PR created or pushed in this iteration.
- Worktree: `D:/Projects/proxy-gateway-minimal/.worktrees/portal-product-card-polish`.
- Branch: `codex/fix-portal-product-cards`; base HEAD: `6c37d543a1698192e03c8195dc1730f0eee3b523`, plus the uncommitted UI changes.
- Classification: **local candidate**, not deployed production identity.
- Entry: `admin/portal/index.html` -> `admin/src/portal-main.tsx` -> `UserPortalPage` -> `admin/src/portal-static-preserve.css` -> `admin/dist-portal`.
- No production, payment, pricing, fulfillment, database, deployment or backend changes.

## Visual target and comparison

- Source: `C:/Users/g/AppData/Local/Temp/codex-clipboard-79abeee6-3bdb-45d4-b4a7-fb2272654e21.png` (2482 x 960 pixels).
- User-requested adaptation: retain the current minimal palette, emphasize the package price, render details as body text, and make the purchase CTA prominent. This is not a pixel-for-pixel clone of the dark three-column marketing board.
- Accepted differences: existing Portal shell and plan/data-pack grouping; real server Coins amounts instead of sample fiat prices; no fabricated recommended badge, discounts, monthly-equivalent prices, auto-renewal promise, feature claims, gradients or decorative artwork. Existing fonts and theme tokens are retained.
- Browser: Codex in-app browser, `http://127.0.0.1:5175/`, authorized disposable local account. No real account or payment used.
- Desktop evidence: `.codex-artifacts/portal-product-card-polish/subscription-desktop.png`, 1000 x 1000 image and CSS viewport, DPR 1; Chinese/light, catalog loaded, dialogs closed. First plan card is 320 x 527 CSS pixels.
- Narrow light evidence: `.codex-artifacts/portal-product-card-polish/subscription-mobile-light.png`, 390 x 844 image and CSS viewport, DPR 1; Chinese/light, detail focus restored.
- Narrow dark evidence: `.codex-artifacts/portal-product-card-polish/subscription-mobile-dark-en.png`, 390 x 844 image and CSS viewport, DPR 1; English/dark, catalog loaded, dialogs closed. Card width 316px, usable CTA width 266px, CTA height 48px.
- The source, final desktop screenshot and final English/dark screenshot were opened together in the same comparison input. The complete first card and its text are readable at these dimensions, so an additional focused crop was not required. The supplied board has no mobile viewport; mobile evidence checks the requested adaptive hierarchy rather than claiming mobile source fidelity.
- Initial 1440px/cropped captures had compositor repetition, blur or incorrect scaling. They are excluded from QA. The final 1000px desktop and 390px screenshots replace that evidence. `subscription-card-desktop.png` is an unsuccessful capture experiment, not accepted evidence.
- CDP mobile metrics were used at both viewport sizes to obtain DPR 1 despite the host's zoom. This verifies responsive CSS, not native desktop pointer or mobile hardware behavior. No application CSS was changed to compensate for capture problems.

## Findings and required fidelity surfaces

No actionable P0/P1/P2 findings in the requested subscription-card scope after the valid comparison.

1. **Typography:** centered plan title and 48px/750 price numeral establish the reference hierarchy; 15px regular Coins unit is secondary. Details and notices use 14px/400 and 1.7 line height. English titles, amounts, and Coin types wrap without clipping. The existing product font stack is preserved rather than introducing an external font.
2. **Spacing/layout:** 24px card padding, 18px section gap and radius, separated price/content blocks, and bottom full-width actions. The details control is visually quiet but retains a 44px minimum target. At 390px the primary action remains 48px high and fully inside the card; document scroll width equals client width.
3. **Colors/tokens:** white surface and existing blue CTA in light theme; existing charcoal surface/cyan CTA in dark theme. Target notices retain all server text but no longer look like an orange warning box. Focus outlines and disabled colors remain theme-aware.
4. **Image/asset quality:** the selected portion is editable pricing UI, not a raster product illustration. The user explicitly requests simpler colors, so the dark gradient artwork is intentionally not reproduced. No images, hand-drawn SVGs, fake icons or new asset dependencies were introduced. Final evidence is sharp enough to inspect text, borders and controls.
5. **Copy/content:** catalog titles, amount, duration, traffic allowance, accepted Coins and notices remain server-authoritative. No price conversion or invented period/benefit. Purchase and reserve labels retain their separate meanings. Data-pack markup and style are not given the subscription modifier.

## Interaction and technical validation

- Desktop: Details -> server checkout preview -> Escape; dialog closes and focus returns to the originating Details button.
- Narrow English/dark: Buy with Coins -> confirmation preview -> Escape; focus returns to the originating purchase button. The final confirmation was never submitted.
- Orders subsequently showed `No orders yet`; sidebar available Coins remained 1000. No debit, recharge, order creation or callback was exercised.
- One Portal shell, no horizontal overflow at the tested sizes, no console warning/error entries in this browser session. Existing preview/quote API responses rendered successfully.
- TDD: new CSS expectations initially 2 failed / 17 passed, then 19 passed. Card expectations initially 8 failed / 30 passed; final valid-contract suite 36 passed after removing two impossible category/delivery fixtures.
- Full Admin suite: 54 files, **798 passed / 0 failed**, Node v22.23.1.
- TypeScript, Portal build/verifier, Admin build/verifier, ESLint on the ten changed TS/TSX files, and `git diff --check`: passed. Existing large-bundle warnings remain.
- Independent bounded review found no blocking component/CSS behavior or accessibility issue; browser QA is recorded separately above.

## Comparison history and limits

- One valid final visual comparison; no P0/P1/P2 application fix was needed after it. Earlier screenshot troubleshooting is not counted as a design-QA iteration.
- Passing means the requested local subscription-card adaptation passed, not that the entire repository, Portal or production release is ready.
- Full server tests were not rerun for this presentation-only iteration. The preceding phase's recorded 4217 passed / 11 failed / 56 skipped remains unresolved; this result does not reclassify those failures.
- All local theme/language changes were restored to Chinese/light. Temporary viewport emulation is cleared for handoff; both loopback-only preview services remain running for the user. Stop Vite before the disposable backend when preview ends so its owned temporary data is removed.
- No remaining P3 refinement is required for the requested scope. Broader marketplace group composition and the existing wallet summary wrapping are separate follow-ups.

## Implementation checklist

- [x] Subscription-only presentation, price prominence and body-style details.
- [x] Full-width, theme-aware primary CTA, keyboard focus and busy state retained.
- [x] Exact catalog prices, delivery text, notices and separate purchase/reserve handlers protected by tests.
- [x] Desktop/light and narrow light/dark browser evidence compared against the supplied reference.
- [x] Local build, tests, lint and verifier results recorded; production untouched.

---

## Retained predecessor QA (historical; not revalidated by this card iteration)

The following original desktop IA record is preserved from the base commit.

### Portal desktop IA design QA

Status: PASS

Scope: signed-in desktop Portal only. The existing production-candidate shell,
navigation component, wallet model, locale preference, and theme preference are
reused without a parallel shell or data contract.

### Visual grounding

- Reference: user-provided desktop sidebar crop with first-class Coins Wallet
  and Settings destinations.
- Candidate: local synthetic Portal at a 1440 x 769 Chrome viewport, light and
  dark themes.
- The reference and candidate were reviewed together. The candidate preserves
  the existing GCC WebOS shell styling while adopting the requested ownership:
  Coins Wallet and Settings live in the sidebar, and the Header contains the
  active page title plus global search.

### Checks

- One Portal shell, one sidebar, and one user-center navigation.
- Coins Wallet is a first-class navigation destination and uses the existing
  wallet read model.
- Settings is a first-class navigation destination.
- Locale and theme controls are present in Settings and absent from the
  signed-in desktop Header.
- Wallet balance, service status, ownership copy, and explanatory copy are
  absent from the signed-in desktop Header.
- Global search is visible in the Header and submits into the existing Orders
  view.
- Chinese/English switching and light/dark switching update the existing shell.
- No browser console errors were observed during the interaction pass.

### Intentional non-goals

- The full sidebar visual language was not redesigned in this change.
- Mobile layout was not changed.
- Login and registration retain their pre-authentication preference controls.
- No production, payment-provider, schema, wallet-ledger, or runtime behavior
  was changed.
