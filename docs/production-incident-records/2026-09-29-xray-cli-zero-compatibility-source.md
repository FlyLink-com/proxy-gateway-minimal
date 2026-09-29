# Xray CLI zero-field compatibility: source validation

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: source_only_xray_cli_zero_compatibility_20260929
  superseded_by: null
  last_verified_at: 2026-09-29
  production_authority: false
```

Date: 2026-09-29 UTC. Source-only incident follow-up in Draft PR #754.
Risk: A recovery envelope / B source core. Expected PR count: 1, reuse #754.
Production/AWS impact: none in this source step. No SSH or protocol process was
started; no configuration, identity, service, database or accounting mutation.
Source `identity_impact: false`: identity matching and protected material are
unchanged. Any later runtime configuration repair retains its separate identity
gate and explicit production authorization.

## Intent and evidence boundary

The consumed recovery05 failed with `local_statistics_counter_invalid` during
both Xray after-apply and rollback probing. A subsequent approved one-shot
statistics-shape read on 2026-09-29 at 22:36 UTC passed strict parsing with no
shape errors and confirmed the main meter still stopped. Its success does not
establish the shape at05 failure time, identity health or metering recovery.
Neither consumed record may be replayed.

Public upstream XTLS/Xray-core commit
`6243d2a26e1136fc73a2b9cd5d9a8331a6d28ecc` demonstrates a concrete format
compatibility risk: `showJSONResponse` invokes `reflect.MarshalToJson` with
zero-field omission in its internal reflection path, and `Stat.Value` is an
`omitempty` scalar. A named zero-value row can consequently omit `value`.
This upstream source is not a verified version of the production binary.

Primary sources:

- [CLI serializer](https://github.com/XTLS/Xray-core/blob/6243d2a26e1136fc73a2b9cd5d9a8331a6d28ecc/main/commands/all/api/shared.go)
- [Omission rules](https://github.com/XTLS/Xray-core/blob/6243d2a26e1136fc73a2b9cd5d9a8331a6d28ecc/common/reflect/marshal.go)
- [Stat scalar definition](https://github.com/XTLS/Xray-core/blob/6243d2a26e1136fc73a2b9cd5d9a8331a6d28ecc/app/stats/command/command.pb.go)

## Minimal source change

- Keep `parseStrictXrayUserCounters(payload)` unchanged.
- Add `parseXrayStatsCliProtobufUserCounters(payload)` in the same module. Only
  an actually present named row lacking its own `value` receives scalar zero;
  the original parser then checks names, references, duplicate directions,
  complete user pairs and safe integer sums. Input objects are not mutated.
- The strict CLI reader explicitly uses that adapter and rejects raw duplicate
  JSON keys before `JSON.parse` can discard an earlier value. Its fixed
  non-reset query, local observation time, timeout and buffer bounds are kept.
- Do not normalize missing root fields, rows, directions, users, null or invalid
  explicit values. `stat: []` remains no observations, not all-user zero usage.
- Do not change Hy2/TUIC HTTP JSON semantics, the legacy direct strict-parser
  command, baseline/ledger rules, schema or identity resolution.

The strict CLI reader is shared by `scripts/lib/full-metering-local-source.mjs`
and the sustained collector composition in `server/state.mjs` when
`collectionScope` is present. A future recovery overlay and the production
collector's actual reader path must both be bound in release preparation;
installing only one does not establish both are corrected. No business-backend
redeployment or collector activation is authorized by this document.

## Source validation

TDD before implementation: five failed tests reproduced omitted user values,
omitted inbound/outbound values, local-source propagation, and a duplicate-key
acceptance defect. The valid duplicate-key fixture was corrected before recording
this red boundary; malformed JSON is not used as evidence for duplicate detection.

After implementation and the explicitly synthetic startup-to-zero-to-natural-
traffic sequence: six affected suites passed 198/198 on Windows and 198/198
under WSL Node 22.23.1, zero failures/skips. One independent Bugbot-compatible
fallback review reported no findings and independently ran the same 198 tests.
This was not a dedicated Bugbot product invocation or physical Xray startup.

Full Windows `npm test` completed: 5,305 tests, 5,239 passes, 10 failures,
56 skips, no cancellations. One failure was this new record's initially missing
document metadata; it is now corrected. The strict document-authority check passes
(411 records), and its test suite passes 69 with 4 platform skips, zero failures.
Two unrelated unchanged source-closure tests use LF-only marker strings against
CRLF checkout files. Independent diagnosis reproduced the other seven unchanged
Windows failures: five passed with an in-memory CRLF-to-LF read adapter; the
remaining two are POSIX-only pathname assumptions in the project-contract mock
and source-environment expectation, reproduced with Windows path fixtures.
No unrelated tests or checkout line endings were changed. These focused fixture
results do not turn the actual full run green; exact-new-head Linux CI remains
separate and pending. Prior-head CI does not validate this source. No merge or
deployment occurred.

## Actual same-binary isolation remains pending

The existing shape01 receipt proves executable stability before/after its query
but does not return a version or binary digest. Candidate-stage receipts bind
configuration digests, not the protocol binary. No matching local Xray artifact
was found in the already inventoried incident assets. Therefore neither the
synthetic startup sequence nor public upstream serialization is claimed as
production-identical cold-start reproduction.

Next gate: a new precisely bounded binary-only read (version/hash and process
stability; no configuration, statistics, database, checkpoint or logs), followed
by matching public-artifact admission and the already authorized disposable
loopback isolation. Failure to match the binary stops that physical validation.
Then freeze a new repair/recovery package with fresh backup and reverse rollback,
zero historical debit and natural-collection acceptance. Do not relaunch05 or
start the meter on the strength of these source tests.

## Precisely approved binary-only read attempt

The operator subsequently approved new package
`jp-xray-binary-binding-20260929-01` for one binary/version-only read through
the known-host-bound `vul1` alias. Exact runner/executor pins and unused records
were checked before its single launch at 2026-09-29T23:05:58Z.

The local receipt is terminal `transport_failed`, `consumed: true`,
`transportAttempted: true`, `versionCountKnown: false`. No remote receipt was
accepted; whether the remote read/version command began is unknown. There was
no requested configuration, service, identity, statistics or accounting mutation.
The record must not be replayed. Installed binary identity and physical cold-start
validation remain pending. Only local transport diagnosis may continue without a
new production gate; this failure is not evidence of an Xray parser root cause.

## Agent / Task Routing

Lead agent: incident source integration and final verification.
Supporting agents used: read-only artifact binding and parser-impact analysis;
one independent Bugbot-compatible fallback review (not the dedicated product).
Primary unit: control-plane-app source / strict Xray CLI reader.
Secondary units: none changed in production.
Follow-up agent suitability: bounded validation preparation; production recovery
remains lead-owned because it crosses runtime identity and accounting gates.
Recommended next owner: incident lead with operator approval for the exact new
production read and later exact recovery mutation.
