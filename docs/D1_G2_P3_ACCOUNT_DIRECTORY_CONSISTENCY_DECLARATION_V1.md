# D1 G2-P3 Account Directory Consistency Declaration v1

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: d1_g2_p3_account_directory_consistency_declaration
  superseded_by: null
  last_verified_at: 2026-11-15
  production_authority: false
```

Status: **DECLARATION ONLY — the directory was NOT executed under
concurrent writes in this batch.** This document states what
consistency the account-directory read path actually provides, what
it does NOT provide, and what a future read path depending on
stronger semantics must verify separately. It is a declaration
grounded in the production source and DDL at master `b4bac535`, not
probe evidence. It does not declare a T2 PASS and does not authorize
production migration, deployment, or production switching.
Production remains pr799.

## 0. Summary in one paragraph

The directory read path uses the **same keyset mechanism** as the
ledger path probed in this batch (cursor predicate + total order +
limit+1 paging), and its **static** behavior was proven by stage 7
(13 data-layer checks, dual-engine consistent). The keyset
exactly-once argument therefore **transfers by mechanism identity**
— but it was **not executed** for the directory under concurrent
writes in this batch, so it is declared here as a reasoned
transfer, not as executed evidence. The transfer has one material
difference from the ledger: the ledger's sort keys are protected by
unconditional RAISE-only immutability guards in production; the
directory's sort keys are protected only by the absence of any
application code path that updates them — **no DDL guard forbids
changing them**. Any future read path that depends on the directory
being exactly-once under concurrent writes must close that gap
explicitly (see §4).

## 1. The read path (baseline `b4bac535`)

- Service layer: `server/services/platform/admin-user-monitor.mjs`
  `readAccounts` (line 375). Query fields are exactly
  `accountId`, `status`, `cursor`, `limit`. `parseLimit` (line 114,
  `MAX_LIMIT = 100`): the limit is a positive integer ≤ 100.
  `decodeCursor` (line 160) validates the base64url cursor
  (≤ 512 chars, exact fields `createdAt` + `id`);
  `requireCanonicalIso` requires a canonical ISO timestamp;
  `requireAccountId` requires the account-id ref pattern. The
  service fetches `limit + 1` rows, `hasMore = rows.length > limit`,
  page = first `limit`, `nextCursor` = last page row's
  `(createdAt, id)` tuple (base64url-encoded) or null. Each returned
  row is re-validated (`status` in `ACCOUNT_STATUSES`,
  `registrationSource` in `self_service_portal` / `other`,
  canonical `createdAt`).
- Store layer:
  `server/services/platform/subscription-control-db.mjs`
  `listUserMonitorAccountDirectory` (line 2024):

  ```sql
  select id, status, created_at,
         <registration_source CASE> as registration_source
    from platform_accounts
   where (? is null or id = ?)
     and (? is null or status = ?)
     and (? is null or created_at < ?
          or (created_at = ? and id < ?))
   order by created_at desc, id desc
   limit ?
  ```

  The registration-source CASE (`USER_MONITOR_REGISTRATION_SOURCE_SQL`,
  line 1997) is a display projection from `metadata_json`; it is not
  a sort key and not a filter. The query text at `b4bac535` is
  identical to the stage-7 frozen copy after inlining that constant
  (see `tools/g2-p3/g2-p3-ddl-diff.json`, accounts
  `identicalNormalizedAfterInlining: true`).

## 2. What the directory read path provides

1. **Keyset pagination over a total order.** Sort key
   `(created_at DESC, id DESC)`; `id` is the primary key, so the
   order is total — no two rows share a sort key. A static traversal
   (no concurrent writes) returns every matching row exactly once:
   proven by stage 7's 13 data-layer checks (dual-engine
   consistent) + the application-layer cursor codec checks
   (13 checks, separately verified from source, NOT engine
   evidence).
2. **Per-page latest-committed-state reads.** Each page is a
   separate query; each sees the latest committed state at the time
   that page is read.
3. **Same insert-behavior shape as the ledger, by mechanism
   identity.** A row inserted with a sort key **newer** than the
   reader's cursor is never returned by the in-flight traversal; a
   row inserted with a key **older** than the cursor can appear on
   later pages as a post-watermark extra; a row inserted with a key
   in between appears iff its key is still behind the cursor when it
   lands. This is the same cursor-crossing rule the ledger probe
   proved (L1–L4, L9). **Transferred by mechanism identity, not
   executed for the directory in this batch.**
4. **Sort-key stability in the application layer.** The only
   `UPDATE platform_accounts` statements in the control store are
   `freezeAccountForDeletion` (sets `status`/`updated_at`) and the
   deletion metadata scrub (sets `metadata_json`/`updated_at`).
   **No application code path updates `created_at` or `id`.**

## 3. What it does NOT provide

1. **No cross-page snapshot.** There is no snapshot isolation or
   repeatable read across pages. Post-watermark rows CAN appear
   mid-traversal (§2.3). A directory export that needs a frozen
   snapshot must not use this paginated path as-is.
2. **No exactly-once under sort-key changes.** If a row's
   `(created_at, id)` changed mid-traversal it could be missed or
   duplicated, exactly as the ledger probe documented (L5/L6). The
   ledger is protected by unconditional RAISE-only guards; the
   directory is **not**: there are **no triggers at all on
   `platform_accounts`** (verified in the built schema at
   `b4bac535`), so nothing at the DDL layer forbids updating
   `created_at`. The only protection is §2.4 (no application path
   does it). A direct SQL writer, a future code path, or a migration
   that updates `created_at` would break the exactly-once property
   silently.
3. **No exactly-once under deletes.** A row deleted before its page
   is read is absent (ledger L7 analogue). Account deletion in
   production goes through the B2-4c deletion service (freeze →
   revoke → physical delete), which is a deliberate, audited flow —
   but the read path itself has no protection against it.
4. **No exactly-once under filter-attribute changes.** `status` is
   a filter, not a sort key, so a status change does not move a row
   in the order — but it changes whether the row matches a filtered
   walk: a row that changes INTO the filtered status after the reader
   passed its key position is missed; a row that changes OUT of the
   filtered status before its page is read is absent. The
   exactly-once claim in §2 is scoped to a fixed filter (or the
   unfiltered walk); filtered walks under concurrent status changes
   are not covered. Note that status changes are normal production
   behavior (freeze/suspend), unlike `created_at` changes.
5. **No guarantee about rows inserted with keys older than the
   cursor.** Such rows can appear mid-traversal (§2.3). A consumer
   that assumes "no new rows after the first page" is wrong for this
   path.

## 4. What a future read path depending on stronger semantics must verify separately

Before any consumer relies on the directory for a snapshot-consistent
export, an exactly-once reconciliation, or any other stronger
semantic, it must verify (each as its own evidence, not by citing
this declaration):

1. **Execute the concurrent-write probe for the directory itself**
   (the ledger probe's L1–L9 shape, applied to
   `listUserMonitorAccountDirectory`): newer/older/interleaved/tie
   inserts, a sort-key update, and a delete — on both engines, with
   a frozen watermark and a simulation. Mechanism transfer is not
   execution.
2. **Close the sort-key mutability gap**: either add a DDL guard
   forbidding `created_at`/`id` updates on `platform_accounts`
   (the ledger's immutability-guard pattern), or prove that every
   writer that can reach the table — application code, migrations,
   and operational SQL — is constrained from updating the sort keys,
   and record that constraint where future writers will see it.
3. **Define the filter semantics under concurrent status changes**
   if the consumer uses a status filter: state whether a row that
   changes status mid-traversal is in or out, and prove it.
4. **If a snapshot is needed, take one**: a single-query export or
   a single-transaction read, with the snapshot semantics of the
   engine it runs on stated explicitly. Do not claim snapshot
   behavior for the paginated path.

## 5. Non-goals

- This declaration does not change any production code, DDL, or
  read path.
- It does not authorize adding a guard to `platform_accounts`, a
  directory probe, or any migration. Those are separate decisions.
- It does not restate the ledger probe's results — see
  `docs/D1_G2_P3_PAGINATION_CONCURRENCY_RECEIPT_V1.md`.
