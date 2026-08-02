# Project Evidence Model v1 Design

## Status

- Design task risk: C
- Implementation risk: B
- Process: one source PR containing the approved design, implementation plan,
  code, tests, and validation evidence
- Expected PR count: 1
- Source baseline:
  `master@9ac85d18bbda7e2238e0cc589932dc7941523ecc`
- Production impact: none
- Production authority: none
- Provider, deployment, runtime, schema, auth, payment, and customer-data
  authority: none
- Design state: approved
- Implementation state: not started

## Purpose

Build a deterministic, repository-only mathematical model for the project's
release-to-runtime evidence chain. The model makes claims, observations,
conflicts, missing evidence, and evidence age explicit without treating source,
artifact, deployment, or runtime records as interchangeable.

The first version answers this bounded question for every registered release
unit:

> Given the versioned evidence available in this repository at an explicit
> evaluation time, which release-lineage claims are proven, contradicted,
> conflicted, unknown, stale, or undated?

The result is a read-only explanation and validation surface. It never grants
approval, authorizes a mutation, promotes an artifact, changes project state,
or claims that repository evidence is current production proof.

## Existing Authority Reused

The model composes existing source-level boundaries instead of replacing them:

- `project-state/*.json` remains the compact coordination view;
- `RELEASE_MANIFEST.md` remains the human-readable release identity contract;
- existing machine-readable artifact, Gate ledger, repair-policy, and receipt
  shapes remain their own fact sources;
- Gate governance remains the authority for stored Gate transition validity;
- Execution Contract v1 remains the authority for source-only execution intent
  and redacted process receipts;
- Git commit and tree identities remain the source identity basis;
- `gccgw` remains the operator CLI and command registry.

Project Evidence Model v1 does not create a second project-state registry, a
second Gate ledger, a deployment registry, or a runtime database.

## Selected Approach

Use a typed evidence graph evaluated with a four-valued evidence lattice and a
separate freshness dimension.

```text
versioned repository inputs
  -> repository evidence adapter
  -> normalized evidence facts
  -> typed evidence graph
  -> truth and freshness evaluation
  -> release-unit invariants
  -> deterministic redacted snapshot and check result
```

Each release unit owns an independent lineage subgraph:

```text
Source -> Artifact -> Release -> Deployment -> Runtime
```

Gate, approval, receipt, and observation facts attach as evidence relations.
They do not become lineage nodes with implicit authority, and evidence from one
release unit cannot satisfy another release unit's invariant.

Rejected alternatives:

- one finite-state machine per release unit, because a single linear state
  cannot faithfully represent multiple artifacts, deployment candidates,
  observations, or conflicting evidence;
- a general Datalog or external rules engine, because v1 needs a small fixed
  rule set and must not add a DSL, external runtime, or dependency;
- probability or confidence scores, because numerical precision would obscure
  the current hard distinction between evidence, absence, contradiction,
  conflict, and staleness;
- parsing prose documents as operational data, because narrative documentation
  is not a stable machine contract.

## Authority Boundary

Every model result declares:

```json
{
  "authority": {
    "production": false,
    "approval": false,
    "provider": false,
    "deployment": false,
    "runtimeMutation": false
  }
}
```

The model may describe a stored approval or receipt only as repository
evidence. It cannot determine that an approval is currently sufficient for a
production action, submit or consume an approval, or connect to an executor.

Any future connection to GitHub APIs, deployment providers, SSH, systemd,
production files, live runtime probes, credentials, or a real blocking Gate is
a separate design. A production-enforcing integration is Risk A and requires
fresh read-only inventory, an exact operator gate, staging or equivalent clean
validation, rollback, and post-action evidence.

## Scope

### Included in v1

- offline repository input discovery;
- Git source commit and tree identity;
- registered release-unit identity;
- source, artifact, release, deployment, and runtime evidence nodes;
- typed lineage and evidence relations;
- four-valued truth combination;
- evidence freshness evaluation;
- fixed release-lineage invariants;
- stable, redacted JSON serialization;
- a pure model library;
- `gccgw project model --json`;
- `gccgw project model check`;
- local and CI-consumable exit codes, without adding a required CI check.

### Excluded from v1

