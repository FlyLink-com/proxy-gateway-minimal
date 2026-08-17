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
  // The successor target must exist as an in-scope governed Markdown record,
  // not merely as an existing file on disk.
  assert.match(
    result.stderr,
    /superseded_by must reference an in-scope governed Markdown file under docs\/ or ops\/: docs\/missing\.md/
  );
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

test("document authority check rejects active lifecycle with non-null superseded_by", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-active-superseded-"));
  writeDoc(rootDir, "docs/new.md", {
    docType: "canonical",
    lifecycle: "active",
    authorityScope: "new_scope",
    supersededBy: "docs/old.md",
    lastVerifiedAt: "2026-07-15",
    productionAuthority: false
  });
  writeDoc(rootDir, "docs/old.md", {
    docType: "operational",
    lifecycle: "deprecated",
    authorityScope: "old_scope",
    supersededBy: "docs/new.md",
    lastVerifiedAt: "2026-07-15",
    productionAuthority: false
  });

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /active lifecycle requires superseded_by null/);
  assert.match(result.stderr, /docs\/new\.md/);
});

test("document authority check rejects historical lifecycle with non-null superseded_by", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-historical-superseded-"));
  writeDoc(rootDir, "docs/A.md", {
    docType: "evidence",
    lifecycle: "historical",
    authorityScope: "historical_scope",
    supersededBy: "docs/B.md",
    lastVerifiedAt: "2026-07-15",
    productionAuthority: false
  });
  writeDoc(rootDir, "docs/B.md", {
    docType: "operational",
    lifecycle: "deprecated",
    authorityScope: "old_scope",
    supersededBy: "docs/A.md",
    lastVerifiedAt: "2026-07-15",
    productionAuthority: false
  });

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /historical lifecycle requires superseded_by null/);
  assert.match(result.stderr, /docs\/A\.md/);
});

test("document authority check rejects deprecated lifecycle pointing at a directory", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-deprecated-dir-"));
  mkdirSync(join(rootDir, "docs/subdir"), { recursive: true });
  writeDoc(rootDir, "docs/old.md", {
    docType: "operational",
    lifecycle: "deprecated",
    authorityScope: "old_scope",
    supersededBy: "docs/subdir",
    lastVerifiedAt: "2026-07-15",
    productionAuthority: false
  });

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1, result.stderr);
  // The successor target must be a governed Markdown record; a directory is
  // neither, so the cross-record check rejects it.
  assert.match(
    result.stderr,
    /superseded_by must reference an in-scope governed Markdown file under docs\/ or ops\/: docs\/subdir/
  );
});

test("document authority strict mode fails when the root directory does not exist", () => {
  const result = spawnSync(process.execPath, [
    CHECKER,
    "--root",
    "/definitely-does-not-exist",
    "--strict-files"
  ], { cwd: REPOSITORY_ROOT, encoding: "utf8" });

  assert.notEqual(result.status, 0, "strict mode must fail closed on missing root");
  assert.match(result.stderr, /root directory does not exist/);
});

test("document authority strict mode fails when --root is followed by another flag", () => {
  const result = spawnSync(process.execPath, [
    CHECKER,
    "--root",
    "--strict-files"
  ], { cwd: REPOSITORY_ROOT, encoding: "utf8" });

  assert.notEqual(result.status, 0, "strict mode must fail closed on malformed --root");
  assert.match(result.stderr, /--root requires a directory/);
});

test("document authority strict mode fails on empty in-scope inventory", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-empty-scope-"));
  mkdirSync(join(rootDir, "docs"), { recursive: true });
  mkdirSync(join(rootDir, "ops"), { recursive: true });
  // No files at all in docs/ or ops/.

  const result = runAuthorityCheck(rootDir, { strictFiles: true });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /no document_metadata blocks found/);
});

test("current repository passes strict document authority", () => {
  const result = runAuthorityCheck(REPOSITORY_ROOT, { strictFiles: true });

  assert.equal(result.status, 0, result.stderr);
  const match = result.stdout.match(/validated (\d+) document metadata block/);
  assert.ok(match, `expected metadata count in output, received: ${result.stdout}`);
  assert.ok(Number(match[1]) > 0, `expected a non-empty metadata inventory, received: ${result.stdout}`);
});

