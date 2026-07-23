# Active Frontend Map

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: frontend_source_identity
  superseded_by: null
  last_verified_at: 2026-07-22
  production_authority: false
```

> Status:
> - Risk: C
> - Production impact: None
> - Source head inspected: `be6ea94d3dde9e0fddb6bb739373c9a8263705c2`
> - Source state: `DRAFT_PR_526`
> - Source evidence cutoff: 2026-07-22, America/Los_Angeles
> - Portal production binding: `UNKNOWN`
> - Portal integration permission: `BLOCKED`
> - Admin production binding: `UNKNOWN`
> - Admin integration permission: `BLOCKED`

## Purpose

This map prevents a buildable, testable, archived, or preview frontend from
being mistaken for the source currently serving users.

Frontend integration eligibility has three independent axes:

```text
repository lifecycle
  +
production identity
  +
integration permission
```

`ACTIVE_SOURCE` does not mean `PRODUCTION_CONFIRMED`.

## Classification

### Repository Lifecycle

| Value | Meaning | Modification rule |
| --- | --- | --- |
| `ACTIVE_SOURCE` | Current repository build or routed source. | May be changed only after the production identity and owning journey are confirmed for production integration work. |
| `LEGACY_COMPAT` | Compatibility source still imported by an active build. | Not a feature-integration target. Change only through a dedicated cleanup/migration task. |
| `ARCHIVE` | Historical evidence or source retained for archaeology. | Read-only. |
| `EXPERIMENT` | Fixture, preview, prototype, worktree, or design mirror. | Test/design use only; never production identity evidence. |

### Production Identity

| Value | Meaning |
| --- | --- |
| `CONFIRMED` | URL, deployment, artifact, commit, build entry, and source path are fully bound. |
| `CANDIDATE` | The source builds the expected release unit but is not bound to current production bytes. |
| `UNKNOWN` | Current production source identity cannot be proven. |
| `NOT_APPLICABLE` | The source is not intended to serve production. |

### Integration Permission

| Value | Meaning |
| --- | --- |
| `ALLOWED` | Source and production identity are verified for the affected journey. |
| `READ_ONLY` | Evidence/reference use only. |
| `DO_NOT_TOUCH` | Legacy or archive source is excluded from integration. |
| `BLOCKED` | Required production identity or journey evidence is missing. |

Only this combination is a valid commercial integration target:

```text
repository_lifecycle: ACTIVE_SOURCE
production_identity: CONFIRMED
integration_permission: ALLOWED
```

No Portal or Admin source path currently meets both conditions.

## Portal Map

| Surface or path | Repository lifecycle | Production identity | Rule |
| --- | --- | --- | --- |
| `https://portal.gccwebos.com/` | Not source | `UNKNOWN` | Observed production URL; source chain and integration permission remain blocked. |
| `admin/portal/index.html` | `ACTIVE_SOURCE` | `CANDIDATE` | Portal HTML build entry only. |
| `admin/vite.portal.config.ts` | `ACTIVE_SOURCE` | `CANDIDATE` | Builds `admin/dist-portal`; buildability is not deployment proof. |
| `admin/src/portal-main.tsx` | `ACTIVE_SOURCE` | `CANDIDATE` | Current repository Portal application entry. |
| `admin/src/features/user-portal/` | `ACTIVE_SOURCE` | `CANDIDATE` | Current repository Portal feature source; not production-proven. |
| `admin/src/portal-static-preserve.css` | `LEGACY_COMPAT` | `CANDIDATE` | Production-preserve compatibility aggregator; not a new feature host. |
| `admin/src/styles/portal-static-preserve/` | `LEGACY_COMPAT` | `CANDIDATE` | Preserved CSS baseline. Modify only through an explicit visual/source reconciliation task. |
| `#/portal-preview` and local synthetic clients | `EXPERIMENT` | `NOT_APPLICABLE` | Local behavior testing only. |
| Portal test fixtures | `EXPERIMENT` | `NOT_APPLICABLE` | Cannot establish navigation, layout, deployment, or production data shape. |

