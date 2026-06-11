# Portal API Agent Route Hotfix

Date: 2026-06-11, Asia/Shanghai.

Risk tier: A production runtime hotfix.

Target:

- Vultr Japan control plane: `45.76.222.52`

This record contains only redacted operational facts. It does not contain raw
environment values, raw runtime config, raw logs, SQLite rows, account
credentials, subscription URLs, tokens, passwords, private keys, runtime
credential material, or customer data.

## Problem

After the `005` edge-agent production activation, the User Portal login page
loaded its static assets, but backend challenge loading failed:

- `POST /api/portal/human-challenges`: HTTP 401;
- `POST /api/portal/password/session` with an empty body: HTTP 401;
- Browser-visible login form showed the human challenge input disabled with an
  `unauthorized` error.

The response shape matched the internal data-plane agent authentication error,
not the normal portal validation path.

## Cause

The `005` runtime mounted the internal data-plane agent router before the global
console-auth middleware. The router-level authentication middleware was scoped
too broadly, so it intercepted non-internal paths such as `/api/portal/*`.

The data-plane agent authentication middleware must only cover:

- `/api/internal/data-plane-agent/*`.

## Scope Executed

Executed on the Japan control plane:

- backed up the current runtime `server/routes/data-plane-agent.mjs`;
- narrowed the data-plane agent router authentication middleware to the
  internal data-plane agent path prefix only;
- syntax-checked the changed runtime file;
- restarted only `proxy-gateway-candidate.service`.

Not executed:

- no DNS, Nginx, provider firewall, payment, account/password, live-order, SGP
  runtime, Xray, Hysteria2, TUIC, or Mihomo mutation;
- no subscription URL, token, password, private key, raw environment, raw
  config, raw log, SQLite row, runtime credential material, or customer-data
  output.

## Backup

Japan backup reference:

- `portal-api-agent-route-hotfix-20260611T093340Z`

## Validation

Public endpoint validation:

- portal static root: HTTP 200;
- `POST /api/portal/human-challenges`: HTTP 201;
- empty `POST /api/portal/password/session`: HTTP 400;
- `POST /api/portal/human-challenges` on the subscription domain: HTTP 201;
- public internal data-plane agent route: HTTP 404;
- public Admin route: HTTP 404.

Japan loopback validation:

- health: HTTP 200;
- unauthenticated internal data-plane agent route: HTTP 401.

Browser validation:

- User Portal login page loaded successfully;
- human challenge input was enabled;
- human challenge prompt displayed as an arithmetic challenge;
- `unauthorized` error was no longer visible;
- login button was enabled.

Local validation:

- `git diff --check`: passed.

## Source Absorption

Repo-only source absorption was completed after the production hotfix:

- imported the edge-agent HTTP route, protocol service, node service, and tests
  from the verified `005` artifact source line;
- kept internal data-plane agent authentication scoped to
  `/api/internal/data-plane-agent/*`;
- added a regression test proving `POST /api/portal/human-challenges` remains
  public when edge-agent routes are enabled;
- ran targeted data-plane agent, state, and user-portal tests;
- ran full `npm test`, `npm run project-state:check`, and `git diff --check`.

This source absorption did not mutate production.

## Result

The User Portal login challenge flow is restored.

The internal data-plane agent route remains private/protected, and public Admin
remains blocked. This hotfix did not create live orders and did not mutate SGP
data-plane runtime.

## Follow-Up

Future-order automatic desired-state publication remains a separate Risk A gate.
