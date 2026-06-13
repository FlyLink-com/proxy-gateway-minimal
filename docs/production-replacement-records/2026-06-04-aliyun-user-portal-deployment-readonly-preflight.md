# Aliyun User Portal Deployment Read-Only Preflight

Date: 2026-06-04, Asia/Shanghai.

Risk: A read-only preflight.

Scope:

```text
Assess whether the newly closed repository-local user portal panel can be
deployed to Aliyun for validation now.

This preflight performs no upload, archive creation, Nginx change, systemd
change, service restart, DNS change, firewall change, SQLite mutation, public
portal exposure, account handoff, payment activation, subscription issuance, or
edge/AWS mutation.
```

## Request

Operator requested moving the user panel to Aliyun for deployment and testing
after local panel closeout.

## Local Repository Inventory

```text
active checkout: D:\Projects\proxy-gateway-minimal
current branch: feat/install-config-wizard
local HEAD: 3e1c9a79ec852e3ca5a4f013a42e3aabf7c97185
local HEAD summary: fix: version Aliyun candidate startup shim
```

The local checkout is not a clean release candidate. It contains many modified
and untracked files across docs, Admin UI, server services, tests, project-state
files, and archive moves. User-portal-relevant dirty files include:

```text
admin/src/features/user-portal/user-portal-client.ts
admin/src/features/user-portal/user-portal-page.tsx
admin/src/features/user-portal/totp-preview.ts
admin/src/test/user-portal.test.tsx
docs/USER_PORTAL_AUTH_BOUNDARY.md
docs/USER_PORTAL_FLOW.md
docs/USER_PORTAL_HUMAN_CHALLENGE_DESIGN.md
docs/USER_PORTAL_PRODUCTION_AUTH_PLAN.md
docs/production-replacement-records/2026-06-04-user-portal-local-panel-closeout.md
server/routes/user-portal.mjs
server/services/platform/portal-access-requests.mjs
server/services/platform/portal-human-challenge.mjs
server/services/platform/portal-initial-account-issuance.mjs
server/services/platform/portal-password-credentials.mjs
server/services/platform/portal-support-requests.mjs
server/tests/*portal*.mjs
```

Because the current user panel work is not committed as a clean release
candidate, uploading the working tree would package unrelated dirty state and
would not meet the project deployment gate.

## Known Aliyun Runtime From Latest Record

The latest recorded Aliyun candidate runtime state is:

```text
current Aliyun candidate release: 3e1c9a79ec85
candidate service: proxy-gateway-candidate.service
public subscription boundary: https://sub.globalcirclecat.com/
control DB path setting: present in protected host .env
rollback release: da33de295cb0
```

Source record:

```text
docs/production-replacement-records/2026-06-02-aliyun-control-db-path-upgrade-success.md
```

That means the Aliyun candidate runtime is currently on the same Git commit as
local `HEAD`, but it does not include the uncommitted local user-panel changes.

## Public Boundary Read-Only Probe

No token, login, POST, write, or Admin credential was used.

```text
GET https://sub.globalcirclecat.com/api/health
  status: 200

GET https://sub.globalcirclecat.com/api/admin/subscriptions
  status: 404

GET https://sub.globalcirclecat.com/sub/clash.yaml
  status: 401

GET https://sub.globalcirclecat.com/
  status: 200

GET https://sub.globalcirclecat.com/#/portal
  status: 200

GET https://sub.globalcirclecat.com/api/portal/human-challenges
  status: 200, served static HTML

GET https://sub.globalcirclecat.com/api/portal/access-requests/current
  status: 200, served static HTML
```

Interpretation:

- The current public HTTPS boundary is healthy.
- Public Admin API remains blocked by the public boundary.
- No-token subscription access remains rejected.
- `#/portal` currently returns the same static shell as the root site and does
  not prove that the user portal bundle or backend portal routes are live.
- The GET probes to `/api/portal/*` returned static HTML, not a verified portal
  API response. No POST probe was performed because portal challenge or order
  submission could become a state-changing test depending on routing.

## Frontend Exposure Risk

The normal Admin Vite shell routes by hash:

```text
#/portal-preview -> local preview portal
#/portal -> HTTP portal client
otherwise -> Admin shell
```

Therefore, deploying the normal `admin/dist` bundle to the public root would
make the Admin static shell the default route. Even if public Admin APIs stay
blocked, exposing the Admin shell publicly is outside the documented boundary.

The currently deployed public site uses the separate static site build path
(`admin/dist-site`). That build does not currently provide a customer portal
entry.

## Deployment Decision

Direct Aliyun deployment is blocked.

Blockers:

```text
1. No clean release candidate includes the new user portal panel changes.
2. Current working tree is dirty and contains unrelated changes.
3. Normal Admin bundle is not safe to deploy to the public root because it
   defaults to the Admin shell.
4. Public portal exposure, production credential flow, backend challenge flow,
   and production storage/route posture are still separate A-tier gates.
```

## Safe Next Path

Recommended next sequence:

```text
1. Create a clean release candidate that contains only the reviewed user portal
   panel and required backend/default-off services.
2. Add or build a portal-only/static entry if public browser testing is needed,
   so the public default route cannot expose the Admin shell.
3. Run local validation from the clean candidate:
   npm run admin:test
   npm run admin:build
   npm test
   git diff --check origin/master...HEAD
   npm run project-state:check
4. Prepare an Aliyun private validation execution record for candidate-only
   deployment.
5. After exact approval, upload the exact clean archive to the Aliyun candidate
   release directory, run npm install/build steps as specified by the runbook,
   switch only the candidate `current` symlink, and restart only
   `proxy-gateway-candidate.service`.
6. Validate only loopback/private portal API and static bundle behavior first.
7. Keep public Nginx/DNS/firewall unchanged unless a later exact public portal
   exposure gate exists.
```

## Not Performed

```text
archive creation: not performed
upload/scp/rsync/Cloud Assistant mutation: not performed
npm install on Aliyun: not performed
Admin/static bundle deployment: not performed
Nginx reload/config mutation: not performed
systemd restart: not performed
DNS mutation: not performed
firewall/provider rule mutation: not performed
SQLite write/migration: not performed
portal account handoff: not performed
payment activation: not performed
subscription issuance: not performed
public portal exposure: not performed
token, subscription URL, password, private key, .env value, SQLite row, or
customer data output: not performed
```

## Preflight Result

Do not deploy the current dirty working tree to Aliyun.

The next actionable gate is not "deploy now"; it is:

```text
Prepare a clean user-portal release candidate and an Aliyun private validation
execution record.
```

Only after that candidate exists should the operator approve a mutation gate
with exact release identity, allowed target path, allowed service restart, and
rollback release.