function writeRawMetadata(rootDir, path, rawBody) {
  const fullPath = join(rootDir, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, rawBody);
}

test("successor must not point at a non-Markdown target", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-successor-txt-"));
  writeDoc(rootDir, "docs/source.md", {
    docType: "operational",
    lifecycle: "deprecated",
    authorityScope: "succ_txt",
    supersededBy: "docs/replacement.txt",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });
  writeRawMetadata(rootDir, "docs/replacement.txt", "not a markdown file\n");

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /superseded_by must reference an in-scope governed Markdown file under docs\/ or ops\/: docs\/replacement\.txt/
  );
});

test("successor must not point at an archive/ Markdown target", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-successor-archive-"));
  writeDoc(rootDir, "docs/source.md", {
    docType: "operational",
    lifecycle: "deprecated",
    authorityScope: "succ_archive",
    supersededBy: "docs/archive/replacement.md",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });
  writeDoc(rootDir, "docs/archive/replacement.md", {
    docType: "canonical",
    lifecycle: "active",
    authorityScope: "succ_archive_target",
    supersededBy: "null",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /superseded_by must reference an in-scope governed Markdown file under docs\/ or ops\/: docs\/archive\/replacement\.md/
  );
});

test("successor must not point at a superpowers/ Markdown target", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-successor-superpowers-"));
  writeDoc(rootDir, "docs/source.md", {
    docType: "operational",
    lifecycle: "deprecated",
    authorityScope: "succ_super",
    supersededBy: "docs/superpowers/spec.md",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });
  writeDoc(rootDir, "docs/superpowers/spec.md", {
    docType: "canonical",
    lifecycle: "active",
    authorityScope: "succ_super_target",
    supersededBy: "null",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /superseded_by must reference an in-scope governed Markdown file under docs\/ or ops\/: docs\/superpowers\/spec\.md/
  );
});

test("successor must not escape scope via dot-segment path", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-successor-dot-"));
  writeDoc(rootDir, "docs/source.md", {
    docType: "operational",
    lifecycle: "deprecated",
    authorityScope: "succ_dot",
    supersededBy: "docs/../docs/archive/replacement.md",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });
  writeDoc(rootDir, "docs/archive/replacement.md", {
    docType: "canonical",
    lifecycle: "active",
    authorityScope: "succ_dot_target",
    supersededBy: "null",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1, result.stderr);
  // The path is canonicalized by join + relative before lookup, so the archive
  // path is correctly rejected.
  assert.match(
    result.stderr,
    /superseded_by must reference an in-scope governed Markdown file under docs\/ or ops\/: docs\/\.\.\/docs\/archive\/replacement\.md/
  );
});

test("successor must not point at ungoverned Markdown target", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-successor-ungoverned-"));
  writeDoc(rootDir, "docs/source.md", {
    docType: "operational",
    lifecycle: "deprecated",
    authorityScope: "succ_ungov",
    supersededBy: "docs/target.md",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });
  writeRawMetadata(rootDir, "docs/target.md", "# target without metadata\n");

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /superseded_by must reference an in-scope governed Markdown file under docs\/ or ops\/: docs\/target\.md/
  );
});

