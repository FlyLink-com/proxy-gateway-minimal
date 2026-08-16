# Document Authority Conventions

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: documentation_conventions
  superseded_by: null
  last_verified_at: 2026-08-16
  production_authority: false
```

This document is the source of truth for the `document_metadata` block that
governs in-scope markdown files under `docs/` and `ops/`. The
`scripts/check-document-authority.mjs` script enforces these rules and runs as
part of the repository's governance pipeline.

## Metadata block (required for in-scope files)

Every in-scope file MUST begin with a top-level YAML fence that contains a
`document_metadata:` block. The exact template is:

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
  transitions to `deprecated`.
- A document is in-scope if and only if it lives under `docs/` or `ops/`.
  `archive/` and `superpowers/` are explicitly out of scope, and the scanner
  also skips `.git`, `.worktrees`, and `node_modules` regardless of location.
- `last_verified_at` must be a valid `YYYY-MM-DD` calendar date.

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
  repository-relative path that resolves to an existing file. The validator
  refuses to accept `superseded_by: null` for a `deprecated` document.

## Production authority

- The default for everything in `docs/` and `ops/` is `false`.
- `production_authority: "true"` is reserved for documents that explicitly
  authorize a production mutation (release promotion, schema change,
  firewall change, credential rotation, etc.).
- Any document with `production_authority: "true"` MUST be paired with a
  Risk A gate elsewhere in the repo (see `npm run governance:check`).
  Documents that merely describe a risk do not qualify.

## Verification

Three commands form the day-to-day verification surface:

- `npm run docs:authority:check` — the default invocation. Reports parse
  errors and metadata violations, but tolerates files without a metadata
  block (e.g. legacy files mid-migration).
- `node scripts/check-document-authority.mjs --strict-files` — the
  post-2026-08-16 fail-on-missing mode. Use this in CI to forbid any
  in-scope file from omitting the metadata block.
- `npm run governance:check` — runs `gates.json` validation and the
  repair-policy checks. Combine with `docs:authority:check` for a full
  pre-merge sweep.

## Maintenance rules

- Update `last_verified_at` only when the document's content has been
  re-verified against the live repo. A date bump without a real re-check
  is a governance defect.
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
