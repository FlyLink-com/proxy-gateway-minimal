import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CHECKER = resolve(REPOSITORY_ROOT, "scripts/check-document-authority.mjs");

function writeDoc(rootDir, path, metadata) {
  const fullPath = join(rootDir, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, [
    `# ${path}`,
    "",
    "```yaml",
    "document_metadata:",
    `  doc_type: ${metadata.docType}`,
    `  lifecycle: ${metadata.lifecycle}`,
    `  authority_scope: ${metadata.authorityScope}`,
    `  superseded_by: ${metadata.supersededBy ?? "null"}`,
    `  last_verified_at: ${metadata.lastVerifiedAt}`,
    `  production_authority: ${metadata.productionAuthority}`,
    "```",
    ""
  ].join("\n"));
}

function runAuthorityCheck(rootDir) {
  return spawnSync(process.execPath, [CHECKER, "--root", rootDir], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8"
  });
}

test("document authority check accepts unique active canonical scopes", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-valid-"));
  writeDoc(rootDir, "docs/A.md", {
    docType: "canonical",
    lifecycle: "active",
    authorityScope: "alpha_scope",
    lastVerifiedAt: "2026-07-15",
    productionAuthority: false
  });
  writeDoc(rootDir, "docs/B.md", {
    docType: "canonical",
    lifecycle: "active",
    authorityScope: "beta_scope",
    lastVerifiedAt: "2026-07-15",
    productionAuthority: false
  });
  writeDoc(rootDir, "docs/old.md", {
    docType: "operational",
    lifecycle: "deprecated",
    authorityScope: "old_scope",
    supersededBy: "docs/A.md",
    lastVerifiedAt: "2026-07-14",
    productionAuthority: false
  });

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validated 3 document metadata block/);
});

test("document authority check rejects duplicate active canonical scopes", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-duplicate-"));
  for (const path of ["docs/A.md", "docs/B.md"]) {
    writeDoc(rootDir, path, {
      docType: "canonical",
      lifecycle: "active",
      authorityScope: "duplicate_scope",
      lastVerifiedAt: "2026-07-15",
      productionAuthority: false
    });
  }

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /duplicate active canonical authority_scope duplicate_scope/);
  assert.match(result.stderr, /docs\/A\.md/);
  assert.match(result.stderr, /docs\/B\.md/);
});

test("document authority check rejects invalid metadata fields", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-invalid-"));
  writeDoc(rootDir, "docs/invalid.md", {
    docType: "authority",
    lifecycle: "retired",
    authorityScope: "Invalid Scope",
    lastVerifiedAt: "2026-02-30",
    productionAuthority: "sometimes"
  });

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported doc_type authority/);
  assert.match(result.stderr, /unsupported lifecycle retired/);
  assert.match(result.stderr, /invalid authority_scope Invalid Scope/);
  assert.match(result.stderr, /invalid last_verified_at 2026-02-30/);
  assert.match(result.stderr, /production_authority must be true or false/);
});

test("document authority check requires deprecated docs to name a replacement", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-deprecated-"));
  writeDoc(rootDir, "docs/old.md", {
    docType: "operational",
    lifecycle: "deprecated",
    authorityScope: "old_scope",
    lastVerifiedAt: "2026-07-15",
    productionAuthority: false
  });

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /deprecated lifecycle requires superseded_by/);
});

test("document authority check rejects an empty metadata inventory", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-empty-"));
  mkdirSync(join(rootDir, "docs"));
  writeFileSync(join(rootDir, "docs", "README.md"), "# No metadata\n");

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /no document_metadata blocks found/);
});

test("document authority check rejects missing superseded paths", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-superseded-"));
  writeDoc(rootDir, "docs/old.md", {
    docType: "operational",
    lifecycle: "deprecated",
    authorityScope: "old_scope",
    supersededBy: "docs/missing.md",
    lastVerifiedAt: "2026-07-15",
    productionAuthority: false
  });

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /superseded_by path does not exist: docs\/missing\.md/);
});

test("document authority check validates the current repository metadata", () => {
  const result = runAuthorityCheck(REPOSITORY_ROOT);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validated 15 document metadata block/);
});