- GitHub API, Vercel, Cloudflare, Vultr, AWS, DNS, SSH, or live runtime access;
- production or deployment execution;
- approval submission, approval consumption, or approval sufficiency;
- account, order, payment, subscription, entitlement, quota, or usage-ledger
  modeling;
- schema migration or new SQLite tables;
- Admin or Portal UI;
- probability, confidence, or risk scores;
- automatic repair or state mutation;
- committed derived snapshots;
- queues, Redis, microservices, or a new service process.

## Mathematical Semantics

### Evidence truth

For claim `q`, truth is represented by a pair of evidence bits:

```text
Truth(q) = (support(q), refute(q))
```

The canonical values are:

| Pair | Name | Meaning |
| --- | --- | --- |
| `(0, 0)` | `unknown` | No accepted support or refutation exists. |
| `(1, 0)` | `proven` | Accepted support exists and accepted refutation does not. |
| `(0, 1)` | `contradicted` | Accepted refutation exists and accepted support does not. |
| `(1, 1)` | `conflicted` | Accepted support and refutation both exist. |

Evidence joins are monotonic bitwise unions:

```text
join((s1, r1), (s2, r2)) = (s1 OR s2, r1 OR r2)
```

This prevents later evidence from silently erasing a contradiction. Resolving
a conflict requires changing the versioned inputs or the rule that accepts
them; evaluation order cannot make a conflict disappear.

For a conjunction of required claims:

```text
support(A AND B) = support(A) AND support(B)
refute(A AND B)  = refute(A) OR refute(B)
```

The evaluator does not implement arbitrary user-supplied formulas in v1. Each
derived claim names one versioned built-in rule and its complete input claim
set.

### Freshness

Freshness is independent of truth:

```text
Freshness(q) in { fresh, stale, undated }
```

- `fresh`: every required supporting observation has a valid timestamp and an
  explicit versioned validity policy that remains valid at `evaluationAsOf`;
- `stale`: at least one required observation is older than its maximum age;
- `undated`: no required observation is stale, but at least one has no accepted
  observation time or no explicit validity policy.

V1 has no implicit global freshness duration. A fact is time-bounded only when
its registered source supplies an accepted `validUntil` or its built-in source
policy defines an exact `maxAgeSeconds`. Absence of either is `undated`, not an
infinite validity assumption.

Derived freshness is fail-closed:

```text
stale > undated > fresh
```

The greatest condition present in the inputs becomes the derived condition.
Stale evidence remains historically supportive or refuting, but it cannot pass
a current-evidence invariant.

### Invariant pass condition

An invariant passes only when both dimensions are exact:

```text
Pass(q) iff Truth(q) = proven AND Freshness(q) = fresh
```

`unknown`, `contradicted`, `conflicted`, `stale`, and `undated` all fail a
required invariant. A failure is explanatory evidence, not execution
authority.

## Typed Data Contract

The public contract is versioned as `project-evidence-model/v1` and validated
by a repository-owned JSON Schema.

### `EvidenceNode`

An evidence node contains:

- deterministic `id`;
- `kind`: `source`, `artifact`, `release`, `deployment`, or `runtime`;
- registered `releaseUnit`;
- safe `identityDigest` or approved portable identity;
- safe versioned attributes from an explicit allowlist;
- evidence references supporting the node's existence.

Absolute paths, raw URLs, hosts, ports, environment values, runtime config,
credentials, customer identifiers, and subscription material are forbidden.

### `EvidenceEdge`

An evidence edge contains:

- deterministic `id`;
- `from` and `to` node IDs;
- one typed relation;
- release-unit scope;
- evidence references;
- optional derived rule identity.

The v1 lineage relations are:

| Relation | From | To |
| --- | --- | --- |
| `builtFrom` | artifact | source |
| `contains` | release | artifact |
| `deploys` | deployment | release |
| `instantiates` | runtime | deployment |

All lineage relations must stay inside one release unit. The core lineage graph
must be acyclic.

Gate, approval, receipt, and observation records do not become lineage nodes.
They attach to claims through typed evidence bindings with roles
`supportedBy`, `refutedBy`, `observedBy`, or `authorizedBy`. `authorizedBy`
records a declared binding only; it never grants authority and never changes
the model's authority envelope. Evidence bindings are not traversed as lineage
and cannot create a lineage shortcut.