test("successor target with valid Phase-1 metadata but historical lifecycle is rejected", () => {
  // Cross-record contract: even when the target record is parseable and
  // Phase 1-valid, a successor that resolves to a record whose lifecycle is
  // not "active" must be rejected. The .txt / archive / superpowers /
  // dot-segment / ungoverned tests cover file-not-in-inventory cases; this
  // pins the inventory-but-not-active case at the Phase-2 layer.
  //
  // Source is deprecated → target. Target is itself deprecated and points at a
  // third active record. Phase 1 surfaces the deprecated-target error for
  // the target record (it has non-null superseded_by), then Phase 2 surfaces
  // the "lifecycle not active" error for the source record. Both must be
  // present so the round-6 contract is fully observable.
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-successor-inactive-"));
  writeDoc(rootDir, "docs/source.md", {
    docType: "operational",
    lifecycle: "deprecated",
    authorityScope: "succ_inactive",
    supersededBy: "docs/target.md",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });
  writeDoc(rootDir, "docs/target.md", {
    docType: "canonical",
    lifecycle: "deprecated",
    authorityScope: "succ_inactive_target",
    supersededBy: "docs/now.md",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });
  writeDoc(rootDir, "docs/now.md", {
    docType: "canonical",
    lifecycle: "active",
    authorityScope: "succ_inactive_now",
    supersededBy: "null",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /superseded_by target must have lifecycle active \(got deprecated\): docs\/target\.md/
  );
});

test("successor must not point at a self-reference", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-successor-self-"));
  writeDoc(rootDir, "docs/source.md", {
    docType: "operational",
    lifecycle: "deprecated",
    authorityScope: "succ_self",
    supersededBy: "docs/source.md",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /superseded_by must not point at the source file \(self-reference\): docs\/source\.md/
  );
});

test("successor must not point at a historical target", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-successor-historical-"));
  writeDoc(rootDir, "docs/source.md", {
    docType: "operational",
    lifecycle: "deprecated",
    authorityScope: "succ_hist",
    supersededBy: "docs/target.md",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });
  writeDoc(rootDir, "docs/target.md", {
    docType: "canonical",
    lifecycle: "historical",
    authorityScope: "succ_hist_target",
    supersededBy: "docs/now.md",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });
  writeDoc(rootDir, "docs/now.md", {
    docType: "canonical",
    lifecycle: "active",
    authorityScope: "succ_hist_target_now",
    supersededBy: "null",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /superseded_by target must have lifecycle active \(got historical\): docs\/target\.md/
  );
});

test("production_authority true is rejected by the fail-closed guard", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-production-authority-true-"));
  writeDoc(rootDir, "docs/source.md", {
    docType: "canonical",
    lifecycle: "active",
    authorityScope: "prod_true",
    supersededBy: "null",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "true"
  });

  const result = runAuthorityCheck(rootDir);

  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /production_authority true is unsupported until gate coupling is introduced/
  );
});

test("duplicate --root is rejected by the CLI parser", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-cli-duplicate-root-"));
  const result = spawnSync(
    process.execPath,
    [CHECKER, "--root", rootDir, "--root", rootDir],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" }
  );

  assert.notEqual(result.status, 0, "duplicate --root must be rejected");
  assert.match(result.stderr, /--root may only be specified once/);
});

test("duplicate --strict-files is rejected by the CLI parser", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-cli-duplicate-strict-"));
  const result = spawnSync(
    process.execPath,
    [CHECKER, "--root", rootDir, "--strict-files", "--strict-files"],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" }
  );

  assert.notEqual(result.status, 0, "duplicate --strict-files must be rejected");
  assert.match(result.stderr, /--strict-files may only be specified once/);
});

test("positional argument is rejected by the CLI parser", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-cli-positional-"));
  const result = spawnSync(
    process.execPath,
    [CHECKER, "--root", rootDir, "positional"],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" }
  );

  assert.notEqual(result.status, 0, "positional argument must be rejected");
  assert.match(result.stderr, /unexpected positional argument: positional/);
});

test("CLI accepts --strict-files before --root", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-cli-order-1-"));
  writeDoc(rootDir, "docs/source.md", {
    docType: "canonical",
    lifecycle: "active",
    authorityScope: "cli_order_a",
    supersededBy: "null",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });

  const result = spawnSync(
    process.execPath,
    [CHECKER, "--strict-files", "--root", rootDir],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validated 1 document metadata block/);
});

test("CLI accepts --root before --strict-files", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "document-authority-cli-order-2-"));
  writeDoc(rootDir, "docs/source.md", {
    docType: "canonical",
    lifecycle: "active",
    authorityScope: "cli_order_b",
    supersededBy: "null",
    lastVerifiedAt: "2026-08-17",
    productionAuthority: "false"
  });

  const result = spawnSync(
    process.execPath,
    [CHECKER, "--root", rootDir, "--strict-files"],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validated 1 document metadata block/);
});
