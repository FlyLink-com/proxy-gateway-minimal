# Admin Workspace

This file is a responsibility and navigation entrypoint. It does not establish
global, release, deployment, runtime, or production authority.

## Responsibility

`admin/` owns the React and Vite source workspace used to build the protected
Admin console, the customer User Portal, and the public company site. Shared UI
code lives here even though the three frontend surfaces remain distinct release
and deployment units.

## Entry Points

- [src/main.tsx](src/main.tsx) starts the Admin console.
- [src/portal-main.tsx](src/portal-main.tsx) starts the User Portal.
- [src/site-main.tsx](src/site-main.tsx) starts the company site.
- [vite.config.ts](vite.config.ts),
  [vite.portal.config.ts](vite.portal.config.ts), and
  [vite.site.config.ts](vite.site.config.ts) define the three builds.
- [package.json](package.json) defines the local frontend scripts.

## Development

Run `npm run admin:dev` from the repository root for the loopback-only Vite
development server. Keep surface-specific behavior in the matching feature or
entrypoint instead of assuming that one frontend bundle represents all three.

## Validation

For Admin source changes, run `npm run admin:test`, `npm run admin:build`, and
`npm test`, followed by `git diff --check origin/master...HEAD`. Portal or
company-site build changes also use their corresponding build and verify
scripts from the root [package.json](../package.json).

## Boundary

This workspace does not own control-plane APIs, provider settings, deployment,
DNS, or runtime mutation. Admin must remain protected; a successful frontend
build is artifact evidence only and does not establish production state.

### Portal public source boundary

The Portal still shares this package and its toolchain; it is not yet a separate
package or repository. Its formal entry remains `src/portal-main.tsx`, using
`features/user-portal/user-portal-client.ts` for the HTTP client and public types.
Local synthetic clients and account fixtures belong to the separate
`user-portal-preview-client.ts` entry, used only by the existing development
preview and tests. Do not re-export preview factories from the formal client.

The five general-purpose helpers in `src/shared/public/` own locale handling,
the modal frame, clipboard access, error text, and class-name composition.
Portal consumers import them directly. Their former `app/`, `components/`, and
`lib/` paths remain compatibility re-exports for existing consumers, not a
second implementation. Public helpers must not import surface-specific code.

Run `npm run frontend:boundaries:check` from the repository root after changing
these imports. The guard checks the source graph, including re-exports, rather
than relying on unused demo code being removed by the bundler. This boundary
work does not redesign pages, change API contracts, or establish an independent
release pipeline; those remain separate follow-up work.

### Portal desktop entry

The existing Portal build remains the legacy `/portal` source entry and
continues to write `dist-portal`. The bounded desktop entry is built separately
with `npm run admin:portal:web:build` and writes `admin/dist-portal-web`; its
static base is `/web/`, so it is served at `/web/` and `/web/register/` while
calling the same-origin `/api/portal` endpoints. Verify it with
`npm run admin:portal:web:verify`.

Desktop display links are intentionally small and local to the `/web` entry:
`手机版` and `自动选择` point to the mobile root (or
`/portal/register`) with `display` set while preserving other query parameters
and the hash. The desktop bundle does not perform device detection or redirect
itself. Public images are emitted into the desktop artifact and receive the
`/web/` prefix at runtime; the existing `/portal` asset paths are unchanged.

See [desktop routing acceptance](DEVICE_ROUTING.md) for implementation scope,
paired mobile behavior, validation results and the remaining promotion gate.
