#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, lstatSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SEARCH_DIRECTORIES = ["docs", "ops"];
const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".worktrees",
  "node_modules",
  "archive",
  "superpowers"
]);
const REQUIRED_FIELDS = [
  "doc_type",
  "lifecycle",
  "authority_scope",
  "superseded_by",
  "last_verified_at",
  "production_authority"
];
const VALID_DOC_TYPES = new Set(["canonical", "operational", "evidence"]);
const VALID_LIFECYCLES = new Set(["active", "deprecated", "historical"]);
const AUTHORITY_SCOPE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

// Lexical grammar constants. The marker, fences, and field indent are matched
// exactly (no trim, no whitespace tolerance). The on-disk contract is
// column-1 fences and marker with exactly two ASCII-space indentation for the
// field block; for an already-recognised metadata block, anything else is a
// hard parse error. Lines outside the metadata grammar (for example
// `document_metadata_template:`) are not parser candidates and are simply
// ignored — they neither promote a file to governed status nor trigger a
// parse error.
const METADATA_MARKER = "document_metadata:";
const YAML_FENCE_OPEN = "```yaml";
const YAML_FENCE_CLOSE = "```";
// Byte-exact field pattern: exactly two ASCII spaces, exactly one ASCII space
// after the colon, value content must start and end with non-whitespace, and
// trailing whitespace on the field line is a parse error. Unicode whitespace
// can still appear inside the value (the `\S` anchors only check the ends);
// any field-level rejection of Unicode whitespace happens via the per-field
// validators below, not inside this regex.
const METADATA_FIELD_PATTERN =
  /^ {2}([a-z_]+): (\S(?:.*\S)?)$/;
// Diagnostic-only marker pattern. Grammar:
//   /^\s*document_metadata\s*:\s*$/u
// - `^\s*` — any leading whitespace (ASCII or Unicode).
// - `document_metadata` — the byte-exact field name.
// - `\s*:\s*` — the colon may be preceded by trailing whitespace on the field
//   name and followed by trailing whitespace before the line end. This is the
//   shape `trim()` cannot describe: `document_metadata :` matches because
//   `\s*` between `document_metadata` and `:` consumes the embedded space,
//   yet trimming the line does not equal the byte-exact marker.
// - `\s*$` — any trailing whitespace before the line ends.
// Used exclusively to report malformed markers; it MUST NOT be used to
// accept a metadata block.
const MARKER_LIKE_PATTERN = /^\s*document_metadata\s*:\s*$/u;
// Canonical repository-relative path: forward slashes only, no leading slash,
// no Windows drive prefix, no empty / dot / dotdot segments.
const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:[\\/]/;

function isCanonicalRepoRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  if (value.includes("\\")) {
    return false;
  }
  if (isAbsolute(value)) {
    return false;
  }
  if (WINDOWS_DRIVE_PREFIX.test(value)) {
    return false;
  }
  if (value.startsWith("/")) {
    return false;
  }
  const segments = value.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      return false;
    }
  }
  return true;
}

function normalizedRepoPath(path) {
  return path.replaceAll("\\", "/");
}

function listMarkdownFiles(rootDir) {
  // Collect pairs of canonical repository-relative path => filesystem path.
  // Do not collapse collisions silently; report them as hard errors so a
  // malicious or confusing filename cannot be hidden by normalization.
  const entries = [];

  function walk(relativeDir) {
    const fullDir = join(rootDir, relativeDir);
    if (!existsSync(fullDir)) {
      return;
    }
    for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const relativePath = join(relativeDir, entry.name);
      // Reject any file or directory name that itself contains a literal
      // backslash on POSIX systems; that character is only a path separator
      // on Windows and would collide with canonicalization.
      if (process.platform !== "win32" && entry.name.includes("\\")) {
        throw new Error(
          `filename contains literal backslash on POSIX and is ambiguous: ${relativePath}`
        );
      }
      if (entry.isSymbolicLink()) {
        throw new Error(
          `symlink encountered under in-scope directory; remove or replace with a regular file: ${relativePath}`
        );
      }
      if (entry.isDirectory()) {
        walk(relativePath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const canonical = normalizedRepoPath(relativePath);
        const fsPath = join(rootDir, relativePath);
        entries.push({ canonical, fsPath });
      }
    }
  }

  // Pre-check each search root for symlinks (including broken symlinks) and
  // treat a missing root as out-of-scope rather than an error.
  for (const directory of SEARCH_DIRECTORIES) {
    const rootPath = join(rootDir, directory);
    try {
      const st = lstatSync(rootPath);
      if (st.isSymbolicLink()) {
        throw new Error(`search root is a symbolic link: ${directory}`);
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        // absent root: skip
        continue;
      }
      // rethrow other errors
      throw err;
    }
    walk(directory);
  }

  // Build a canonical->fsPath map and detect collisions.
  const map = new Map();
  for (const { canonical, fsPath } of entries) {
    const existing = map.get(canonical) || [];
    existing.push(fsPath);
    map.set(canonical, existing);
  }
  const collisions = [];
  for (const [canonical, fsPaths] of map) {
    if (fsPaths.length > 1) {
      collisions.push({ canonical, fsPaths });
    }
  }
  if (collisions.length > 0) {
    const lines = collisions
      .map(
        (c) =>
          `canonical collision for ${c.canonical}: filesystem paths: ${c.fsPaths
            .map((p) => relative(rootDir, p))
            .join(", ")}`
      )
      .join("; ");
    throw new Error(`canonical inventory collision: ${lines}`);
  }

  // Return an array of { canonical, fsPath } sorted by canonical key.
  return Array.from(map.entries())
    .map(([canonical, fsPaths]) => ({ canonical, fsPath: fsPaths[0] }))
    .sort((a, b) => a.canonical.localeCompare(b.canonical));
}

