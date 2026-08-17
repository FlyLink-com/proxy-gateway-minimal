#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
// field block; anything else is a hard parse error.
const METADATA_MARKER = "document_metadata:";
const YAML_FENCE_OPEN = "```yaml";
const YAML_FENCE_CLOSE = "```";
const METADATA_FIELD_PATTERN = /^ {2}([a-z_]+): (.+?) *$/;
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
  const paths = [];

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
      if (entry.isSymbolicLink()) {
        throw new Error(
          `symlink encountered under in-scope directory; remove or replace with a regular file: ${relativePath}`
        );
      }
      if (entry.isDirectory()) {
        walk(relativePath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        paths.push(normalizedRepoPath(relativePath));
      }
    }
  }

  for (const directory of SEARCH_DIRECTORIES) {
    walk(directory);
  }
  return [...new Set(paths)].sort();
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

  // Marker scan: locate the first line in the first 40 non-empty lines that
  // exactly equals METADATA_MARKER (column 1, no trim, no leading or trailing
  // whitespace). Any whitespace deviation is a misplaced marker and is reported
  // via the diagnostic path.
  const markerCandidate = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.length > 0 && line.trim() !== "")
    .slice(0, 40)
    .find(({ line }) => line === METADATA_MARKER);

  if (!markerCandidate) {
    // Diagnostic only: scan the first 40 non-empty lines for any
    // near-miss marker (trimmed equal). If exactly one such line is present,
    // surface a misplaced-marker diagnostic so authors can locate the typo.
      // The record is still recognised as "containing a metadata block" (so
      // strict mode does not also fire "file lacks document_metadata") and
      // fields stay null so the parser will not emit follow-on field errors.
      const nearMisses = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.length > 0 && line.trim() !== "")
        .slice(0, 40)
        .filter(({ line }) => line.trim() === METADATA_MARKER);
      if (nearMisses.length === 1) {
        const { line, index } = nearMisses[0];
        const trimmed = line.trim();
        if (trimmed === METADATA_MARKER && line !== METADATA_MARKER) {
          errors.push(
            `${path}:${index + 1}: misplaced document_metadata marker (must appear at column 1 with no leading or trailing whitespace); got ${JSON.stringify(line)}`
          );
          return { fields: null, foundMarker: true };
        }
      }
      return { fields: null, foundMarker: false };
    }
    const markerIndex = markerCandidate.index;

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
    // Unicode whitespace beyond ASCII is implicitly rejected by the strict
    // field pattern (which requires two ASCII spaces, not \s).
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
        `${path}:${index + 1}: unsupported document_metadata syntax (expected two-space indent and one ASCII space around the colon)`
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

  for (const path of listMarkdownFiles(rootDir)) {
    const text = readFileSync(join(rootDir, path), "utf8");
    const { fields, foundMarker } = parseMetadata(text, path, errors);
    if (!foundMarker) {
      ungovernedFiles.push(path);
      continue;
    }
    if (!fields) {
      // parseMetadata already pushed diagnostic(s) into errors.
      continue;
    }
    // Phase 1: per-record field validation. Pure; no cross-record resolution.
    // Capture per-record errors into recordErrors so the record can carry a
    // `valid` flag for Phase 2 to honour. The global errors list also gets a
    // copy so reviewers still see them in the consolidated output.
    const recordErrors = [];
    validateFields(path, fields, recordErrors);
    checkLifecycleAndSupersededBy(path, fields, recordErrors);
    checkProductionAuthorityAllowed(path, fields, recordErrors);
    const record = { path, fields, recordErrors };
    parsedRecords.push(record);
    if (recordErrors.length === 0) {
      validRecords.push(record);
    } else {
      for (const recordError of recordErrors) {
        errors.push(recordError);
      }
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
