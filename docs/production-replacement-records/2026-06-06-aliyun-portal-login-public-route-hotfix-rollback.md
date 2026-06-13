# Aliyun Portal Login Public Route Hotfix Rollback

Date: 2026-06-06 Asia/Shanghai.

Risk tier: A.

## Scope

Approved target was Aliyun current candidate runtime only. The approved mutation
was limited to backing up `server/app.mjs`, adding the portal login public paths,
and restarting `proxy-gateway-candidate.service`.

Forbidden items were not changed: DNS, Nginx, firewall/security group, payment,
account/password generation, subscription URL/token/password output, SQLite row
dump, and Mihomo configuration.

## Execution Summary

- Current candidate runtime was `ae68072d727b`.
- Initial symptom was portal login returning `Unauthorized` before account
  credential verification.
- Preflight found the current `server/app.mjs` lacked these public paths:
  `/api/portal/human-challenges`, `/api/portal/password/session`, and
  `/api/portal/password/second-factor`.
- A backup was created under the protected candidate backup area.
- The three paths were inserted and `server/app.mjs` passed `node --check`.
- `proxy-gateway-candidate.service` restarted and stayed active.

## Validation Result

The hotfix failed validation:

- health check: recovered after restart
- portal static: ok
- Admin blocking: ok
- `/api/portal/human-challenges`: still returned `401 Unauthorized`
- `/api/portal/password/session`: still returned `401 Unauthorized`

Follow-up read-only inspection found the hotfix scope was insufficient. The
current runtime release does not include the newer portal human challenge,
password credential services, or password/human route wiring required by the
newer portal static UI. This is a runtime/static version mismatch, not an
account-password mutation.

## Rollback

The approved rollback path was executed:

- restored the backed-up `server/app.mjs`
- restarted `proxy-gateway-candidate.service`
- revalidated service health

Post-rollback validation:

- `proxy-gateway-candidate.service`: active
- loopback health: 200
- public health: 200
- portal static: 200
- portal public Admin route: blocked

## Next Gate

The next fix is not another route-only patch. It requires an approved runtime
upgrade or hotfix release that contains the user portal authentication stack:

- public route allowlist for login preflight endpoints
- `user-portal.mjs` password and human challenge endpoints
- portal human challenge service
- portal password credential service
- runtime `state.mjs` wiring for `userPortalRoutesEnabled`, `userPortalAuth`,
  `portalHumanChallenges`, and password credentials

Validation should prove the login preflight endpoints work without requiring
console token and without creating live orders or exposing credentials.
