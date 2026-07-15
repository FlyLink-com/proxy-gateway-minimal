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