### `EvidenceClaim`

An evaluated claim contains:

- deterministic `id`;
- `subject`, `predicate`, and safe object or object reference;
- `truth` with both evidence bits and canonical name;
- `freshness`;
- typed `evidenceBindings`, each containing one role and one evidence reference,
  in stable order;
- `ruleId` for derived claims;
- `inputClaimIds` for derived claims;
- stable, allowlisted `reasonCodes`.

No free-form exception text, raw parser error, or source value is included.

### `EvidenceRef`

An evidence reference contains only:

- safe source kind;
- repository-relative file reference plus an optional validated JSON pointer;
- content digest;
- observation time and maximum age when the source defines them;
- safe source identity such as a commit digest or stored receipt reference.

The adapter normalizes path separators and rejects traversal, absolute paths,
URL-shaped paths, and unsafe keys or values.

### `ModelSnapshot`

The snapshot contains:

- contract and rule-set versions;
- `evaluationAsOf` and the clock source;
- normalized input digests;
- registered release units;
- nodes, edges, claims, and invariant results in stable order;
- safe diagnostics;
- the fixed authority envelope;
- a digest over the canonical snapshot content.

The digest includes `evaluationAsOf`. The same inputs, rules, and evaluation
time must produce byte-identical canonical business output regardless of file
enumeration, object insertion, or evidence discovery order.

## Repository Inputs

The repository adapter is the only filesystem-aware component. It reads a
fixed allowlist of repository-owned inputs:

- Git `HEAD` commit and tree identity;
- the registered release units and safe dated claims already present in
  `project-state/current.json`;
- `project-state/gates.json`;
- `project-state/repair-policy.json`;
- existing repository-tracked machine-readable identity and redacted receipt
  records explicitly registered by v1.

The adapter does not parse release prose to invent machine facts. Human-facing
documents remain evidence references and navigation authorities, not implicit
JSON databases.

A missing optional evidence source produces an `unknown` claim and a safe
diagnostic. Missing core model inputs, invalid JSON, Schema failure, an unsafe
field, or an invalid graph prevents model construction and returns exit code
`2`.

Derived output is generated in memory or written only to an explicitly chosen
temporary/output location by a future separately reviewed feature. V1 does not
write a snapshot file and does not add generated current state to Git.

## Component Boundaries

Implementation should follow the existing modular-monolith pattern:

| Component | Responsibility |
| --- | --- |
| `evidence-truth` | Four-valued joins, conjunctions, names, and pass predicates. No I/O. |
| `evidence-freshness` | Timestamp validation and deterministic freshness calculation. No system clock access. |
| `evidence-graph` | Node and edge validation, type constraints, release-unit isolation, and cycle detection. No I/O. |
| `repository-evidence-adapter` | Read the fixed repository input allowlist and emit normalized base facts. |
| `project-evidence-evaluator` | Apply the fixed rule set and release-unit invariants in deterministic order. |
| `project-evidence-snapshot` | Stable sorting, canonical serialization, safe diagnostics, and digest generation. |
| CLI adapter | Parse safe CLI options, inject the clock, print only approved output, and return a stable exit code. |

The likely implementation lives under
`server/services/project-model/`, with a thin script entrypoint and command
registration in the existing `gccgw` router. Exact filenames and interfaces
will be frozen in the implementation plan after this design is reviewed.

The pure components receive all dependencies as arguments. Only the repository
adapter reads files, and only the CLI adapter reads the system clock. No core
component imports Git, process environment, network, database, or CLI modules.

## Evaluation Pipeline

Evaluation always follows this order:

1. resolve and validate the repository root;
2. load the fixed versioned input allowlist;
3. validate JSON and safe-value boundaries;
4. compute normalized input digests;
5. normalize accepted base facts;
6. build the typed graph;
7. reject duplicate nodes, dangling edges, illegal relation types,
   cross-release-unit lineage, and lineage cycles;
8. join base truth values;
9. derive lineage claims in a fixed rule order;
10. calculate freshness against explicit `evaluationAsOf`;
11. evaluate every invariant per release unit;
12. stable-sort, serialize, and digest the safe snapshot.

