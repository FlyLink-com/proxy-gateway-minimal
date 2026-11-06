# G4 — BWH Agent HTTPS Contract Slice

The contract core for the G4 step of the Cloudflare control-plane
roadmap: the BWH Agent's outbound-HTTPS communication contract with
the future Worker control plane, implemented as testable modules
against the formally approved G1-30 contract (15 testable clauses,
AGT-POLL / AGT-ADDR / AGT-ROT / AGT-DATA / AGT-MFT).

## Status and non-goals

- **Source only.** Nothing here is installed, wired into the running
  server, or connected to BWH. The legacy `agent/production-edge-agent.mjs`
  and its private-address rule are **untouched**; the current phase
  (BWH authority, private addressing) is unchanged.
- **Worker source endpoints now exist as a separate local slice.** `workers/control-plane` implements `GET /v1/agent/desired-state` and `POST /v1/agent/receipts` against local synthetic D1 fixtures. This does not add routes to the live Node server, create remote resources, or connect BWH.
- **No timer is configured.** The systemd files are templates; the
  60-second interval in the timer template is deployment
  configuration and the G1-30 design target, not a configured fact
  (AGT-POLL-2).
- **The real node-side apply is not replaced.** `run-once.mjs`
  demonstrates the cycle with a staging-directory apply; staged
  generation directories and material files are owner-only (0700/0600),
  and the systemd template sets `UMask=0077`. The production config
  writers are an existing system behind a separate gate.
- **Manifest signing keys are not E4-A keys.** AGT-MFT-3: no E4-A
  code, keys, or security semantics are used; the canonicalization
  and hashing helpers here are written fresh for this contract
  (a contract test scans these modules for E4 references).

## Layout

| Path | Purpose |
| --- | --- |
| `manifest.mjs` | Signed desired-state manifest: canonical JSON, desired-state digest (refs + digests only), safe path-segment validation for generation, Ed25519 sign/verify, fail-closed verifier with anti-replay memory (AGT-MFT-1/2, AGT-DATA-1) |
| `key-rotation.mjs` | Communication-credential rotation state machine: 15-minute max dual-key overlap, recorded-auth precondition for revocation, expired candidate revoked while the current key is retained, exception blocks automatic progression, leak exception, comms-only scope guard (AGT-ROT-1..5) |
| `receipt.mjs` | Per-channel apply receipts in the existing protocol shape (`gccgw_data_plane_apply_receipt`) + versioned SHA-256 idempotency key over the canonical desired-state/generation/channel tuple; deterministic material ordering; deep redaction of detail payloads including authorization, cookies and subscription URLs; control-side ledger semantics (record exactly once, conflict on different outcome) (AGT-POLL-5, AGT-DATA-1) |
| `agent-client.mjs` | One oneshot poll cycle: single-instance locks, persisted claim idempotency key bound to a canonical node/channel-scope fingerprint (a new key is persisted when scope changes), pending-receipt recovery before new polling, refs-only payload boundary, local material resolution with digest check, generation/digest no-change skip, and no re-apply while receipts are pending (AGT-POLL-3..6, AGT-DATA-1..2) |
| `run-once.mjs` | Runnable oneshot entrypoint (env-configured; HTTPS addressing rule with loopback-only http exception; path-contained generation output; owner-only staged material files and directories) (AGT-ADDR-1, AGT-MFT-2, AGT-DATA-2) |
| `systemd/` | Service (Type=oneshot, hardened like the current unit) and timer templates — not installed (AGT-POLL-1/2) |
| `workers/control-plane/src/agent-protocol.mjs` | Local-only Worker endpoints for idempotent 120-second manifest claims, signed desired-state manifests and redacted idempotent receipts; synthetic D1 fixtures only |

## Clause map

| Clause | Where | Test |
| --- | --- | --- |
| AGT-POLL-1 oneshot, no daemon | `systemd/*.service`, `agent-client.mjs` (one cycle, no loop) | service template shape |
| AGT-POLL-2 interval is deployment config | `systemd/*.timer` | timer template content; no `setInterval` in the client |
| AGT-POLL-3 single-instance lock | `createMemoryLock` / `createFileLock` | concurrent cycle skipped; live stale owner is not stolen; dead-owner takeover is serialized; release checks owner token |
| AGT-POLL-4 generation+digest no-change skip | `runOnce` state comparison | second identical cycle is `unchanged`, apply count stays 1 |
| AGT-POLL-5 idempotent claim + receipt | Worker manifest-claim ledger, `receipt.mjs`, persisted Agent claim/receipt state | repeated claim key returns the same signed envelope within its lease; receipt key records once / conflicts; lost responses retry without duplicate apply |
| AGT-POLL-6 posture + failure never widens | client defaults, error mapping | defaults dry-run; fetch failure → `retry_later`, nothing changes |
| AGT-ADDR-1 no early relaxation | legacy agent untouched; `validateBaseUrl` in `run-once.mjs` | legacy validator still rejects public URLs; new rule requires https (loopback http dev-only) |
| AGT-ROT-1..5 rotation | `key-rotation.mjs` | window validity, revoke precondition, expired candidate revoked while current key is retained, exception blocks automatic progression, leak path, scope guard |
| AGT-DATA-1 refs/digests only, redaction | payload boundary in the client; `redactDetail` | material-bearing payload refused; passwords, authorization, cookies, subscription URLs and UUIDs never in receipts |
| AGT-DATA-2 local resolution + digest check | `createFileMaterialStore`, client digest comparison | digest mismatch and unsafe refs refused before apply |
| AGT-MFT-1 signature binds the tuple | `manifest.mjs` | tampering any bound field invalidates |
| AGT-MFT-2 local verify, fail-closed | `createManifestVerifier`, client | bad signature / expiry / replay / binding mismatch all rejected, no apply |
| AGT-MFT-3 no E4-A reuse | all modules | source scan test |

Tests: `server/tests/agent-g4-contract.test.mjs` (run by the root
`npm test`).

## The cycle, in one paragraph

The timer starts `run-once.mjs`; the client takes the instance lock,
fetches the desired-state envelope with a persisted claim
`Idempotency-Key` plus scope-bound auth headers (key id + timestamp +
nonce), refuses any payload that carries material, verifies the
manifest signature and binding locally,
recomputes the desired-state digest, skips if generation + digest
are unchanged, resolves each material locally by reference and
checks its digest, applies (unless dry-run / apply-disabled), and
submits one redacted receipt per channel under a deterministic
idempotency key. The Worker persists each claim for a 120-second
lease and returns the exact signed envelope on a same-key retry. After apply, the Agent persists its generation and
pending redacted receipts before network acknowledgement; if a response
is lost, the next tick replays those receipts without applying the same
generation again. The control-plane receipt ledger accepts identical
replays once and rejects a changed outcome. The Worker slice verifies
the same manifest and receipt contract against local synthetic D1.
