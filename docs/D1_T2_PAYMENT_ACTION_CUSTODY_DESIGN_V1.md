# D1 T2 Payment Action Custody Design v1 — Draft

Status: TECHNICAL RECOMMENDATION ONLY. No Durable Object, key, binding, route, migration or deployment was created.

## 1. Source problem

payment-store.mjs currently accepts an HTTPS redirect/QR action, stores next_action_url on a payment receipt and returns the raw value through receipt/order projections while the order is pending or entry-ready. The existing HTTPS normalization removes URL credentials and fragments but cannot prove that signed query parameters, opaque bearer paths or QR payloads are non-capability-bearing.

D1 must never store the raw URL or QR payload. A raw action value is a short-lived capability and belongs in a separately authorized custody service.

## 2. Technology decision

Recommend Cloudflare Durable Objects with SQLite storage as the v1 custody service.

| Option | Decision | Reason |
|---|---|---|
| Durable Objects SQLite storage | RECOMMENDED | Strongly consistent per object, transactional state transitions, single-order serialization and private object storage |
| Workers KV | REJECT | Eventual consistency can delay visibility/revocation; not suitable for immediate payment-action state changes |
| R2 | NOT NEEDED FOR V1 | Useful for larger blobs and encrypted object storage, but does not replace the per-order transactional lifecycle/authorization state machine |
| D1 | POINTER ONLY | Stores action_ref/type/expiry/status; never stores raw URL/QR or ciphertext |

Official references:
- Durable Objects SQLite storage: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- Durable Objects transactions: https://developers.cloudflare.com/durable-objects/api/transactional-storage/
- Durable Objects alarms: https://developers.cloudflare.com/durable-objects/api/alarms/
- Durable Objects PITR: https://developers.cloudflare.com/durable-objects/reference/point-in-time-recovery/
- Workers KV consistency: https://developers.cloudflare.com/kv/reference/faq/
- R2 data security: https://developers.cloudflare.com/r2/reference/data-security/

## 3. Ownership and storage model

Use one Durable Object instance per opaque payment order reference. The browser never addresses the Durable Object directly; only an authenticated Worker route can call it.

The DO stores:
- order_ref and account_ref binding;
- action_ref and action_type;
- expires_at and lifecycle status;
- encryption_key_id;
- nonce and AES-256-GCM ciphertext (authentication tag included);
- created_at, updated_at, consumed_at, revoked_at and purged_at;
- provider_request_ref / attempt_ref idempotency binding, if available.

Encrypt the raw URL or QR value with AES-256-GCM using a key supplied through a Worker secret binding. Bind order_ref, account_ref, action_ref, action_type, expiry and schema version as authenticated additional data. The key is never in D1, source, logs, traces or migration exports. The DO storage's platform encryption is defense in depth, not a substitute for application-layer encryption.

D1 payment receipt stores only:
- next_action_ref;
- next_action_type;
- next_action_expires_at;
- action lifecycle state / redacted receipt reference.

Do not retain next_action_url in a D1 JSON payload, receipt metadata, generic logs or analytics.

## 4. API contract

### putAction

Input: orderRef, accountRef, type, rawValue, expiresAt, providerRequestRef, attemptRef.

Behavior:
- Worker validates order/account ownership and provider action type.
- DO encrypts rawValue and stores it transactionally.
- Operation is idempotent for the same orderRef + providerRequestRef + attemptRef.
- A repeated identical operation returns the same actionRef.
- A repeated operation with a different raw payload under the same provider attempt returns a conflict/reconciliation result; it must not silently replace the capability.
- Return actionRef, type, expiresAt and a redacted receipt only.

### resolveAction

Input: authenticated account session, orderRef and actionRef.

Behavior:
1. Worker reads the current D1 payment order and receipt.
2. Verify the session account owns the order, the D1 pointer equals actionRef, and the order is still pending/entry-ready.
3. DO verifies the same order/account/action binding, status active and expiresAt > now.
4. Decrypt and return rawValue only to the authenticated Worker response.
5. Response uses Cache-Control: no-store and Pragma: no-cache. Never log the response body or query string.

