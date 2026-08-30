#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ProjectExportError,
  buildProjectExportErrorReport,
  exportProjectV2,
  normalizeProjectV2Contract
} from "../server/services/governance/project-v2-export.mjs";
import {
  canonicalizeProjectV2ContractBytes,
  verifyProjectV2ContractCanonicalBytes
} from "../server/services/governance/project-v2-contract.mjs";

const GITHUB_GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const DEFAULT_TIMEOUT_MS = 15_000;
const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONTRACT_PATH = resolve(ROOT_DIR, "project-state/project-v2-contract.json");

function exportError(code, options) {
  return new ProjectExportError(code, options);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mapHttpFailure(response) {
  if (response.status === 401) {
    return exportError("PROJECT_EXPORT_AUTHENTICATION_FAILED", { exitCode: 3 });
  }
  if (response.status === 403) {
    // GitHub secondary limits can return 403 without rate-limit headers. Keep
    // an ambiguous transport-level 403 retryable; precise permission failures
    // are classified from the sanitized GraphQL error code on successful HTTP.
    return exportError("PROJECT_EXPORT_RATE_LIMITED", { exitCode: 4, retryable: true });
  }
  if (response.status === 429) {
    return exportError("PROJECT_EXPORT_RATE_LIMITED", { exitCode: 4, retryable: true });
  }
  return exportError("PROJECT_EXPORT_API_UNAVAILABLE", {
    exitCode: 4,
    retryable: response.status >= 500
  });
}

function mapGraphqlFailure(errors) {
  const codes = errors.flatMap((error) => {
    if (!isPlainObject(error) || !isPlainObject(error.extensions)) return [];
    return [error.extensions.type, error.extensions.code]
      .filter((value) => typeof value === "string")
      .map((value) => value.toUpperCase());
  });
  if (codes.some((code) => code === "UNAUTHENTICATED" || code === "UNAUTHORIZED")) {
    return exportError("PROJECT_EXPORT_AUTHENTICATION_FAILED", { exitCode: 3 });
  }
  if (codes.some((code) => code === "FORBIDDEN" || code === "INSUFFICIENT_SCOPES")) {
    return exportError("PROJECT_EXPORT_AUTHORIZATION_FAILED", { exitCode: 3 });
  }
  if (codes.some((code) => code === "RATE_LIMITED" || code === "RATE_LIMITED_ERROR")) {
    return exportError("PROJECT_EXPORT_RATE_LIMITED", { exitCode: 4, retryable: true });
  }
  return exportError("PROJECT_EXPORT_GRAPHQL_ERROR", { exitCode: 5 });
}

export function createGithubGraphqlClient({
  token,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (typeof token !== "string" || token.length === 0 || token !== token.trim()) {
    throw exportError("PROJECT_EXPORT_TOKEN_MISSING", { exitCode: 3 });
  }
  if (typeof fetchImpl !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw exportError("PROJECT_EXPORT_ARGUMENT_INVALID", { exitCode: 2 });
  }

  let latestObservationClock = null;
  const githubGraphql = async function githubGraphql({ operationName, query, variables }) {
    if (
      typeof operationName !== "string"
      || typeof query !== "string"
      || !isPlainObject(variables)
    ) {
      throw exportError("PROJECT_EXPORT_ARGUMENT_INVALID", { exitCode: 2 });
    }

    let response;
    try {
      response = await fetchImpl(GITHUB_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "gccgw-project-export/1"
        },
        body: JSON.stringify({ operationName, query, variables }),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      throw exportError("PROJECT_EXPORT_API_UNAVAILABLE", { exitCode: 4, retryable: true });
    }

    if (!response?.ok) throw mapHttpFailure(response);

    let responseText;
    try {
      responseText = await response.text();
    } catch {
      throw exportError("PROJECT_EXPORT_API_UNAVAILABLE", { exitCode: 4, retryable: true });
    }
    let payload;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw exportError("PROJECT_EXPORT_RESPONSE_INVALID", { exitCode: 5 });
    }
    if (!isPlainObject(payload)) {
      throw exportError("PROJECT_EXPORT_RESPONSE_INVALID", { exitCode: 5 });
    }
    if (Object.hasOwn(payload, "errors")) {
      if (!Array.isArray(payload.errors)) {
        throw exportError("PROJECT_EXPORT_RESPONSE_INVALID", { exitCode: 5 });
      }
      if (payload.errors.length > 0) {
        throw mapGraphqlFailure(payload.errors);
      }
    }
    if (!isPlainObject(payload.data)) {
      throw exportError("PROJECT_EXPORT_RESPONSE_INVALID", { exitCode: 5 });
    }
    const dateHeader = response.headers?.get?.("date");
    const observedAt = typeof dateHeader === "string" ? new Date(dateHeader) : null;
    latestObservationClock = observedAt && !Number.isNaN(observedAt.getTime())
      ? Object.freeze({
          source: "github_http_date",
          trusted: true,
          observedAt: observedAt.toISOString()
        })
      : null;
    return payload.data;
  };
  Object.defineProperty(githubGraphql, "getObservationClock", {
    enumerable: false,
    value: () => latestObservationClock
  });
  return githubGraphql;
}

export function parsePinnedProjectV2ContractBytes(raw) {
  try {
    if (!verifyProjectV2ContractCanonicalBytes(raw)) {
      throw exportError("PROJECT_EXPORT_CONTRACT_INVALID", { exitCode: 5 });
    }
    const canonical = canonicalizeProjectV2ContractBytes(raw);
    return JSON.parse(canonical);
  } catch {
    throw exportError("PROJECT_EXPORT_CONTRACT_INVALID", { exitCode: 5 });
  }
}

async function readDefaultContract() {
  let raw;
  try {
    raw = await readFile(DEFAULT_CONTRACT_PATH);
  } catch {
    throw exportError("PROJECT_EXPORT_CONTRACT_INVALID", { exitCode: 5 });
  }
  return parsePinnedProjectV2ContractBytes(raw);
}

function serializeReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function runProjectExportCli(argv, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  writeStdout = (value) => process.stdout.write(value),
  readContract = readDefaultContract,
  graphql,
  now = () => new Date()
} = {}) {
  try {
    if (!Array.isArray(argv) || argv.length !== 1 || argv[0] !== "--json") {
      const code = Array.isArray(argv) && argv.length === 0
        ? "PROJECT_EXPORT_JSON_REQUIRED"
        : "PROJECT_EXPORT_ARGUMENT_INVALID";
      throw exportError(code, { exitCode: 2 });
    }
    if (typeof readContract !== "function" || typeof writeStdout !== "function") {
      throw exportError("PROJECT_EXPORT_ARGUMENT_INVALID", { exitCode: 2 });
    }

    const contract = normalizeProjectV2Contract(await readContract());
    const token = typeof env?.GH_TOKEN === "string" && env.GH_TOKEN.trim()
      ? env.GH_TOKEN.trim()
      : typeof env?.GITHUB_TOKEN === "string"
        ? env.GITHUB_TOKEN.trim()
        : "";
    if (!token) {
      throw exportError("PROJECT_EXPORT_TOKEN_MISSING", { exitCode: 3 });
    }

    const client = graphql ?? createGithubGraphqlClient({ token, fetchImpl });
    if (typeof client !== "function") {
      throw exportError("PROJECT_EXPORT_ARGUMENT_INVALID", { exitCode: 2 });
    }
    const report = await exportProjectV2({ graphql: client, contract, now });
    const serialized = serializeReport(report);
    if (token.length >= 8 && serialized.includes(token)) {
      throw exportError("PROJECT_EXPORT_REDACTION_FAILED", { exitCode: 6 });
    }
    writeStdout(serialized);
    return 0;
  } catch (error) {
    const safeError = error instanceof ProjectExportError
      ? error
      : exportError("PROJECT_EXPORT_RESPONSE_INVALID", { exitCode: 5 });
    writeStdout(serializeReport(buildProjectExportErrorReport(safeError)));
    return safeError.exitCode;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await runProjectExportCli(process.argv.slice(2));
}
