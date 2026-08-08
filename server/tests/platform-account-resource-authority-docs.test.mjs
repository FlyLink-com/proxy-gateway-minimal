import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LIFECYCLE_PATH = "docs/ACCOUNT_RESOURCE_AUTHORITY_LIFECYCLE.md";
const rawLifecycle = readFileSync(resolve(REPOSITORY_ROOT, LIFECYCLE_PATH), "utf8");
const lifecycle = rawLifecycle.replace(/\s+/g, " ");
const readme = readFileSync(resolve(REPOSITORY_ROOT, "docs/README.md"), "utf8");

const SOURCE_ONLY_ACTIONS = [
  "production inventory",
  "backup",
  "database access",
  "schema apply",
  "schema rollback",
  "Authority mutation",
  "deployment",
  "flag activation",
  "Quote canary",
  "fulfillment",
  "artifact build",
  "publication",
  "release",
  "release-state claim"
];

const RECOVERY_CLASSIFICATIONS = [
  "applied_exact",
  "not_applied",
  "drift",
  "unknown"
];

const LIFECYCLE_README_PATH = "docs/ACCOUNT_RESOURCE_AUTHORITY_LIFECYCLE.md";

function extractMarkdownSection(source, heading) {
  const lines = source.split(/\r?\n/);
  const headingIndexes = lines
    .map((line, index) => line === heading ? index : -1)
    .filter((index) => index >= 0);

  assert.equal(headingIndexes.length, 1, `${heading} must appear exactly once`);
  const headingLevel = heading.match(/^#+/)[0].length;
  const startIndex = headingIndexes[0] + 1;
  const relativeEndIndex = lines.slice(startIndex).findIndex((line) => {
    const nextHeading = line.match(/^(#+)\s/);
    return nextHeading && nextHeading[1].length <= headingLevel;
  });
  const endIndex = relativeEndIndex < 0
    ? lines.length
    : startIndex + relativeEndIndex;

  return lines.slice(startIndex, endIndex);
}

function parseCoordinatedList(value) {
  return value
    .split(/\s*,\s*(?:or\s+)?|\s+or\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertSourceOnlyBoundary(source) {
  const sourceOnlySection = extractMarkdownSection(source, "## This Source-only PR")
    .join(" ")
    .replace(/\s+/g, " ");

  assert.match(sourceOnlySection, /contains source, tests, docs, and future artifact coverage only/i);
  const negatedActionClause = sourceOnlySection.match(
    /\b(?:performs no|does not perform)\s+([^.]+)\./i
  );
  assert.ok(negatedActionClause, "source-only actions must remain negated");
  assert.deepEqual(
    parseCoordinatedList(negatedActionClause[1]),
    SOURCE_ONLY_ACTIONS,
    "source-only actions must remain negated"
  );
}

function assertRecoveryTable(source) {
  const normalizedSource = source.replace(/\s+/g, " ");
  const recoverySection = extractMarkdownSection(source, "### Unknown-result recovery");
  const headerIndexes = recoverySection
    .map((line, index) => /^\|\s*Classification\s*\|\s*Required action\s*\|$/.test(line) ? index : -1)
    .filter((index) => index >= 0);

  assert.equal(headerIndexes.length, 1, "recovery table header must appear exactly once");
  const headerIndex = headerIndexes[0];
  assert.match(
    recoverySection[headerIndex + 1] ?? "",
    /^\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|$/,
    "recovery table must have exactly two columns"
  );
  const tableRows = [];
  for (const line of recoverySection.slice(headerIndex + 2)) {
    if (!/^\|/.test(line)) break;
    tableRows.push(line);
  }

  assert.equal(tableRows.length, 4, "recovery table must contain exactly four recovery rows");
  const parsedRows = tableRows.map((line) => {
    const row = line.match(/^\|\s*`([^`]+)`\s*\|\s*(.*?)\s*\|$/);
    assert.ok(row, `recovery table row must have two cells: ${line}`);
    return { classification: row[1], action: row[2] };
  });
  const classifications = parsedRows.map(({ classification }) => classification);
  assert.equal(
    new Set(classifications).size,
    classifications.length,
    "recovery table must not contain duplicate classifications"
  );
  assert.deepEqual(
    [...classifications].sort(),
    [...RECOVERY_CLASSIFICATIONS].sort(),
    "recovery table classification set must be exact"
  );
  const recoveryRows = Object.fromEntries(
    parsedRows.map(({ classification, action }) => [classification, action])
  );

  assert.deepEqual(Object.keys(recoveryRows), [
    "applied_exact",
    "not_applied",
    "drift",
    "unknown"
  ]);
  assert.match(recoveryRows.applied_exact, /transaction is exactly committed/i);
  assert.match(recoveryRows.applied_exact, /mutation replay is forbidden/i);
  assert.match(recoveryRows.applied_exact, /local `recovered_after_unknown` receipt/i);
  assert.match(recoveryRows.not_applied, /exact prestate is unchanged/i);
  assert.match(recoveryRows.not_applied, /independently pre-authorized Gate[^|]*one conditional mutation/i);
  assert.match(recoveryRows.not_applied, /rechecks CAS inside its transaction/i);
  assert.match(recoveryRows.drift, /extra version[^|]*different ref[^|]*partial state/i);
  assert.match(recoveryRows.unknown, /never reinterpret as `not_applied`/i);
  assert.match(normalizedSource, /No command automatically promotes plan to apply or retries/i);
  assert.match(normalizedSource, /safe JSON is a local receipt/i);
  assert.match(normalizedSource, /adds no receipt table and no other schema/i);
}

function assertReadmeLifecycleEntry(source) {
  const escapedPath = LIFECYCLE_README_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pathReferences = source.match(new RegExp(escapedPath, "g")) ?? [];

  assert.equal(pathReferences.length, 1, "README must contain exactly one lifecycle path reference");
  const lifecycleRows = source
    .split("\n")
    .filter((line) => line.startsWith("|") && line.includes(LIFECYCLE_README_PATH));
  assert.equal(lifecycleRows.length, 1, "README must contain exactly one lifecycle table row");
  const lifecycleRow = lifecycleRows[0];
  const cells = lifecycleRow.split("|").slice(1, -1).map((cell) => cell.trim());

  assert.equal(cells.length, 4, "README lifecycle entry must remain in the four-column core table");
  assert.equal(cells[0], `\`${LIFECYCLE_README_PATH}\``);
  assert.match(lifecycleRow, /Active Risk A source\/runbook contract/i);
  for (const boundary of [
    "no production DB access",
    "schema/data mutation",
    "deployment",
    "flag activation",
    "receipt table",
    "artifact publication",
    "release claim"
  ]) {
    assert.ok(lifecycleRow.includes(boundary), `README lifecycle row must state ${boundary}`);
  }
}

test("documents the separate aggregate-safe schema and assignment commands", () => {
  assert.match(
    lifecycle,
    /npm run platform:account-resource-authority-commerce:schema -- \.\.\./
  );
  assert.match(
    lifecycle,
    /npm run platform:account-resource-authority:assignment -- \.\.\./
  );
  assert.match(lifecycle, /schema command supports only `validate`, `dry-run`, `apply`, and `rollback`/i);
  const assignmentModeContracts = lifecycle.match(
    /assignment command supports only `plan`, `assign`, and `reassign`/gi
  ) ?? [];
  assert.equal(assignmentModeContracts.length, 1);
  assert.match(lifecycle, /exact canonical request digest/i);
  assert.match(lifecycle, /private JSON fixes `newAuthorityRef`/i);
  assert.match(lifecycle, /`expectedPreviousAuthorityRef`, `expectedVersion`, and the target Resource triad/i);
  assert.match(lifecycle, /aggregate-safe/i);
  assert.match(lifecycle, /never includes paths, account\/ref\/triad\/metadata, or private JSON/i);

  assert.doesNotMatch(
    rawLifecycle,
    /operator CLI, dry-run, or rollback API[\s\S]{0,100}Quote-binding/i
  );
  assert.doesNotMatch(rawLifecycle, /operator assignment\/reassignment CLI/i);
  assert.doesNotMatch(rawLifecycle, /exposes inspect,\s*validate,\s*and apply APIs only/i);
  assert.doesNotMatch(rawLifecycle, /sidecar[^\n]{0,100}has no operator rollback API/i);
});

test("locks the first committed Quote binding as durable and immutable", () => {
  assert.match(lifecycle, /first successfully committed Authority-enabled Quote/i);
  assert.match(lifecycle, /same `BEGIN IMMEDIATE`/);
  assert.match(lifecycle, /from then on `bindingRows > 0`/i);
  assert.match(
    lifecycle,
    /Quote expiry\/staleness, Order terminalization, command completion, and flag disablement never update or delete it/i
  );
  assert.match(lifecycle, /must not delete rows to manufacture `rollbackSafe = true`/i);
});

test("locks sidecar rollback and disposable dry-run snapshot boundaries", () => {
  assert.match(
    lifecycle,
    /sidecar rollback is allowed only for exact owned schema with `bindingRows = 0` and `externalDependencies = 0`/i
  );
  assert.match(
    lifecycle,
    /Unknown counts, dependency enumeration failure, checksum\/schema drift, lock, or transaction failure[^.]*zero write/i
  );
  assert.match(lifecycle, /Both schema dry-runs use SQLite online backup/i);
  assert.match(lifecycle, /read-only source/i);
  assert.match(lifecycle, /owned disposable temporary snapshot/i);
  assert.match(lifecycle, /proves migration mechanics only/i);
  assert.match(lifecycle, /not a retained production backup/i);
  assert.match(lifecycle, /proves no RPO\/restore capability/i);
});

test("locks rollback order and the post-binding forward-fix boundary", () => {
  assert.match(lifecycle, /Commerce sidecar first/i);
  assert.match(lifecycle, /separately approved foundational Authority rollback/i);
  assert.match(lifecycle, /Reverse order is forbidden/i);
  assert.match(lifecycle, /flag-off[^.]*current Authority-aware binary[^.]*containment/i);
  assert.match(lifecycle, /Keep both schemas and use an additive forward fix/i);
  assert.match(lifecycle, /independent Risk A RPO Backup\/Recovery Gate/i);
  for (const requiredField of [
    "exact backup identity",
    "recovery point",
    "acceptable data loss",
    "writer quiescence",
    "restore validation"
  ]) {
    assert.ok(lifecycle.includes(requiredField), `RPO Gate must name ${requiredField}`);
  }
  assert.match(lifecycle, /Dry-run snapshot never qualifies/i);
  assert.match(lifecycle, /no old process remains/i);
  assert.match(lifecycle, /returning to a pre-Authority release requires a separate drain/i);
});

test("locks exact-lineage planning and atomic reassignment", () => {
  assert.match(lifecycle, /private JSON request and digest are fixed before execution/i);
  for (const lineageField of [
    "authority ref",
    "version",
    "previous ref",
    "Resource triad",
    "createdBy/reason",
    "prior revocation state"
  ]) {
    assert.ok(lifecycle.includes(lineageField), `plan must compare ${lineageField}`);
  }
  assert.match(lifecycle, /Reassign revoke\+insert stays in one top-level `BEGIN IMMEDIATE` and is atomic/i);
  assert.match(lifecycle, /exactly one read-only `plan` with the same private request\/digest/i);
});

test("defines all four unknown-result recovery classifications without mutation replay", () => {
  assertRecoveryTable(rawLifecycle);
});

test("rejects extra or duplicate unknown-result recovery rows", () => {
  const fifthRow = rawLifecycle.replace(
    "| `unknown` |",
    "| `retry` | Retry mutation. |\n| `unknown` |"
  );
  const duplicateRow = rawLifecycle.replace(
    "| `unknown` |",
    "| `drift` | Duplicate drift mutation. |\n| `unknown` |"
  );

  assert.throws(() => assertRecoveryTable(fifthRow), /exactly four recovery rows/);
  assert.throws(() => assertRecoveryTable(duplicateRow), /exactly four recovery rows/);
});

test("states the source-only non-execution boundary", () => {
  assertSourceOnlyBoundary(rawLifecycle);
});

test("rejects a source-only action whose negation is removed", () => {
  const positiveInventory = rawLifecycle.replace(
    "performs no production inventory",
    "performs production inventory"
  );

  assert.throws(
    () => assertSourceOnlyBoundary(positiveInventory),
    /source-only actions must remain negated/
  );
});

test("keeps non-operator capabilities explicitly excluded", () => {
  for (const excludedCapability of [
    "automatic backfill or automatic keeper selection",
    "any assignment for `case_02`",
    "first-purchase bootstrap",
    "payment-provider or recharge changes",
    "retirement, archival, deletion, or status changes for unresolved resources",
    "cross-package product transitions"
  ]) {
    assert.ok(
      lifecycle.includes(excludedCapability),
      `source-only contract must keep excluding ${excludedCapability}`
    );
  }
});

test("README contains exactly one active Risk A lifecycle contract link", () => {
  assertReadmeLifecycleEntry(readme);
});

test("rejects a duplicate lifecycle target in any README link syntax", () => {
  const duplicateMarkdownLink = `${readme}\n[Duplicate](docs/ACCOUNT_RESOURCE_AUTHORITY_LIFECYCLE.md)\n`;

  assert.throws(
    () => assertReadmeLifecycleEntry(duplicateMarkdownLink),
    /exactly one lifecycle path reference/
  );
});
