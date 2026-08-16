import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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

function runAuthorityCheck(rootDir, options = {}) {
  const args = [CHECKER, "--root", rootDir];
  if (options.strictFiles) {
    args.push("--strict-files");
  }
  return spawnSync(process.execPath, args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8"
  });
}

function writeRawDoc(rootDir, path, body) {
  const fullPath = join(rootDir, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, body);
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
  const match = result.stdout.match(/validated (\d+) document metadata block/);
  assert.ok(match, `expected metadata count in output, received: ${result.stdout}`);
  assert.ok(Number(match[1]) > 0, `expected a non-empty metadata inventory, received: ${result.stdout}`);
});

test("document authority strict mode fails when docs/ file lacks metadata", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-strict-docs-missing-"));
  writeDoc(rootDir, "docs/A.md", {
    docType: "canonical",
    lifecycle: "active",
    authorityScope: "alpha",
    lastVerifiedAt: "2026-07-15",
    productionAuthority: false
  });
  writeRawDoc(rootDir, "docs/B.md", "# No metadata block\n");

  const defaultResult = runAuthorityCheck(rootDir);
  const strictResult = runAuthorityCheck(rootDir, { strictFiles: true });

  assert.equal(defaultResult.status, 0, defaultResult.stderr);
  assert.equal(strictResult.status, 1, strictResult.stderr);
  assert.match(strictResult.stderr, /file lacks document_metadata: docs\/B\.md/);
});

test("document authority strict mode fails when ops/ file lacks metadata", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-strict-ops-missing-"));
  writeDoc(rootDir, "docs/A.md", {
    docType: "canonical",
    lifecycle: "active",
    authorityScope: "alpha",
    lastVerifiedAt: "2026-07-15",
    productionAuthority: false
  });
  writeRawDoc(rootDir, "ops/B.md", "# No metadata block\n");

  const strictResult = runAuthorityCheck(rootDir, { strictFiles: true });

  assert.equal(strictResult.status, 1, strictResult.stderr);
  assert.match(strictResult.stderr, /file lacks document_metadata: ops\/B\.md/);
});

test("document authority strict mode ignores repo-root README.md", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-root-"));
  writeDoc(rootDir, "docs/A.md", {
    docType: "canonical",
    lifecycle: "active",
    authorityScope: "alpha",
    lastVerifiedAt: "2026-07-15",
    productionAuthority: false
  });
  writeRawDoc(rootDir, "README.md", "# root readme with no metadata\n");

  const strictResult = runAuthorityCheck(rootDir, { strictFiles: true });

  assert.equal(strictResult.status, 0, strictResult.stderr);
  assert.doesNotMatch(strictResult.stderr, /README\.md/);
});

test("document authority strict mode ignores docs/archive and docs/superpowers", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-archive-superpowers-"));
  writeDoc(rootDir, "docs/A.md", {
    docType: "canonical",
    lifecycle: "active",
    authorityScope: "alpha",
    lastVerifiedAt: "2026-07-15",
    productionAuthority: false
  });
  writeRawDoc(rootDir, "docs/archive/old.md", "# archived, no metadata\n");
  writeRawDoc(rootDir, "docs/superpowers/spec.md", "# spec, no metadata\n");

  const strictResult = runAuthorityCheck(rootDir, { strictFiles: true });

  assert.equal(strictResult.status, 0, strictResult.stderr);
  assert.doesNotMatch(strictResult.stderr, /docs\/archive\/old\.md/);
  assert.doesNotMatch(strictResult.stderr, /docs\/superpowers\/spec\.md/);
});

test("document authority marker window is the first 40 non-empty lines", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-nonempty-window-"));

  // Marker on the 40th non-empty line: should pass.
  // Structure: # Title (1) + 37 x lines (37) + ```yaml fence (1) = 39 non-empty
  // before document_metadata, so document_metadata itself is the 40th non-empty line.
  const insideBody = ["# Title", ...Array.from({ length: 37 }, () => "x"), ""].join("\n") +
    "\n```yaml\ndocument_metadata:\n  doc_type: canonical\n  lifecycle: active\n  authority_scope: alpha\n  superseded_by: null\n  last_verified_at: 2026-07-15\n  production_authority: false\n```\n";
  writeRawDoc(rootDir, "docs/inside.md", insideBody);

  // Marker on the 41st non-empty line: should fail (out of window).
  // Structure: # Title (1) + 38 x lines (38) + ```yaml fence (1) = 40 non-empty
  // before document_metadata, so document_metadata itself is the 41st non-empty line.
  const outsideBody = ["# Title", ...Array.from({ length: 38 }, () => "x"), ""].join("\n") +
    "\n```yaml\ndocument_metadata:\n  doc_type: canonical\n  lifecycle: active\n  authority_scope: beta\n  superseded_by: null\n  last_verified_at: 2026-07-15\n  production_authority: false\n```\n";
  writeRawDoc(rootDir, "docs/outside.md", outsideBody);

  const result = runAuthorityCheck(rootDir, { strictFiles: true });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /file lacks document_metadata: docs\/outside\.md/);
  assert.doesNotMatch(result.stderr, /file lacks document_metadata: docs\/inside\.md/);
});

