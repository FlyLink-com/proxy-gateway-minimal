# Xray CLI zero-field compatibility: source validation

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: source_only_xray_cli_zero_compatibility_20260929
  superseded_by: null
  last_verified_at: 2026-09-30
  production_authority: false
```

Initial date: 2026-09-29 UTC. Incident follow-up in Draft PR #754. Dated
continuations below distinguish later read-only production binding from local
source and isolation evidence; no production recovery is claimed.
Risk: A recovery envelope / B source core. Expected PR count: 1, reuse #754.
Initial source-step Production/AWS impact: none. No SSH or protocol process was
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

## 2026-09-30 continuation: accepted binary identity and candidate closure

This dated section supersedes the pending binary/CI statuses above; those
sections remain the historical record of the earlier attempts. This is still
recovery preparation, not a production restoration or authorization to replay
an execution record.

The exact source head `899a2b500c492fcb8cf9fe75842227b41e763bb3` has seven
successful GitHub checks, including Linux Validate, and one skipped governance
snapshot. These results cover that source head; the full Windows result above
is not relabeled as passing.

After the operator instructed the incident lead to continue the combined
recovery plan, new one-shot binary binding02 completed at
`2026-09-30T05:44:55Z`. The runner/executor digests were verified before use:

- runner: `8a65f5980bdb248d919010ea15a4ab70bcf8f0d32cd3517228fb7dabc90d3621`;
- executor: `1bd5f88726c3fdb26bb0181e6a1add3c5e1ffb4294fb8994b43af76f866bf33b`.

The accepted aggregate receipt proves Linux amd64 Xray `26.3.27`, Go `1.26.1`,
one version invocation and stable process identity before/after. The running
binary SHA-256 is
`8255dd939c34cf966cc91517b6324dd3c8d0bcf49ffac8beca049a38c46845ed`.
No configuration, database, checkpoint, statistics or raw log was read by this
binary-only command; no service, configuration or accounting was changed.
Binding02 is consumed. Binding01 and recovery05 remain terminal and cannot be
replayed.

The public [Xray 26.3.27 release](https://github.com/XTLS/Xray-core/releases/tag/v26.3.27)
was downloaded and checked against its published digest. ZIP SHA-256:
`23cd9af937744d97776ee35ecad4972cf4b2109d1e0fe6be9930467608f7c8ae`.
Only its Xray executable was extracted; its digest exactly matches the running
binary above. Tag commit is `d2758a023cd7f4174a5a5fa4ff66e487d4342ba0`.
This establishes the actual artifact for isolated reproduction, not the
failure-time statistics payload.

The independent collector candidate combines exact base
`01d4aacd72f45890c3b17b72433b63bbf6754768` with only three reader files from
`899a2b500c492fcb8cf9fe75842227b41e763bb3`. Its complete import closure is
20 files: 17 unchanged base files, preserving material continuation, bindings,
journal, counter transition and accounting; three patched local/CLI/parser
files. Candidate source manifest SHA-256:
`a08971b639928cbcd2c09f9215a49a93500735d1cbf99503223096a060dfb06a`.
All 15 provenance/closure/reader tests pass. This candidate does not replace
the business-backend release or current pointer.

### Actual same-binary reproduction

The lead subsequently ran the exact admitted Xray binary in disposable WSL
user/mount/network/PID namespaces with private tmpfs and loopback-only synthetic
VLESS and HTTP traffic. No production configuration, credential or data was
copied. The executed runner digest was
`afbfca565c779a36b36f78cf0613fdaa7758f98b2d56efc2a082be3dbb5e559d`;
the shell wrapper digest was
`0d56d76e7725b1f86752673e530313a9689de1939b32dc57d8fe7cca9185b52f`.

| Real observation | Rows | Omitted values | User omitted values | Old strict | New CLI adapter |
| --- | ---: | ---: | ---: | --- | --- |
| Cold before client traffic | 6 | 4 | 0 | reject | accept |
| Uplink-only held HTTP request | 8 | 3 | 1 | reject | accept |
| Bidirectional HTTP | 8 | 1 | 0 | reject | accept |
| Restarted server, cold | 6 | 4 | 0 | reject | accept |
| Restarted server, bidirectional HTTP | 8 | 1 | 0 | reject | accept |

Both real zero omission and real user zero omission were observed. Missing
direction and explicit-null counterexamples remained rejected; those negative
cases and the all-zero named pair were synthetic-only, not physical events.
This proves a concrete same-binary compatibility defect and the correction's
behavior, not the exact unavailable failure-time payload or the original
runtime-identity drift cause.

The real run exited zero, confirmed its child processes exited, checked all
four fixture ports were released and removed only its own marked temporary
directory. Separate synthetic TERM-with-KILL-escalation, direct-KILL and
timeout cleanup tests left zero active captured descendants. No production
service was started or stopped by this validation.

In disposable WSL storage, admitted Node `22.23.1` and locked
`better-sqlite3 12.10.0` loaded the actual candidate command and passed an
in-memory SQLite transaction/rollback check. Native binary SHA-256 in that
validation environment:
`6d316eabea16375bc58500077b7a00ae3b6db51c660cf4cf3ca68c1596612f99`.
This is not proof of production ABI compatibility or final dependency-path
admission. Both the transient probe and sustained collector must resolve the
same admitted candidate reader tree. The service entrypoint AND working
directory, actual loaded sandbox, dependency closure and reverse rollback must
be bound before promotion; replacing the probe alone is insufficient.

### Recovery and rollback composition

Ten local WSL composition tests pass with no skips. The lead independently
ran the final set, and an independent Bugbot-compatible fallback reviewer ran
the same set and found no defects within its explicitly synthetic boundary.
This was not a dedicated Bugbot product invocation.

- Eight tests combine unchanged05 runtime-switch/supervisor code, actual
  candidate collection/journal/sample-writer code, real SQLite transactions
  and the accounting acceptance proof. High existing counters initialize a
  zero-byte, zero-sample baseline. Two later synthetic cycles record only
  300 new bytes in ten samples, reconciling samples, rollups and checkpoint.
- Mid-application failure restores touched configurations in reverse order;
  pre-timer baseline failure restores all three configurations in reverse.
- After baseline, an injected source failure stops only the owned synthetic
  timer and preserves 150 committed bytes, five samples and checkpoint
  sequence one; it does not restore the database or delete the journal.
- A failure after samples commit replays the same pending operation without
  a second debit. A SQL transaction failing during its second write rolls back
  all partial rows, then pending recovery applies the intended five samples
  exactly once. Candidate drift stops before backup/collection, and an unbound
  activation cannot stop an unrelated timer.
- Two additional cases call the actual06 dependency-injected baseline,
  postcheck, guard and safety adapters against the same real collector/journal
  and SQLite fixture. Both paths bind source manifest `a08971b6...06a`.

Frozen composition runner SHA-256:
`4c36c5053089ea2c08a4608515802df44b50efd71a287cc24f14bba2107e8728`.
Python test SHA-256:
`ab8c6c57ebeb356481ccb7e0844a182e7ed7d0fe327a0744026f1a6bbbb5f8f6`.

Service state, source replies, dependency-admission proof and the minimal
control-store SQL adapter remain synthetic. These results do not cover actual
native06 systemd operations, host source reads, production dependency admission
or natural production billing. All receipts identify simulation-only evidence.
No consumed05 production CLI was rerun.

### Native06 preparation and unresolved review

A local, explicitly unfrozen06 candidate now mechanically derives twelve real
runtime/baseline/guard/supervisor files from05 rather than replacing its recovery
flow with the dependency-injected test harness. All seventeen original05 file
hashes remain protected and unchanged. Two supporting modules bind the complete
source tree, actual loaded command and working directory, dependency file set,
Node ABI, actual native SQLite import, commit and rollback. Missing, extra,
duplicate, unstable or unresolved linked dependencies fail closed; a scan limit
is not coverage proof. No existing node_modules tree is presumed suitable.

The lead ran 22 Node and six Python targeted tests with zero failures/skips.
Independent Bugbot-compatible review repeated those tests and nevertheless
reproduced one P2 finding in the unfrozen native safety function:

- `native/jp_metering_safety_06.mjs:106-108` sets journal quiescence and
  `stateUnknown=false` before its final ownership check. If the first ownership
  check succeeds but the second fails, the function stops with `complete=false`
  and `safety_ownership_unverified`, yet incorrectly reports known state.
- The reproduction used synthetic I/O, not real systemd. The finding is not
  corrected or re-reviewed in this step; the selected review workflow requires
  the operator's next-step confirmation. A regression must cover ownership
  loss at the second check, not only rejection before any stop command.
- The reviewer attempted to exclude a builder test, but that filter did not
  exclude it. It rewrote identical local unfrozen derived files. Afterwards
  all twelve derived, twelve referenced05 and two support hashes matched the
  pre-review bindings. There was no content change or production action, but
  the review cannot be described as having performed no filesystem writes.

The local CLI remains unconditionally disabled with `candidate_not_frozen`,
deadline unbound and `productionReady=false`. No production installer, final
dependency receipt, fresh configuration/backup binding or execution approval
has been completed for06. These remain real work, not merely missing approval.

### Remote-source boundary: SGP Xray and Hy2

The five sources are Japan Xray/Hy2/TUIC and Singapore Xray/Hy2. The Singapore
pair executes the remote `config.sgp.readerScript --read-stdin` and imports its
own local-source and parser dependencies. Updating the twenty-file Japan
candidate does not update that remote tree. A descriptive candidate label that
incorrectly said SGP Hy2/TUIC was corrected; no remote behavior was changed.

Source inspection confirms that old `01d4aacd` uses the generic strict parser;
`899a2b50` selects the CLI protobuf adapter. If the remote tree remains old,
omitted named-row zero values can still fail there. A remote `ok:false` prevents
this fresh five-source batch from producing new samples; existing pending
recovery is a separate path. This is a proven code path, not evidence that the
current SGP output is malformed or that its deployed reader is old.

The bounded existing records and fresh #743 Deploy Notes do not bind the modern
SGP remote reader's canonical path and complete six-file import closure or
prove that it contains this fix. July tunnel-based records are not equivalent.
No new SGP production read was performed. A later exact read may bind only the
selected remote entry and five dependencies, the running SGP Xray binary and
non-reset statistics-shape categories; no raw identities or values are needed.
Any remote repair needs its own explicit scope, backup and rollback decision.

### Stage result and remaining acceptance

Same-binary physical reproduction, minimal source-candidate construction and
the local recovery/rollback composition are complete at the boundaries above.
The native06 review finding, SGP remote binding, actual production dependency
admission, final installer and fresh production inputs remain unresolved.
Source CI for `899a2b50` is reused only because this continuation changes evidence
documentation, not its code; this is not CI for a subsequent documentation head.

No business-backend redeployment, configuration switch, collector activation,
database restore or historical debit occurred in this continuation. The only
production action was the consumed binary-only binding02 read described above.
Production metering restoration is not claimed. Completion still requires the
approved exact new recovery execution, continuous natural collection, and
reconciled accounting only after the new zero-debit baseline.

## 2026-09-30 operator-approved P2 correction and packet preparation

The operator explicitly approved correcting the reported P2 and continuing
local packet preparation, excluding production switching. No SSH, production
read, upload, service operation or accounting mutation occurred in this step.

The fixed native safety check verifies final ownership before setting journal
quiescence and known-state flags. TDD on both Windows and WSL first recorded
five safety cases: three passed and two failed for second-check false/throw.
After the minimal order correction, affected safety plus disabled-CLI tests
passed six of six on each platform, with no skips. The lead independently
repeated these tests. Initial rejection never sends stop; second-check failure
leaves `complete=false`, `stateUnknown=true`, and journal unverified; normal
success is unchanged.

The mechanical builder and its corresponding safety output changed, not the
consumed05 files. All seventeen05 hashes, the other eleven native stage files
and both support files remain unchanged. The lead verified all stage/support
hashes and the refreshed top-level template binding without running the full
builder. Corrected safety SHA-256:
`1aa01b3ef7ef62188b8f0412c46a18c7aa9ade9183466988df007a7b3fd03833`.
Native derivation manifest SHA-256:
`d128460c0fd234e1a2f03b59f8830a90d04b21da84ffe980193676c5d6d872f6`.

A separate offline payload assembler now verifies the exact twenty source
files, fourteen private stage/support modules and an explicitly pinned complete
runtime dependency file list before copying into a marked disposable local
fixture. Existing output is refused, input hashes and closed output sets are
checked, and a partial write cannot create a successful manifest. Twelve tests
pass on Windows and WSL, including a forty-four-file assembly using actual
source/native modules but seven explicitly synthetic, non-loadable dependency
files. The input manifest is not installed as a host-verified dependency
receipt. This is an offline assembler, not a finished production installer or
proof of production Node/native-module compatibility.

One independent Bugbot-compatible fallback reviewer closed the original P2,
found no new issue within the local-only payload scope, and independently ran
the six safety and twelve payload cases on both Windows and WSL. Its exact
positive test filter excluded the builder; reviewed code hashes were unchanged.
No dedicated Bugbot product invocation or production-ready review is claimed.

A separate SGP six-file source-binding preparation module also passed local
tests: Windows twenty passed with three explicit POSIX/symlink skips; WSL
twenty-three passed with zero skips. The lead independently repeated both.
Actual six-file current899 and old01d4 Git bytes were tested in synthetic
configuration/directory fixtures, without importing their runtime readers.
Parent-directory escape regression cases were corrected during implementation;
unlisted imports, missing roles, changed hashes, hardlinks, symlinks and metadata
drift fail closed. This module only permits OS-temporary fixtures and its CLI
always rejects; it has no production transport, deadline or execution authority.
Its source SHA-256 is
`ae2224a25925a83c58e554fa81d80c39bc3695a8673a69db9496bece039fd239`.
This module received lead implementation review/tests, not the separate
Bugbot-compatible P2/payload review above. Actual SGP path/version remains
unknown and no remote diagnosis was performed.

The previous exact-head CI for `89812974d9a3fedfece15fb3c80ff0ee80f87ff0`
was freshly confirmed with seven successes and one governance snapshot skip.
This continuation only updates repository evidence; local private recovery
preparation scripts are not claimed to be covered by repository CI. Prior
same-Xray physical and ten-case composition evidence are reused unchanged.
All candidate production CLIs remain disabled and the execution package remains
unfrozen. Fresh remote-source/dependency binding, final host installation,
current input/backup bindings and exact production authorization remain open.

## 2026-09-30 installer and precise read preparation

The operator approved continuing the remaining preparation, not production
switching. Exact head `b62a158e39410d6dcec06f62a6a155dacfbbf7fb` was freshly
observed with seven successful checks and one governance snapshot skip;
repository-wide Linux Validate run `36681314787` passed. Those checks do not
cover the separately held local recovery scripts.

A local-only immutable installer candidate now separates file installation
from runtime admission. Windows and existing WSL Node22.23.1 each passed all
twelve tests; the lead independently ran both. Tests install/read back all
forty-four fixture files, reject existing/escaping/linked targets, preserve
partial-copy failure evidence and reject non-loadable synthetic native bytes.
No successful production dependency receipt is emitted from these tests.
An additional-field regression was first observed red, then the installer
rejected extra Node fields and retained the independently observed executable
path in its receipt. This implementation test does not cover production input.
The earlier actual Linux native smoke is retained as separate evidence; its
old fixture directories are absent, and this continuation did not download or
rebuild dependencies. Successful actual native import through the new installer
remains pending, as do final fixed production paths and authority.

The Japan dependency-reader preparation passed nine Windows tests with one
explicit POSIX symlink skip and ten WSL tests with no skips. It reads only the
fixed old collector release's selected three-package runtime file set and the
executing Node identity; it never imports native code or opens SQLite. The full
selected file list, not the entire node_modules tree, is bounded and checked
twice. Missing roles, links, changed files/sets and incomplete scans are rejected.
This is preparation for the next exact read, not a new production observation.
An independent Windows repetition subsequently reported eight passes, one
`dependency_changed` failure on the happy-path fixture, and one POSIX skip;
its WSL repetition passed all ten. The failure is retained as an unresolved
local validation discrepancy, not replaced by the lead's earlier green run or
presented as evidence of a production failure.

The SGP reader binder now derives exactly six source roles from the reader path
inside the hash-bound historical collector config. It only reads source bytes
and metadata, never runs that reader or reads statistics. Known Git-source
closures and mixed-import compatibility are checked before classification.
Author and independent reviewer each observed 25 Windows passes / four POSIX
skips and 29 WSL passes / zero skips. These are isolated local tests, not fresh
SGP source observations.

The new one-shot controller's author and independent reviewer each ran 35
Windows and 35 WSL tests, all passing with no skips. It rejects unpinned sources,
overrides, reused records,
unexpected receipts and transport failures. Synthetic Node execution also
checks Japan-first composition and skips SGP import after Japan failure.
The lead's syntax-only self-test reports `unfrozen=true`, `sshInvoked=false`;
there are zero new execution records. These tests do not validate the missing
host-key-write constraints identified by independent review.

Local transport precheck confirmed the `vul1` alias, available tools and an
existing known-host entry without a network connection. Execution will override
the alias's `accept-new` default with strict existing-host-key checking. No
private key contents were printed or copied. All seventeen frozen05 source
hashes were rechecked unchanged; no consumed execution record was replayed.

Independent Bugbot-compatible fallback review completed with one open P2:
the outer fixed SSH argv has strict host-key checking but does not explicitly
disable `UpdateHostKeys` and `CheckHostIP`. Inherited SSH behavior can therefore
write known_hosts, violating the new read package's no-host-key-update boundary.
The reviewer reproduced the missing constraints without invoking SSH. No other
concrete P1/P2 was reported. This local-tool finding is not a newly observed
production metering fault. Per the selected review workflow, the finding was
not fixed without the operator's next instruction. Source pins remain null;
neither the read package nor recovery06 was frozen or executed. Latest inputs,
new backups/rollback, successful installed native-runtime admission and exact
production approval still remain outstanding. This continuation did not change
production, and these evidence updates are local pending submission.

## 2026-09-30 tool-only correction continuation

The operator authorized continuing non-project tool corrections within the
existing incident scope without separate confirmations for each compatibility
issue. This does not authorize a production read, install or recovery switch.
No business source, protocol behavior, identity, accounting or migration was
changed. Exact PR head `b62a158e39410d6dcec06f62a6a155dacfbbf7fb` remains Draft
with seven successful checks and one governance snapshot skip at this readback.
The previous source CI is reused; it does not cover local private tools.

The SSH transport regression first failed on both missing outer options and
the inner `CheckHostIP` constraint. The fixed argument lists now explicitly
disable host-key and IP additions while retaining strict existing-key checking.
No SSH config or known_hosts file was modified. Controller Windows/WSL each
passed 36 tests. SGP binding passed 25 Windows tests / four platform skips and
29 WSL tests / zero skips.

The Japan reader's earlier Windows discrepancy was deterministically reproduced
with unrelated sibling-directory creation during a read. Before the fix, the
final regression fixture produced 13 passes / one failure / four skips on
Windows and 17 passes / one failure / zero skips on WSL. The minimal fix limits
ancestor comparisons to dev/ino/mode/uid/gid; selected directories and files
still use complete metadata signatures, membership checks and content hashes.
After the fix, Windows passed 14 tests / four platform skips; WSL passed all
18 tests. WSL covers actual open-file ancestor replacement, directory-link
replacement, mode changes and the original symlink test skipped on Windows.
Windows also checks changed dev/ino through local injected metadata. The lead
repeated the final Windows suite successfully. Earlier failures remain in the
historical record rather than being relabelled as passes.

Unchanged installer evidence (12 Windows and 12 WSL tests) and prior same-Xray
source/isolated-composition evidence are reused. No full-project inventory or
source validation was restarted. A new independent, read-only review is limited
to these tool corrections and their exact source bindings. Production reading,
successful installed native-runtime admission, final recovery06 installation,
fresh configuration/new backup/rollback bindings and recovery authorization
remain separate outstanding work.

The independent Bugbot-compatible fallback review completed with no actual
P1/P2 remaining in the scoped tool correction. It independently ran 36 Windows
controller tests, 39 Windows JP+SGP passes / eight platform skips, and 47 WSL
JP+SGP passes / zero skips. Final six code/test hashes stayed unchanged and
the production execution-record count remained zero.

Read package `jp-reader-dependency-binding-20260930-01` is now locally frozen,
awaiting exact operator approval. Its FROZEN manifest SHA-256 is
`4eddaf04edc8cc40a5ba553a8f909cedb82c23b7ea886bb59777ca58d4499dc6`;
controller SHA-256 is
`c57dbfcfbc29dd78c0a4efdb6f66985dbcec61b0a07a546357e9c09f8534a93d`;
streamed-program SHA-256 is
`348790b3ea071b5e7473b4f605343d61fbe4b7bbd01cfe0c5980907c2fd61d98`.
All seven bound files were rehashed successfully. Source pins now being set
does not mean execution approval. The proposed read is Japan Node/selected
dependency source metadata plus hash-bound SGP six-file reader provenance;
it does not open databases, statistics, checkpoints, logs or env, install files,
alter services or change accounting. Latest start is 2026-09-30 15:55 UTC,
expiry 16:00 UTC (08:55/09:00 America/Los_Angeles). No production connection
occurred. The larger recovery06 mutation package remains unfrozen/unexecuted.

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