function unquote(value) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseMetadata(text, path, errors) {
  const lines = text.split(/\r?\n/);

  // Marker scan: enumerate every candidate line in the first 40 non-empty
  // lines of the file. Candidates that exactly equal METADATA_MARKER are
  // tracked separately from candidates that match MARKER_LIKE_PATTERN but
  // are not byte-exact (e.g. leading whitespace, embedded space before the
  // colon, trailing whitespace, multiple occurrences). The diagnostic regex
  // is intentionally permissive so every plausible typo surfaces; only the
  // byte-exact marker is accepted downstream.
  const markerWindow = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.length > 0 && line.trim() !== "")
    .slice(0, 40);

  // Find all exact and marker-like occurrences within the first 40 non-empty
  // lines. Requirement: exactly one byte-exact marker and zero additional
  // marker-like lines. Any ambiguity is a hard parse error (fail-closed).
  const exactMarkers = markerWindow.filter(({ line }) => line === METADATA_MARKER);
  const malformedMarkers = markerWindow.filter(({ line }) => MARKER_LIKE_PATTERN.test(line) && line !== METADATA_MARKER);

  if (exactMarkers.length === 0 && malformedMarkers.length === 0) {
    // No markers at all in the marker window.
    return { fields: null, foundMarker: false };
  }

  if (exactMarkers.length === 0 && malformedMarkers.length > 0) {
    // No exact marker but malformed candidates present — report each and
    // consider the file as containing a malformed marker (foundMarker true).
    for (const { line, index } of malformedMarkers) {
      errors.push(
        `${path}:${index + 1}: malformed document_metadata marker; expected ${JSON.stringify(METADATA_MARKER)} at column 1, got ${JSON.stringify(line)}`
      );
    }
    return { fields: null, foundMarker: true };
  }

  if (exactMarkers.length === 1 && malformedMarkers.length === 0) {
    // Exactly one exact marker and no malformed candidates: use it.
    const markerIndex = exactMarkers[0].index;

    // Opening fence must be exactly ```yaml at column 1 of a line above the
    // marker. We allow blank lines between the fence and the marker but the
    // fence line itself must equal YAML_FENCE_OPEN exactly.
    let fenceStart = markerIndex - 1;
    while (fenceStart >= 0 && lines[fenceStart] === "") {
      fenceStart -= 1;
    }
    if (fenceStart < 0 || lines[fenceStart] !== YAML_FENCE_OPEN) {
      errors.push(`${path}:${markerIndex + 1}: document_metadata must be in a top-level yaml fence`);
      return { fields: null, foundMarker: true };
    }

    // Closing fence must be exactly ``` (column 1, no trim).
    const fenceEnd = lines.findIndex(
      (line, index) => index > markerIndex && line === YAML_FENCE_CLOSE
    );
    if (fenceEnd < 0) {
      errors.push(`${path}:${markerIndex + 1}: document_metadata yaml fence is not closed`);
      return { fields: null, foundMarker: true };
    }

    const fields = {};
    for (let index = markerIndex + 1; index < fenceEnd; index += 1) {
      const line = lines[index];
      // Tab is rejected anywhere in the metadata block before pattern matching.
      // Unicode whitespace beyond ASCII is NOT a hard parse error here — the
      // strict field pattern only fixes the indent to two ASCII spaces and
      // pins the value to non-whitespace at both ends. Any Unicode
      // whitespace between those ends is allowed by this regex and is then
      // adjudicated by the per-field validators below (e.g. date format).
      if (line.includes("\t")) {
        errors.push(
          `${path}:${index + 1}: document_metadata field lines must use two ASCII spaces for indentation; tab is not accepted`
        );
        continue;
      }
      if (line === "" || line.startsWith("#")) {
        continue;
      }
      const match = line.match(METADATA_FIELD_PATTERN);
      if (!match) {
        errors.push(
          `${path}:${index + 1}: unsupported document_metadata syntax (expected two ASCII spaces, exactly one ASCII space after the colon, no trailing whitespace, value with non-whitespace at both ends)`
        );
        continue;
      }
      const [, key, rawValue] = match;
      if (Object.hasOwn(fields, key)) {
        errors.push(`${path}:${index + 1}: duplicate document_metadata field ${key}`);
        continue;
      }
      fields[key] = unquote(rawValue);
    }

    for (const field of REQUIRED_FIELDS) {
      if (!Object.hasOwn(fields, field) || fields[field] === "") {
        errors.push(`${path}: missing document_metadata field ${field}`);
      }
    }
    for (const field of Object.keys(fields)) {
      if (!REQUIRED_FIELDS.includes(field)) {
        errors.push(`${path}: unsupported document_metadata field ${field}`);
      }
    }
    return { fields, foundMarker: true };
  }

  // Any other combination is ambiguous (e.g., multiple exact markers, a mix
  // of exact and malformed markers, or multiple malformed markers). Report
  // every marker-like line as an explicit error and fail-closed.
  const allMarkerLike = markerWindow.filter(({ line }) => MARKER_LIKE_PATTERN.test(line) || line === METADATA_MARKER);
  for (const { line, index } of allMarkerLike) {
    errors.push(
      `${path}:${index + 1}: ambiguous or multiple document_metadata markers found; expected exactly one byte-exact ${JSON.stringify(METADATA_MARKER)}, got ${JSON.stringify(line)}`
    );
  }
  return { fields: null, foundMarker: true };
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateFields(path, fields, errors) {
  if (fields.doc_type !== undefined && !VALID_DOC_TYPES.has(fields.doc_type)) {
    errors.push(`${path}: unsupported doc_type ${fields.doc_type}`);
  }
  if (fields.lifecycle !== undefined && !VALID_LIFECYCLES.has(fields.lifecycle)) {
    errors.push(`${path}: unsupported lifecycle ${fields.lifecycle}`);
  }
  if (
    fields.authority_scope !== undefined &&
    !AUTHORITY_SCOPE_PATTERN.test(fields.authority_scope)
  ) {
    errors.push(`${path}: invalid authority_scope ${fields.authority_scope}`);
  }
  if (
    fields.last_verified_at !== undefined &&
    !isValidDate(fields.last_verified_at)
  ) {
    errors.push(`${path}: invalid last_verified_at ${fields.last_verified_at}`);
  }
  if (
    fields.production_authority !== undefined &&
    fields.production_authority !== "true" &&
    fields.production_authority !== "false"
  ) {
    errors.push(`${path}: production_authority must be true or false`);
  }
  if (
    fields.authority_scope !== undefined &&
    fields.authority_scope.startsWith("source_only_") &&
    fields.production_authority !== "false"
  ) {
    errors.push(
      `${path}: source_only_ authority scopes require production_authority false`
    );
  }
}