Resolution is repeatable while active. Reading a QR or redirect does not consume it; the current source UI allows users to reopen an active action after refresh. Consumption occurs only after verified payment settlement.

### markConsumed / revokeAction / purgeExpired

- markConsumed: provider-verified settlement or terminal success; idempotent.
- revokeAction: cancellation, replacement, refund/void or security revocation; idempotent.
- purgeExpired: delete ciphertext after expiry or terminal transition; retain only a redacted tombstone for the approved replay/reconciliation window.

## 5. State machine

ACTIVE -> CONSUMED on verified settlement.
ACTIVE -> EXPIRED when provider/order expiry is reached.
ACTIVE -> REVOKED on cancellation, replacement or explicit security revocation.

No transition returns a terminal state to ACTIVE. A replacement action receives a new action_ref. The D1 pointer is updated with compare-and-swap before the old action is revoked.

## 6. Cross-store failure recovery

D1 and Durable Objects do not share a transaction. Use an explicit saga:

| Failure point | Required behavior |
|---|---|
| Provider returns URL; DO put fails | Do not write URL to D1 and do not return it. Keep order reconcilable; retry/requery provider with the same provider request reference or mark reconciliation_required |
| DO put succeeds; D1 pointer update fails | DO object is an orphan, not customer-visible. Retry the same idempotent put/pointer update; orphan cleanup deletes it after bounded grace |
| D1 pointer exists; DO is temporarily unavailable | Fail closed with a retryable safe error. Do not fall back to a raw URL in D1 |
| D1 pointer exists; DO object missing | Return action_unavailable and enqueue reconciliation; do not mark payment successful |
| Action is replaced | Create new DO action first, CAS-update D1 pointer, then revoke old action. If CAS fails, clean up the new orphan |
| Payment settles but DO revoke fails | D1 payment state is authoritative for display/resolve; resolve checks D1 state on every request and denies. Retry DO cleanup asynchronously |
| DO restored to an earlier point | D1 current order state and pointer gate every resolve; reconcile DO lifecycle with D1 and verified provider receipts before restoring action availability |

## 7. Alarm, expiry and restore

- Set one DO alarm for the earliest active action expiry in that order.
- Alarm cleanup is idempotent and may be invoked more than once.
- Cloudflare documents a bounded automatic retry policy for failed alarms. Do not depend on it as the only cleanup guarantee: on incomplete work, persist the next retry/alarm explicitly; expired reads are denied inline even if cleanup is delayed.
- A scheduled reconciliation sweep compares D1 pointers/order states with DO records and deletes orphans/terminal ciphertext.
- Durable Objects PITR can restore historical state. After restore, reconcile against current D1 and provider settlement state before any action is resolvable; never trust restored ACTIVE state alone.

## 8. Retention and security operations

- Raw action ciphertext expires no later than provider expiresAt and is purged on verified settlement, cancellation, revocation or expiry.
- Redacted tombstone retention is the maximum of provider replay, support and reconciliation windows; exact duration remains a domain-owner decision.
- Key rotation uses key IDs and a read key ring until all live ciphertext is re-encrypted or expired.
- No raw action value in Worker logs, DO logs, traces, exceptions, audit metadata or CI artifacts.
- Access policy is server-side only; require account/order binding and a current authenticated session.
- Recovery drills must include DO outage, D1 pointer failure, stale restore, duplicate provider callback and orphan cleanup.

## 9. Approval gates

Before implementation, obtain explicit approval for:
1. Durable Object class/namespace and account ownership.
2. Secret binding and AES key rotation/retirement procedure.
3. Provider action TTL and redacted tombstone duration.
4. Authenticated resolver route and Portal UI changes.
5. Alarm/reconciliation schedule, monitoring and restore runbook.
6. Payment-domain owner and independent security review.

This document chooses a technical direction for review. It does not authorize implementation, key creation, deployment or D1 mutation.