test("source_only_ authority scope requires production_authority false", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-source-only-"));
  writeDoc(rootDir, "docs/clean.md", {
    docType: "operational",
    lifecycle: "active",
    authorityScope: "source_only_clean",
    lastVerifiedAt: "2026-07-15",
    productionAuthority: false
  });
  writeDoc(rootDir, "docs/violation.md", {
    docType: "operational",
    lifecycle: "active",
    authorityScope: "source_only_violation",
    lastVerifiedAt: "2026-07-15",
    productionAuthority: true
  });

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /source_only_ authority scopes require production_authority false/);
  assert.match(result.stderr, /docs\/violation\.md/);
  assert.doesNotMatch(result.stderr, /docs\/clean\.md: source_only/);
});

test("malformed metadata fails in default and strict modes", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-malformed-"));
  writeRawDoc(
    rootDir,
    "docs/bad.md",
    [
      "# Bad",
      "",
      "```yaml",
      "document_metadata:",
      "  doc_type: not_a_real_type",
      "  lifecycle: not_a_real_lifecycle",
      "  authority_scope: bad scope",
      "  superseded_by: null",
      "  last_verified_at: 2026-13-40",
      "  production_authority: maybe",
      "```",
      ""
    ].join("\n")
  );

  const defaultResult = runAuthorityCheck(rootDir);
  const strictResult = runAuthorityCheck(rootDir, { strictFiles: true });

  assert.equal(defaultResult.status, 1);
  assert.equal(strictResult.status, 1);
  assert.match(defaultResult.stderr, /unsupported doc_type not_a_real_type/);
  assert.match(defaultResult.stderr, /unsupported lifecycle not_a_real_lifecycle/);
  assert.match(defaultResult.stderr, /invalid authority_scope bad scope/);
  assert.match(defaultResult.stderr, /invalid last_verified_at 2026-13-40/);
  assert.match(defaultResult.stderr, /production_authority must be true or false/);
});

test("current repository templates are classified as operational+active", () => {
  const templatesDir = resolve(REPOSITORY_ROOT, "docs/production-replacement-records/templates");
  const singularTemplate = resolve(
    REPOSITORY_ROOT,
    "docs/production-replacement-records/TEMPLATE_SUBSCRIPTION_PROVISIONING.md"
  );

  const files = [...readdirSync(templatesDir).map((name) => join(templatesDir, name)), singularTemplate];

  for (const path of files) {
    if (!statSync(path).isFile()) continue;
    const text = readFileSync(path, "utf8");
    const docTypeMatch = text.match(/^  doc_type:\s*(\S+)/m);
    const lifecycleMatch = text.match(/^  lifecycle:\s*(\S+)/m);
    assert.ok(docTypeMatch, `${path}: missing doc_type`);
    assert.ok(lifecycleMatch, `${path}: missing lifecycle`);
    assert.equal(docTypeMatch[1], "operational", `${path}: expected operational, got ${docTypeMatch[1]}`);
    assert.equal(lifecycleMatch[1], "active", `${path}: expected active, got ${lifecycleMatch[1]}`);
  }
});

test("current repository has no active canonical with authority_scope release_state", () => {
  // After Q3 fix: release_state is reserved for historical alias; canonical uses current_release_state
  const docsRoot = resolve(REPOSITORY_ROOT, "docs");
  const opsRoot = resolve(REPOSITORY_ROOT, "ops");

  function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "archive" || entry.name === "superpowers") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
    }
    return out;
  }

  const files = [...walk(docsRoot), ...walk(opsRoot)];
  for (const path of files) {
    const text = readFileSync(path, "utf8");
    const yamlMatch = text.match(/```yaml\n([\s\S]*?)\n```/);
    if (!yamlMatch) continue;
    const block = yamlMatch[1];
    const docType = (block.match(/^  doc_type:\s*(\S+)/m) || [])[1];
    const lifecycle = (block.match(/^  lifecycle:\s*(\S+)/m) || [])[1];
    const scope = (block.match(/^  authority_scope:\s*(\S+)/m) || [])[1];
    if (docType === "canonical" && lifecycle === "active" && scope === "release_state") {
      assert.fail(`${path}: release_state must not be an active canonical scope per CONVENTIONS.md`);
    }
  }
});