## Admin Map

| Surface or path | Repository lifecycle | Production identity | Rule |
| --- | --- | --- | --- |
| `https://admin.gccwebos.com/` | Not source | `UNKNOWN` | Observed production URL; source chain and integration permission remain blocked. |
| `admin/index.html` | `ACTIVE_SOURCE` | `CANDIDATE` | Default Admin HTML build entry only. |
| `admin/vite.config.ts` | `ACTIVE_SOURCE` | `CANDIDATE` | Builds `admin/dist`; buildability is not deployment proof. |
| `admin/src/main.tsx` | `ACTIVE_SOURCE` | `CANDIDATE` | Current repository Admin application entry. |
| `admin/src/App.tsx` | `ACTIVE_SOURCE` | `CANDIDATE` | Current repository route composition. |
| `admin/src/components/layout/` | `ACTIVE_SOURCE` | `CANDIDATE` | Current repository shell implementation; not production-proven. |
| `admin/src/app/navigation.ts` | `ACTIVE_SOURCE` | `CANDIDATE` | Current repository navigation model; does not match production by assumption. |
| `admin/src/pages/` | `ACTIVE_SOURCE` | `CANDIDATE` | Page implementations require an owning production journey before integration. |
| `admin/src/styles.css` | `ACTIVE_SOURCE` | `CANDIDATE` | Active style aggregator that still imports compatibility CSS. |
| `admin/src/styles/legacy-entrypoints.css` | `LEGACY_COMPAT` | `CANDIDATE` | Do not use as a new feature integration surface. |
| `admin/src/app/admin-fixture-preview.ts` | `EXPERIMENT` | `NOT_APPLICABLE` | Synthetic preview only. |
| `admin/src/design/figma-mirror.ts` | `EXPERIMENT` | `NOT_APPLICABLE` | Design/test contract, not deployment identity. |

`RELEASE_MANIFEST.md` also records that the default Admin build still includes
shared Portal and company-site routes. Physical source isolation is not
complete.

## Archive And Historical Material

| Path or material | Classification | Rule |
| --- | --- | --- |
| `docs/archive/` | `ARCHIVE` | Read-only historical evidence. |
| Former C-drive project checkouts named in `docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md` | `ARCHIVE` | Archaeology only; compare exact files before reuse. |
| `.worktrees/*` | `EXPERIMENT` | Temporary execution surfaces; never assume they are current or production. |
| Exported static packages without a manifest and production binding | `ARCHIVE` | Artifact archaeology only. |
| Old Admin prototypes removed from active routing | `ARCHIVE` | Do not restore as a feature host. |

## Commercial Integration Prohibitions

Until a surface is `ACTIVE_SOURCE + CONFIRMED`, do not:

- create a new Portal shell;
- create a new Admin dashboard;
- add a second navigation system;
- attach a commercial flow to archive or legacy compatibility source;
- use a demo workspace, preview route, Figma mirror, or fixture as the
  production entry;
- infer the production structure from unit tests or source strings;
- place a new workspace beside an old workspace without an explicit migration
  and single-workspace acceptance test;
- call a successful build or CI run production integration evidence.

## Discovery And Update Rule

Before changing this map:

```powershell
rg -n -i "archive|legacy|deprecated" admin/src admin/portal docs
```

Then record:

1. exact source path and owning build entry;
2. route and navigation owner;
3. artifact manifest and source commit;
4. deployment/current pointer;
5. live byte comparison;
6. migration or coexistence rule;
7. independent reviewer decision.

If any production link is missing, retain `CANDIDATE` or `UNKNOWN`.

## Related Documents

- `docs/PRODUCTION_SURFACE_REPORT.md`
- `docs/COMMERCIAL_FEATURE_INTEGRATION_GATE.md`
- `docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md`
- `docs/ADMIN_UI_LEGACY_ARCHIVE.md`
- `docs/ADMIN_CONSOLE_REBUILD_BASELINE.md`
- `RELEASE_MANIFEST.md`