function checkLifecycleAndSupersededBy(path, fields, errors) {
  // Enforce the lifecycle/superseded_by contract without touching the filesystem.
  // Successor resolution against the governed inventory happens later in
  // checkSupersededByAgainstRecords so that this stage stays pure.
  const value = fields.superseded_by;
  if (value === undefined) {
    return;
  }
  if (fields.lifecycle === "deprecated") {
    if (value === "null") {
      errors.push(`${path}: deprecated lifecycle requires superseded_by`);
      return;
    }
  } else if (value !== "null") {
    errors.push(
      `${path}: ${fields.lifecycle} lifecycle requires superseded_by null`
    );
    return;
  }
  if (value === "null") {
    return;
  }
  // Reject any value that is not a lexically canonical repository-relative
  // path: absolute paths, backslashes, Windows drive prefixes, leading
  // slashes, empty segments, and dot / dotdot segments all fail closed here.
  // The cross-record lookup later performs an exact-key match against the
  // governed inventory and would silently miss otherwise.
  if (!isCanonicalRepoRelativePath(value)) {
    errors.push(
      `${path}: superseded_by must be a canonical repository-relative path (forward slashes, no drive prefix, no dot-segments, no empty segments); got ${value}`
    );
    return;
  }
}

function checkSupersededByAgainstRecords(
  sourcePath,
  fields,
  parsedRecordsByPath,
  validRecordsByPath,
  errors
) {
  const value = fields.superseded_by;
  if (value === undefined || value === "null") {
    return;
  }
  if (fields.lifecycle !== "deprecated") {
    return;
  }

  // Exact-key lookup: the parser already normalized the value to forward
  // slashes; reject any path that did not lexically match an inventory key
  // verbatim. Phase 1 rejects absolute paths, backslashes, Windows drive
  // paths, dot-segments, and empty segments, so a lookup hit here is the
  // exact repository-relative key the parser kept.
  const normalizedTarget = normalizedRepoPath(value);
  if (normalizedTarget === sourcePath) {
    errors.push(
      `${sourcePath}: superseded_by must not point at the source file (self-reference): ${value}`
    );
    return;
  }
  const parsedTarget = parsedRecordsByPath.get(normalizedTarget);
  if (!parsedTarget) {
    errors.push(
      `${sourcePath}: superseded_by must reference an in-scope governed Markdown file under docs/ or ops/: ${value}`
    );
    return;
  }
  // parsedTarget exists in the inventory but may have failed Phase 1. Treat
  // any non-Phase-1-valid target as a hard successor error rather than
  // silently coercing it (e.g. reporting the wrong lifecycle). The exact
  // Phase-1 error is already in the global errors list from the Phase-1
  // pass; here we add a successor-specific pointer.
  if (!validRecordsByPath.has(normalizedTarget)) {
    errors.push(
      `${sourcePath}: superseded_by target is not Phase-1-valid (fails its own document_metadata checks): ${value}`
    );
    return;
  }
  if (parsedTarget.fields.lifecycle !== "active") {
    errors.push(
      `${sourcePath}: superseded_by target must have lifecycle active (got ${parsedTarget.fields.lifecycle}): ${value}`
    );
  }
}