The core evaluator requires `evaluationAsOf`. CLI commands accept
`--as-of <ISO-8601 UTC>`. When the flag is absent, the CLI captures current UTC
once, records `clockSource: "system"`, and passes that immutable value to every
component. Tests and reproducible comparisons always inject a fixed time.

## V1 Invariants

Each registered release unit receives these invariant results:

| Invariant | Pass requirement |
| --- | --- |
| `source_identity_known` | One exact source identity is proven with fresh evidence. |
| `artifact_binds_exact_source` | The selected artifact has one non-conflicted `builtFrom` relation to that source. |
| `release_contains_exact_artifact` | The selected release contains that exact artifact. |
| `deployment_binds_exact_release` | The selected deployment deploys that exact release. |
| `runtime_observation_matches_deployment` | Fresh runtime evidence instantiates that exact deployment. |
| `required_evidence_is_fresh` | Every required lineage observation is fresh and dated. |
| `evidence_has_no_conflict` | No required lineage claim has truth `conflicted`. |
| `sensitive_fields_absent` | All accepted facts and emitted values pass the safe-value policy. |

A release unit with no artifact, deployment, or runtime evidence reports the
corresponding claims as `unknown`. V1 does not manufacture placeholder nodes to
make the graph look complete.

The existing repository is not assumed to pass every invariant. A correct
non-zero check result can be the expected current outcome when evidence is
missing or dated.

## CLI Contract

### Snapshot

```text
gccgw project model --json [--as-of <ISO-8601 UTC>]
```

The command prints one safe `ModelSnapshot`. It returns:

- `0` when model construction succeeds, regardless of invariant outcome;
- `2` when inputs, Schema, graph, or safety validation prevents construction.

Invariant results are data for this command, not its process-success rule.

### Check

```text
gccgw project model check [--json] [--as-of <ISO-8601 UTC>]
```

The command evaluates all registered release units and returns:

- `0`: every selected invariant is `proven` and `fresh`;
- `1`: the model is valid, but at least one invariant is unknown, stale,
  undated, contradicted, or conflicted;
- `2`: model construction or safety validation failed.

Human output is a fixed safe summary. JSON output uses the same versioned check
contract as the snapshot. Neither command writes repository or runtime state.

The command is registered as Risk C, read-only. Adding it to a required CI
context is not part of v1. The B-tier source PR validates that CI can consume
the stable exit codes without changing repository settings.

## Failure And Diagnostic Contract

Failures expose stable reason codes only. Initial reason-code families are:

- `input_missing_optional`;
- `input_missing_required`;
- `input_invalid_json`;
- `input_schema_invalid`;
- `unsafe_field_rejected`;
- `unsafe_value_rejected`;
- `node_duplicate`;
- `edge_dangling`;
- `edge_relation_invalid`;
- `edge_cross_release_unit`;
- `lineage_cycle`;
- `evaluation_time_invalid`;
- `claim_unknown`;
- `claim_stale`;
- `claim_undated`;
- `claim_contradicted`;
- `claim_conflicted`.

Diagnostics may name a safe contract field, node ID, release unit, invariant,
or repository-relative registered source. They never echo raw values,
absolute paths, environment content, URLs, hosts, ports, credentials, runtime
config, customer data, subscription material, parser exception messages, or
stack traces.

## Security And Privacy

The implementation reuses the repository's existing sensitive-pattern policy
where possible instead of creating a weaker scanner. It also applies a strict
allowlist to output keys and values.

Security invariants:

- repository root stays explicit and resolved;
- input paths come from a fixed allowlist, not user globbing;
- path traversal, symlink escape, absolute external references, and URL input
  are rejected;
- no network API is imported or invoked;
- no environment value is read into the model;
- no SQLite file is opened;
- errors are normalized before crossing the adapter boundary;
- canonical output contains no source text or raw evidence payload;
- a sensitive-field finding invalidates construction rather than being
  silently removed.

Synthetic tests may contain clearly designated safe placeholders. Test output
must not contain secret-like fixture values even when validation fails.

## Testing Strategy

Implementation follows strict red-green-refactor TDD with Node's built-in test
runner and no new dependency.

### Truth and freshness tests

