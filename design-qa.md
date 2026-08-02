# Portal desktop IA design QA

Status: PASS

Scope: signed-in desktop Portal only. The existing production-candidate shell,
navigation component, wallet model, locale preference, and theme preference are
reused without a parallel shell or data contract.

## Visual grounding

- Reference: user-provided desktop sidebar crop with first-class Coins Wallet
  and Settings destinations.
- Candidate: local synthetic Portal at a 1440 x 769 Chrome viewport, light and
  dark themes.
- The reference and candidate were reviewed together. The candidate preserves
  the existing GCC WebOS shell styling while adopting the requested ownership:
  Coins Wallet and Settings live in the sidebar, and the Header contains the
  active page title plus global search.

## Checks

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

## Intentional non-goals

- The full sidebar visual language was not redesigned in this change.
- Mobile layout was not changed.
- Login and registration retain their pre-authentication preference controls.
- No production, payment-provider, schema, wallet-ledger, or runtime behavior
  was changed.