function checkProductionAuthorityAllowed(path, fields, errors) {
  // Fail-closed guard: until production_gate_id coupling is introduced,
  // refuse production_authority: true so a manual review cannot accidentally
  // promote a doc by editing metadata alone.
  if (fields.production_authority === "true") {
    errors.push(
      `${path}: production_authority true is unsupported until gate coupling is introduced`
    );
  }
}

function checkDuplicateCanonicalScopes(records, errors) {
  const pathsByScope = new Map();
  for (const record of records) {
    if (
      record.fields.doc_type !== "canonical" ||
      record.fields.lifecycle !== "active" ||
      !record.fields.authority_scope
    ) {
      continue;
    }
    const paths = pathsByScope.get(record.fields.authority_scope) ?? [];
    paths.push(record.path);
    pathsByScope.set(record.fields.authority_scope, paths);
  }
  for (const [scope, paths] of pathsByScope) {
    if (paths.length > 1) {
      errors.push(
        `duplicate active canonical authority_scope ${scope}: ${paths.sort().join(", ")}`
      );
    }
  }
}

export function checkDocumentAuthority(options = {}) {
  const rootDir = resolve(options.rootDir ?? DEFAULT_ROOT);
  // Fail-closed: split the missing-vs-not-directory diagnoses so reviewers can
  // tell whether they typed the wrong path or pointed at a regular file. The
  // CLI layer above rejects empty / blank / flag-shaped values before reaching
  // this stage, so any fall-through here is an honest rootDir candidate.
  if (!existsSync(rootDir)) {
    throw new Error(`root directory does not exist: ${rootDir}`);
  }
  if (!statSync(rootDir).isDirectory()) {
    throw new Error(`root path is not a directory: ${rootDir}`);
  }
  const strictFiles = Boolean(options.strictFiles);
  const errors = [];
  // parsedRecordsByPath holds every parsed record (Phase 1 raw output); the
  // Phase-2 successor lookup uses it for diagnostic context. validRecords
  // (and its companion validRecordsByPath) holds records whose Phase-1
  // per-record checks produced zero errors. Phase 2 only iterates the
  // validRecords set so a malformed record never tries to resolve successors
  // against itself or against other malformed records; if a successor lookup
  // hits a parsed-but-invalid record, checkSupersededByAgainstRecords reports
  // an explicit "not Phase-1-valid" diagnostic instead of silently accepting.
  const parsedRecords = [];
  const validRecords = [];
  const ungovernedFiles = [];

  for (const entry of listMarkdownFiles(rootDir)) {
    const { canonical: path, fsPath } = entry;
    const recordErrors = [];
    const text = readFileSync(fsPath, "utf8");
    const { fields, foundMarker } = parseMetadata(text, path, recordErrors);
    if (!foundMarker) {
      ungovernedFiles.push(path);
      continue;
    }
    if (!fields) {
      // parseMetadata already pushed diagnostic(s) into recordErrors; copy
      // them to the global errors list so reviewers still see them in the
      // consolidated output, but do not push the record into either
      // parsedRecords or validRecords because there are no fields to validate
      // against Phase-1 contracts.
      for (const recordError of recordErrors) {
        errors.push(recordError);
      }
      continue;
    }
    // Phase 1: per-record field validation. Pure; no cross-record resolution.
    // All per-record errors (lexical markers, missing fields, duplicate
    // fields, unsupported fields, lifecycle contract, production-authority
    // contract) flow into recordErrors so the record can carry a `valid`
    // flag for Phase 2 to honour. The global errors list also gets a copy
    // so reviewers still see them in the consolidated output.
    validateFields(path, fields, recordErrors);
    checkLifecycleAndSupersededBy(path, fields, recordErrors);
    checkProductionAuthorityAllowed(path, fields, recordErrors);
    const record = { path, fields, recordErrors };
    parsedRecords.push(record);
    for (const recordError of recordErrors) {
      errors.push(recordError);
    }
    if (recordErrors.length === 0) {
      validRecords.push(record);
    }
  }

  const parsedRecordsByPath = new Map(
    parsedRecords.map((record) => [record.path, record])
  );
  const validRecordsByPath = new Map(
    validRecords.map((record) => [record.path, record])
  );

  // Phase 2: cross-record successor resolution against the governed inventory
  // only. Iterate the Phase-1-valid records; look up successors via the full
  // parsed map (so a malformed target still gets surfaced, not silently
  // skipped) and reject any lookup miss or any target that is parsed but
  // not Phase-1-valid.
  for (const record of validRecords) {
    checkSupersededByAgainstRecords(
      record.path,
      record.fields,
      parsedRecordsByPath,
      validRecordsByPath,
      errors
    );
  }

  if (strictFiles) {
    for (const path of ungovernedFiles) {
      errors.push(`file lacks document_metadata: ${path}`);
    }
  }
  if (parsedRecords.length === 0) {
    errors.push("no document_metadata blocks found");
  }
  checkDuplicateCanonicalScopes(validRecords, errors);

  const ok = errors.length === 0;
  return {
    ok,
    errors,
    documents: validRecords.map((record) => ({
      path: record.path,
      docType: record.fields.doc_type,
      lifecycle: record.fields.lifecycle,
      authorityScope: record.fields.authority_scope
    })),
    ungovernedFiles,
    summary: ok
      ? `validated ${validRecords.length} document metadata block(s) from ${relative(process.cwd(), rootDir) || "."}`
      : `document authority check failed with ${errors.length} error(s)`
  };
}

