# Document Authority Conventions

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: documentation_conventions
  superseded_by: null
  last_verified_at: 2026-08-17
  production_authority: false
```

This document is the source of truth for the `document_metadata` block that
governs in-scope markdown files under `docs/` and `ops/`. The
`scripts/check-document-authority.mjs` script enforces these rules and runs as
part of the repository's governance pipeline.

## Metadata block (required for in-scope files)

Every in-scope file MUST contain a top-level YAML fence that holds a
`document_metadata:` block. The fence and its marker line MUST live in the
first 40 non-empty lines of the file. The exact template is:

```yaml
document_metadata:
  doc_type: <canonical|operational|evidence>
  lifecycle: <active|deprecated|historical>
  authority_scope: <snake_case_unique_for_active_canonical>
  superseded_by: <repo-rel-path|"null">
  last_verified_at: YYYY-MM-DD
  production_authority: "true"|"false"
```

- The `document_metadata:` marker line and its surrounding `\`\`\`yaml` fence
  MUST live in the first 40 non-empty lines of the file.
- All six fields are required. The validator treats an empty value as missing.
- `superseded_by` MUST be the literal string `null` while the document is
  current. It becomes a repository-relative path only when the lifecycle
  transitions to `deprecated`. A non-`null` `superseded_by` MUST resolve to
  an in-scope governed Markdown record whose own `lifecycle` is `active`.
  The successor must not be the source file itself, must not be a directory,
  and must not live under `archive/`, `superpowers/`, `.git`, `.worktrees`,
  or `node_modules/`. Dot-segment escapes (e.g. `docs/../archive/foo.md`)
  are rejected because the lookup is performed against the canonical
  inventory, not the raw filesystem.
- A document is in-scope if and only if it lives under `docs/` or `ops/`.
  `archive/` and `superpowers/` are explicitly out of scope, and the scanner
  also skips `.git`, `.worktrees`, and `node_modules` regardless of location.
- `last_verified_at` must be a valid `YYYY-MM-DD` calendar date.
- `production_authority: "true"` is reserved for documents that have an
  active production gate coupling. Until that coupling is introduced the
  validator MUST fail-closed on `production_authority: "true"` so that a
  manual metadata edit cannot accidentally promote a document to production
  authority on its own. All current documents use `"false"`.

## Authority scope naming

`authority_scope` is the stable, machine-readable identity of an active
canonical document. It must match the pattern `^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$`
and MUST be unique across all `active` canonical documents.

The corpus uses two observed styles, plus reserved prefixes/suffixes:

- **Short navigation scopes** (≤ 2 segments) — used by top-of-folder
  stable docs that act as source-of-truth or coordination indices. Examples:
  `release_state`, `milestones`, `blockers`, `decisions`, `migration_notes`,
  `current_state`, `dependency_map`, `architecture_map`, `source_map`,
  `project_context`, `project_topology`, `execution_contract`,
  `validation_baseline`, `runtime_lane_authority`, `archive_policy`,
  `project_state_model`.
- **Long topical scopes** (≥ 3 segments) — used by operational, gate,
  runbook, and evidence docs that describe a specific procedure. Examples:
  `source_only_lead_schema_gate`, `source_only_coins_wallet_schema_gate`,
  `portal_static_production_release`, `aliyun_provider_firewall_hardening_runbook`,
  `control_plane_database_snapshot_restore`,
  `future_account_wallet_first_model`.
- **Reserved prefix** `source_only_` — marks Risk A source-only contracts
  whose `production_authority` MUST be `false`. These documents do not
  authorize runtime mutations.
- **Reserved suffix** `_gate` — flags schema/contract gate documents that
  gate a deployment or migration.

### Resolving the `release_state` vs `current_release_state` inconsistency

The corpus has historically carried both `release_state` and
`current_release_state` for what is conceptually one artifact. To remove
the ambiguity:

- `current_release_state` is the canonical scope going forward. It is
  more self-describing and aligns with the "current_state" sibling.
- `release_state` is treated as a **historical** alias. The active canonical
  document using `release_state` MUST be deprecated with
  `superseded_by: docs/<path-to-current_release_state>.md` (or moved to
  `lifecycle: historical` if it is retained purely for context).
- New documents MUST use `current_release_state` and MUST NOT introduce
  another `release_state` variant.

## Lifecycle policy

- `active` — current source-of-truth. Required for any `canonical` document
  the team relies on. `superseded_by` MUST be the literal `null`.