- cover the complete four-by-four truth join matrix;
- prove join commutativity, associativity, idempotence, and monotonicity;
- prove conjunction support and refutation rules;
- cover fresh, stale, and undated inputs at exact time boundaries;
- prove a stale supporting fact remains historically supportive but cannot
  pass an invariant.

### Graph tests

- accept one valid complete lineage;
- reject duplicate node IDs;
- reject dangling edges;
- reject every illegal from/to relation pairing;
- reject cross-release-unit lineage;
- reject direct and indirect lineage cycles;
- prove evidence relations cannot create lineage shortcuts.

### Evaluator tests

- complete fresh evidence passes all v1 invariants;
- a missing artifact produces `unknown` rather than `contradicted`;
- explicit negative evidence produces `contradicted`;
- simultaneous support and refutation produce `conflicted`;
- a stale runtime observation cannot pass runtime reconciliation;
- one release unit cannot borrow another unit's evidence;
- all derived claims name their rule and input claims;
- different discovery and insertion orders produce the same snapshot bytes.

### Adapter and safety tests

- accepted repository fixtures produce normalized safe facts;
- an optional missing evidence file produces a safe unknown diagnostic;
- a required missing file, invalid JSON, and Schema drift return construction
  failure;
- traversal, absolute paths, symlink escape, URL-shaped paths, sensitive keys,
  and secret-shaped values fail closed;
- failure output never echoes protected fixture values;
- the adapter does not access network, environment, SQLite, or production
  surfaces.

### CLI tests

- commands are present in the `gccgw` registry with Risk C/read-only metadata;
- `--as-of` accepts one canonical UTC value and rejects invalid or ambiguous
  times;
- snapshot and check JSON conform to the v1 Schema;
- snapshot returns `0` for a valid model with failing invariants;
- check returns `0`, `1`, and `2` for their exact contracts;
- human summaries remain safe and stable;
- existing `project check`, Gate governance, and Execution Contract behavior
  remains unchanged.

## Validation

The implementation PR must run fresh validation:

```powershell
node --test <focused-project-model-tests>
node bin/gccgw.mjs project model --as-of <fixed-utc> --json
node bin/gccgw.mjs project model check --as-of <fixed-utc>
npm run project-state:check
npm test
git diff --check origin/master...HEAD
```

The current repository may legitimately make `project model check` exit `1`.
Validation must record the observed exit code and safe reason summary rather
than misreporting every non-zero invariant result as an implementation defect.
Focused synthetic fixtures must separately prove the `0`, `1`, and `2` paths.

Because v1 does not modify Admin or Portal source, Admin tests and builds are
not required unless implementation scope changes. Any scope expansion must be
reviewed before code is changed.

## Acceptance Criteria

V1 is complete only when all of these are proven:

1. A pure typed graph represents the five release-lineage node kinds and their
   legal relations.
2. Four-valued evidence joins and independent freshness semantics match this
   design.
3. Every derived claim is traceable to stable rules, input claims, and evidence
   references.
4. Every registered release unit is evaluated independently.
5. Snapshot bytes are deterministic for equal inputs, rules, and evaluation
   time.
6. Missing evidence stays unknown; contradictory evidence is not silently
   overwritten; stale evidence cannot pass a current invariant.
7. Snapshot and check commands follow the exact output and exit-code contract.
8. Unsafe paths, fields, values, and diagnostics fail closed without echoing
   protected content.
9. No network, provider, database, runtime, production, approval, schema, auth,
   payment, subscription, or customer-data access is introduced.
10. No derived snapshot is committed as a second current-state authority.
11. Focused tests, project-state validation, the full server suite, and diff
    validation have fresh recorded results.

## Future Extensions

Future work may add independent read-only adapters for GitHub, artifact stores,
deployment providers, or approved runtime evidence. Each adapter must preserve
the same typed graph, truth lattice, freshness dimension, safe diagnostics, and
authority envelope.

An advisory CI check may later select a bounded invariant subset. A
production-enforcing Gate is not an incremental flag change: it is a separate
Risk A system with exact authority, target binding, approval consumption,
rollback, and runtime readback requirements.

Business-domain models for accounts, orders, payments, subscriptions, and
usage remain a separate task line. They may reuse the generic evidence
semantics after their own domain designs are approved, but they cannot be
implicitly folded into Project Evidence Model v1.