function parseCliArgs(args) {
  const out = { rootDir: DEFAULT_ROOT, strictFiles: false };
  const seenRoot = { count: 0 };
  const seenStrict = { count: 0 };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--root") {
      seenRoot.count += 1;
      if (seenRoot.count > 1) {
        throw new Error("--root may only be specified once");
      }
      const value = args[i + 1];
        // Fail-closed: refuse undefined (no argument), empty / blank value, or a
        // value that itself starts with "--" (looks like another flag). These
        // checks stop resolve("") from silently collapsing to process.cwd().
        if (
          value === undefined ||
          value.trim() === "" ||
          value.startsWith("--")
        ) {
          throw new Error("--root requires a non-empty directory");
        }
        out.rootDir = resolve(value);
        i += 1;
      } else if (token === "--strict-files") {
      seenStrict.count += 1;
      if (seenStrict.count > 1) {
        throw new Error("--strict-files may only be specified once");
      }
      out.strictFiles = true;
    } else if (token.startsWith("--")) {
      throw new Error(`unsupported flag: ${token}`);
    } else {
      throw new Error(`unexpected positional argument: ${token}`);
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const argv = process.argv.slice(2);
    const { rootDir, strictFiles } = parseCliArgs(argv);
    const result = checkDocumentAuthority({ rootDir, strictFiles });
    if (result.ok) {
      console.log(result.summary);
    } else {
      console.error(result.summary);
      for (const error of result.errors) {
        console.error(`- ${error}`);
      }
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`document authority check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