- `historical` — dated record retained for context only (typical for
  evidence docs whose value is the artifact at a point in time).
  `superseded_by` stays `null`.
- `deprecated` — replaced by a successor. `superseded_by` MUST be a
  repository-relative path that resolves to an in-scope governed Markdown
  record whose own `lifecycle` is `active`. The validator refuses to accept
  `superseded_by: null` for a `deprecated` document.

## Production authority

- The default for everything in `docs/` and `ops/` is `false`.
- `production_authority: "true"` is reserved for documents that explicitly
  authorize a production mutation (release promotion, schema change,
  firewall change, credential rotation, etc.).
- Any document with `production_authority: "true"` MUST be paired with a
  Risk A gate elsewhere in the repo (see `npm run governance:check`).
  Documents that merely describe a risk do not qualify.
- Until the gate-coupling lookup is implemented, the validator refuses to
  load any document with `production_authority: "true"`. This is a
  deliberate fail-closed stance: a manual metadata edit MUST NOT be
  sufficient on its own to grant production authority. The corpus today is
  entirely `production_authority: "false"`.

## `last_verified_at` semantics

`last_verified_at` is the date the metadata block was last edited against the
file as it stands in the repository. It is a **best-effort stewardship
signal**, not a content attestation:

- For files that already carry an explicit `Last updated:` line in their
  body text, `last_verified_at` is taken from that line. The body line
  itself is treated as the source of truth for that date.
- For files without an explicit body date, the field records the date the
  metadata block was added or last refreshed against the file in its
  repository state. In the bulk governance sweep this was derived from
  the file's last-modified date (or the filename date prefix for
  `production-replacement-records/`), which is good enough to order docs
  chronologically but **does not** prove the content has been re-read for
  correctness.
- A `last_verified_at` value MUST NOT be bumped without an actual content
  check. Reviewers should treat the field as a hint, not a guarantee.
- When the team needs a real content-attestation date, prefix the field
  name with a verifier (`verified_by_alice: 2026-08-16`) rather than
  reusing `last_verified_at`.

## Verification commands

- `npm run docs:authority:check` — the default invocation. Reports parse
  errors and metadata violations, but tolerates files without a metadata
  block (e.g. legacy files mid-migration).
- `npm run docs:authority:strict` — the same check with `--strict-files`
  enabled, equivalent to `node scripts/check-document-authority.mjs
  --strict-files`. Fails closed if any in-scope file is missing a
  metadata block, or if the root directory is missing or empty, or if
  `--root` is followed by another flag. CI runs this command.
- `npm run governance:check` — runs `gates.json` validation and the
  repair-policy checks. Combine with `docs:authority:strict` for a full
  pre-merge sweep.

## Maintenance rules

- `last_verified_at` is a best-effort stewardship signal, not a content
  attestation. See the "`last_verified_at` semantics" section above for
  what the value actually represents. Only bump it when you have
  actually re-read the file.
- When adding a metadata block to a legacy file, do not change the body
  text in the same edit. Inject the YAML block at the top, run the
  validator, and only then make content changes in a separate commit.
- Do not rename an `authority_scope` without a deprecation window:
  introduce the new scope, mark the old document `deprecated` with
  `superseded_by` pointing at the new file, and let downstream references
  migrate before removing the old scope.
- Reserved prefixes and suffixes (`source_only_`, `_gate`) are part of
  the public contract. New reserved namespaces are added by updating this
  document and the validator together, never by one side alone.

## Badge lifecycle

README status badges are evidence-backed repository interfaces. They are
not decorative, and they are not assertions about production health. They
are a single, narrow promise: that a machine-verifiable or explicitly
documented state exists at the linked source, that the badge reflects
that state, and that the badge will be removed or downgraded when the
source is no longer authoritative.

A badge MUST:

1. Represent a machine-verifiable state, an explicitly documented state,
   or a navigation target that does not claim a pass/fail signal.
2. Link to its evidence source: the workflow file, the gate ledger, the
   documentation page, or the licence file the badge summarises.
3. Pin the badge to its evidence source. The contract is split by badge
   kind:
   - **Dynamic workflow badge** (pass/fail, derives from a workflow
     run): the image URL MUST include `branch=<default-branch>` and the
     event that actually drives the source (e.g. `event=push`); the
     click target MUST use the matching
     `?query=branch%3A<default-branch>+event%3A<event>` filter so the
     displayed state and the evidence list agree. Branch-specific
     PR-summary widgets do not belong in `README.md`.
   - **Static navigation or fact badge** (no workflow event; e.g. `Docs`
     linking to a `CONVENTIONS.md` page, or a future `License` badge
     linking to a `LICENSE` file): the badge link target MUST be the
     specific document or path the badge summarises. There is no
     workflow event to pin, so the dynamic-badge contract does not
     apply.
