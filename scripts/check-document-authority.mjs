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
  const markerCandidate = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim() !== "")
    .slice(0, 40)
    .find(({ line }) => line.trim() === "document_metadata:");
  if (!markerCandidate) {
    return { fields: null, foundMarker: false };
  }
  const markerIndex = markerCandidate.index;

  let fenceStart = markerIndex - 1;
  while (fenceStart >= 0 && lines[fenceStart].trim() === "") {
    fenceStart -= 1;
  }
  if (fenceStart < 0 || lines[fenceStart].trim() !== "```yaml") {
    errors.push(`${path}:${markerIndex + 1}: document_metadata must be in a top-level yaml fence`);
    return { fields: null, foundMarker: true };
  }

  const fenceEnd = lines.findIndex(
    (line, index) => index > markerIndex && line.trim() === "```"
  );
  if (fenceEnd < 0) {
    errors.push(`${path}:${markerIndex + 1}: document_metadata yaml fence is not closed`);
    return { fields: null, foundMarker: true };
  }

  const fields = {};
  for (let index = markerIndex + 1; index < fenceEnd; index += 1) {
    const line = lines[index];
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }
    const match = line.match(/^\s{2}([a-z_]+):\s*(.*?)\s*$/);
    if (!match) {
      errors.push(`${path}:${index + 1}: unsupported document_metadata syntax`);
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

function checkSupersededBy(rootDir, path, fields, errors) {
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
  if (isAbsolute(value) || value.includes("\\")) {
    errors.push(`${path}: superseded_by must be a repository-relative path`);
    return;
  }
  const fullPath = resolve(rootDir, value);
  const relativePath = relative(rootDir, fullPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    errors.push(`${path}: superseded_by must stay inside the repository`);
    return;
  }
  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
    errors.push(
      `${path}: superseded_by path must resolve to an existing file: ${value}`
    );
  }
}

function validateMetadata(rootDir, path, fields, errors) {
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
  checkSupersededBy(rootDir, path, fields, errors);
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
  if (!existsSync(rootDir) || !statSync(rootDir).isDirectory()) {
    throw new Error(`root directory does not exist: ${rootDir}`);
  }
  const strictFiles = Boolean(options.strictFiles);
  const errors = [];
  const records = [];
  const ungovernedFiles = [];

  for (const path of listMarkdownFiles(rootDir)) {
    const { fields, foundMarker } = parseMetadata(
      readFileSync(join(rootDir, path), "utf8"),
      path,
      errors
    );
    if (!foundMarker) {
      ungovernedFiles.push(path);
      continue;
    }
    if (!fields) {
      continue;
    }
    validateMetadata(rootDir, path, fields, errors);
    records.push({ path, fields });
  }

  if (strictFiles) {
    for (const path of ungovernedFiles) {
      errors.push(`file lacks document_metadata: ${path}`);
    }
  }
  if (records.length === 0) {
    errors.push("no document_metadata blocks found");
  }
  checkDuplicateCanonicalScopes(records, errors);

  const ok = errors.length === 0;
  return {
    ok,
    errors,
    documents: records.map((record) => ({
      path: record.path,
      docType: record.fields.doc_type,
      lifecycle: record.fields.lifecycle,
      authorityScope: record.fields.authority_scope
    })),
    ungovernedFiles,
    summary: ok
      ? `validated ${records.length} document metadata block(s) from ${relative(process.cwd(), rootDir) || "."}`
      : `document authority check failed with ${errors.length} error(s)`
  };
}

function cliRoot(args) {
  const rootIndex = args.indexOf("--root");
  if (rootIndex < 0) {
    return DEFAULT_ROOT;
  }
  const rootValue = args[rootIndex + 1];
  if (!rootValue || rootValue.startsWith("--")) {
    throw new Error("--root requires a directory");
  }
  return resolve(rootValue);
}

function cliStrictFiles(args) {
  return args.includes("--strict-files");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const argv = process.argv.slice(2);
    const result = checkDocumentAuthority({
      rootDir: cliRoot(argv),
      strictFiles: cliStrictFiles(argv)
    });
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