4. Not imply deployment, runtime, or production health unless an
   evidence-backed workflow gates that claim. In particular, badges
   labelled "Production Ready", "Stable", "LTS", "Healthy", "Deploy
   Status", or "99.99%" are forbidden until the matching evidence exists.

A pass/fail badge MUST be dynamically derived from its authoritative
machine evidence and MUST update automatically when that evidence changes.
Static `passing` / `failing` shields are forbidden: a hard-coded green
shield that does not update on CI failure is not a badge, it is a
lie. The underlying workflow or check MUST be executable on a clean
GitHub-hosted runner without user-managed repository or environment
secrets (the auto-provided `GITHUB_TOKEN` and its checkout credentials
are out of scope), without proprietary dependencies, and without
`continue-on-error: true` masking real failures. The CI badge in this
repository points to `.github/workflows/ci.yml` because that workflow
satisfies those rules.

When the evidence model is partial — for example, a project whose
Windows+DLL build cannot be reproduced on GitHub-hosted runners — the
README MUST spell that out in plain prose immediately below the badge
line. A perpetually red badge labelled "Build" is worse than no badge at
all, because it trains reviewers to ignore real failures.

When the workflow is classified as the **docs-only lane** by
`scripts/ci-change-classifier.mjs` (e.g. a Markdown-only push to
`master`), the workflow skips dependency install, server / admin
tests, admin / public-site builds, and site verify / dry-run. The
CI badge in that lane reflects only the diff, document-authority, and
governance evidence steps. The README MUST state this fact in plain
prose immediately below the badge line so readers do not read "green"
as evidence that application tests or builds ran. This is the same
partial-evidence rule as the previous paragraph; the docs-only lane
is a specific instance of partial evidence.

Three categories are recognised in this repository today:

- `CI` — dynamic pass/fail badge, derives from `ci.yml` on
  `master`/`push`. The image URL pins `branch=master&event=push`; the
  click target is `ci.yml?query=branch%3Amaster+event%3Apush` so the
  displayed state and the evidence list agree.
- `Docs` — static navigation badge linking to `docs/CONVENTIONS.md`.
  It does not claim a CI result.
- `License` — static fact badge, intentionally absent today. When an
  authoritative license source lands, the badge reappears at the same
  commit (see the `License badge` subsection below).

Adding a badge requires changing this section: state the evidence source,
state the workflow or document it links to, state whether the badge is
dynamic or static, and state what the badge will NOT claim. Removing a
badge requires updating or removing the matching evidence statement in
this section in the same change. Removing the underlying evidence source
without updating both the README and this section is a governance
defect.

### License badge

Authoritative evidence for a `License | <anything>` badge, in priority
order:

1. **Primary** — a license-declaration file at the repo root with one
   of the conventional names: `LICENSE`, `LICENSE.md`, `LICENCE`,
   `COPYING`. The badge text MUST carry the SPDX identifier, and the
   badge link target MUST be this file. **This is the only kind of
   evidence that makes a `License | <anything>` badge legitimate.**
2. **Corroborating metadata only** — a `package.json` `license` field
   with an SPDX identifier. On its own, this is NOT sufficient to
   satisfy the badge rule. The `license` field is corroborating
   metadata that becomes useful only when the primary file is also
   present; it is not a substitute for the primary file.

The README MUST NOT display any `License | <anything>` badge
(`proprietary`, `MIT`, `Apache-2.0`, `unknown`, `none`) until the
primary evidence (a license-declaration file at the repo root) is
present. Specifically, adding `"license": "MIT"` to `package.json`
without a `LICENSE` file does NOT make a `License | MIT` badge
legitimate: the primary file is the gate, and `package.json#license`
is at most corroborating metadata. There is no "either of two" path;
there is only the primary file.

When the primary source lands (typically a `LICENSE` file at the repo
root), this section is updated at the same commit: replace the License
status note with a one-line statement of the form
`License: <SPDX-ID>, evidence: <path-to-LICENSE-file>`, and add the
corresponding `[![License](...)](<path>)` badge to both README files.
Until then, the License slot in the README badge row remains absent
on purpose.
