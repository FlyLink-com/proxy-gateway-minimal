import fs from "node:fs";
import { posix, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyAuthorityOperatorRequest,
  digestAuthorityOperatorRequest,
  normalizeAuthorityOperatorRequest,
  planAuthorityOperatorRequest
} from "../server/services/platform/account-resource-authority-operator.mjs";

const DEFAULT_OPERATIONS = Object.freeze({
  applyAuthorityOperatorRequest,
  digestAuthorityOperatorRequest,
  normalizeAuthorityOperatorRequest,
  planAuthorityOperatorRequest
});
const FLAGS = new Set([
  "--mode",
  "--db-path",
  "--request-file",
  "--confirm-request-digest"
]);
const MODES = new Set(["plan", "assign", "reassign"]);
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RESULT_KEYS = Object.freeze([
  "operation",
  "requestDigest",
  "classification",
  "receiptState",
  "databaseChanged",
  "automaticRetry"
]);
const MAX_REQUEST_BYTES = 16 * 1024;
const WINDOWS_RESERVED_BASENAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "CLOCK$",
  "CONIN$",
  "CONOUT$"
]);
const WINDOWS_SUPERSCRIPT_DIGITS = Object.freeze({
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9"
});
const WINDOWS_UNC_SHARE_PCHAR_PATTERN =
  /^[\x20-\x21\x23-\x29\x2d-\x2e\x30-\x39\x40-\x5a\x5e-\x7b\x7d-\xff]{1,80}$/u;

class ContractError extends Error {
  constructor(reasonCode, mode = null) {
    super("Assignment CLI contract rejected");
    this.reasonCode = reasonCode;
    this.mode = mode;
  }
}

function closedOutput({
  mode = null,
  operation = null,
  requestDigest = null,
  classification = null,
  receiptState,
  databaseChanged,
  reasonCode = null
}) {
  return {
    schemaVersion: "1",
    type: "account_resource_authority_assignment_operator",
    mode,
    operation,
    requestDigest,
    classification,
    receiptState,
    databaseChanged,
    automaticRetry: false,
    reasonCode
  };
}

function rejected(reasonCode, mode = null, operation = null, requestDigest = null) {
  return {
    exitCode: 2,
    output: closedOutput({
      mode,
      operation,
      requestDigest,
      receiptState: "contract_rejected",
      databaseChanged: false,
      reasonCode
    })
  };
}

function resultRejected(mode, operation = null, requestDigest = null) {
  return {
    exitCode: 4,
    output: closedOutput({
      mode,
      operation,
      requestDigest,
      classification: "unknown",
      receiptState: "result_rejected",
      databaseChanged: mode === "plan" ? false : null,
      reasonCode: "service_result_invalid"
    })
  };
}

function windowsComponentHasReservedBasename(value) {
  const basename = value.split(".", 1)[0]
    .toUpperCase()
    .replace(
      /[⁰¹²³⁴⁵⁶⁷⁸⁹]/gu,
      (digit) => WINDOWS_SUPERSCRIPT_DIGITS[digit]
    );
  return (
    WINDOWS_RESERVED_BASENAMES.has(basename)
    || /^(?:COM|LPT)[1-9]$/.test(basename)
  );
}

function windowsComponentIsOrdinary(value) {
  if (
    value.length === 0
    || value === "."
    || value === ".."
    || /[. ]$/.test(value)
    || /[<>:"|?*\u0000-\u001f\u007f-\u009f]/.test(value)
  ) {
    return false;
  }
  return !windowsComponentHasReservedBasename(value);
}

function windowsShareIsExact(value) {
  if (
    !WINDOWS_UNC_SHARE_PCHAR_PATTERN.test(value)
    || value === "."
    || value === ".."
    || /[. ]$/.test(value)
    || /[\u007f-\u009f]/.test(value)
    || windowsComponentHasReservedBasename(value)
  ) {
    return false;
  }
  const uppercase = value.toUpperCase();
  return uppercase !== "PIPE" && uppercase !== "IPC$";
}

function windowsPathIsFullyQualified(value) {
  if (/^[A-Za-z]:[\\/]/.test(value)) return win32.isAbsolute(value);
  if (!(value.startsWith("\\\\") || value.startsWith("//"))) return false;
  const components = value.slice(2).split(/[\\/]/);
  return components.length >= 3
    && windowsComponentIsOrdinary(components[0])
    && windowsShareIsExact(components[1])
    && components.slice(2).every(windowsComponentIsOrdinary);
}

function fullyQualifiedPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    return false;
  }
  if (process.platform !== "win32") return posix.isAbsolute(value);
  if (/^[A-Za-z]:[\\/]/.test(value)) {
    return win32.isAbsolute(value)
      && value.slice(3).split(/[\\/]/).every(windowsComponentIsOrdinary);
  }
  return windowsPathIsFullyQualified(value);
}

function parseArguments(argv) {
  if (!Array.isArray(argv)) throw new ContractError("invalid_arguments");
  const values = Object.create(null);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      typeof flag !== "string"
      || !FLAGS.has(flag)
      || Object.hasOwn(values, flag)
      || typeof value !== "string"
      || value.length === 0
    ) {
      throw new ContractError("invalid_arguments");
    }
    values[flag] = value;
  }
  const rawMode = values["--mode"];
  const mode = MODES.has(rawMode) ? rawMode : null;
  if (!mode) throw new ContractError("invalid_mode");
  if (!fullyQualifiedPath(values["--db-path"])) {
    throw new ContractError("database_path_invalid", mode);
  }
  if (!fullyQualifiedPath(values["--request-file"])) {
    throw new ContractError("request_file_invalid", mode);
  }
  const confirmation = values["--confirm-request-digest"];
  if (mode === "plan") {
    if (confirmation !== undefined) {
      throw new ContractError("confirmation_not_allowed", mode);
    }
  } else if (confirmation === undefined) {
    throw new ContractError("confirmation_required", mode);
  } else if (!DIGEST_PATTERN.test(confirmation)) {
    throw new ContractError("confirmation_invalid", mode);
  }
  return Object.freeze({
    mode,
    dbPath: values["--db-path"],
    requestFile: values["--request-file"],
    confirmation: confirmation ?? null
  });
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function loadPrivateJson(requestFile, fileSystem) {
  let descriptor = null;
  let closeFailed = false;
  try {
    const before = fileSystem.lstatSync(requestFile);
    if (
      before.isSymbolicLink()
      || !before.isFile()
      || before.size < 1
      || before.size > MAX_REQUEST_BYTES
    ) {
      throw new Error("unsafe file");
    }
    if (process.platform !== "win32") {
      const effectiveUid = typeof process.geteuid === "function"
        ? process.geteuid()
        : null;
      if ((before.mode & 0o7777) !== 0o600 || effectiveUid === null || before.uid !== effectiveUid) {
        throw new Error("unsafe permissions");
      }
    }

    let flags = fileSystem.constants.O_RDONLY;
    if (typeof fileSystem.constants.O_NOFOLLOW === "number") {
      flags |= fileSystem.constants.O_NOFOLLOW;
    }
    descriptor = fileSystem.openSync(requestFile, flags);
    const opened = fileSystem.fstatSync(descriptor);
    if (
      !opened.isFile()
      || !sameFile(before, opened)
      || opened.size !== before.size
      || (
        process.platform !== "win32"
        && (
          (opened.mode & 0o7777) !== 0o600
          || typeof process.geteuid !== "function"
          || opened.uid !== process.geteuid()
        )
      )
    ) {
      throw new Error("changed file");
    }

    const buffer = Buffer.alloc(opened.size);
    const bytesRead = fileSystem.readSync(
      descriptor,
      buffer,
      0,
      buffer.length,
      0
    );
    const after = fileSystem.fstatSync(descriptor);
    if (
      bytesRead !== buffer.length
      || !sameFile(opened, after)
      || after.size !== opened.size
      || (
        process.platform !== "win32"
        && (
          (after.mode & 0o7777) !== 0o600
          || typeof process.geteuid !== "function"
          || after.uid !== process.geteuid()
        )
      )
    ) {
      throw new Error("changed read");
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return JSON.parse(text);
  } catch {
    throw new ContractError("request_file_rejected");
  } finally {
    if (descriptor !== null) {
      try {
        fileSystem.closeSync(descriptor);
      } catch {
        closeFailed = true;
      }
    }
    if (closeFailed) throw new ContractError("request_file_rejected");
  }
}

function exactResultValues(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  try {
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== RESULT_KEYS.length
      || ownKeys.some((key) => typeof key !== "string")
      || RESULT_KEYS.some((key) => !ownKeys.includes(key))
    ) {
      return null;
    }
    const result = Object.create(null);
    for (const key of RESULT_KEYS) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        return null;
      }
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function coherentTuple(mode, result) {
  if (result.automaticRetry !== false) return false;
  if (mode === "plan") {
    if (result.databaseChanged !== false) return false;
    return (
      result.classification === "not_applied"
      && result.receiptState === "not_applicable"
    ) || (
      result.classification === "applied_exact"
      && result.receiptState === "recovered_after_unknown"
    ) || (
      result.classification === "drift"
      && result.receiptState === "not_applicable"
    ) || (
      result.classification === "unknown"
      && result.receiptState === "unknown"
    );
  }
  return (
    result.classification === "applied_exact"
    && result.receiptState === "applied"
    && result.databaseChanged === true
  ) || (
    result.classification === "applied_exact"
    && result.receiptState === "apply_refused_already_applied"
    && result.databaseChanged === false
  ) || (
    result.classification === "drift"
    && result.receiptState === "apply_refused_drift"
    && result.databaseChanged === false
  ) || (
    result.classification === "unknown"
    && result.receiptState === "unknown"
    && result.databaseChanged === null
  );
}

function projectResult(mode, operation, requestDigest, value) {
  const result = exactResultValues(value);
  if (
    !result
    || result.operation !== operation
    || typeof result.requestDigest !== "string"
    || result.requestDigest !== requestDigest
    || !DIGEST_PATTERN.test(result.requestDigest)
    || !coherentTuple(mode, result)
  ) {
    return resultRejected(mode, operation, requestDigest);
  }
  const exitCode = result.classification === "unknown"
    ? 4
    : result.classification === "drift"
      || result.receiptState === "apply_refused_already_applied"
      ? 3
      : 0;
  return {
    exitCode,
    output: closedOutput({
      mode,
      operation,
      requestDigest,
      classification: result.classification,
      receiptState: result.receiptState,
      databaseChanged: result.databaseChanged
    })
  };
}

export async function runAccountResourceAuthorityAssignmentCli({
  argv,
  operations = DEFAULT_OPERATIONS
} = {}) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    return rejected(
      error instanceof ContractError ? error.reasonCode : "invalid_arguments",
      error instanceof ContractError ? error.mode : null
    );
  }

  let request;
  let normalized;
  let operation;
  let requestDigest;
  try {
    request = loadPrivateJson(options.requestFile, operations.fileSystem ?? fs);
    normalized = operations.normalizeAuthorityOperatorRequest(request);
    request = null;
    const operationDescriptor = normalized !== null
      && typeof normalized === "object"
      && !Array.isArray(normalized)
      ? Reflect.getOwnPropertyDescriptor(normalized, "operation")
      : null;
    if (
      !operationDescriptor
      || !operationDescriptor.enumerable
      || !("value" in operationDescriptor)
      || !["assign", "reassign"].includes(operationDescriptor.value)
    ) {
      throw new Error("invalid normalized operation");
    }
    operation = operationDescriptor.value;
    requestDigest = operations.digestAuthorityOperatorRequest(normalized);
    if (
      typeof requestDigest !== "string"
      || !DIGEST_PATTERN.test(requestDigest)
    ) {
      throw new Error("invalid digest");
    }
  } catch (error) {
    return rejected(
      error instanceof ContractError ? error.reasonCode : "request_invalid",
      options.mode
    );
  }

  if (options.mode !== "plan" && operation !== options.mode) {
    return rejected("mode_operation_mismatch", options.mode, operation, requestDigest);
  }
  if (options.mode !== "plan" && options.confirmation !== requestDigest) {
    return rejected("confirmation_mismatch", options.mode, operation, requestDigest);
  }

  let serviceResult;
  try {
    serviceResult = options.mode === "plan"
      ? await operations.planAuthorityOperatorRequest({
          dbPath: options.dbPath,
          request: normalized
        })
      : await operations.applyAuthorityOperatorRequest({
          dbPath: options.dbPath,
          request: normalized
        });
  } catch {
    return resultRejected(options.mode, operation, requestDigest);
  }
  return projectResult(options.mode, operation, requestDigest, serviceResult);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  const outcome = await runAccountResourceAuthorityAssignmentCli({
    argv: process.argv.slice(2)
  });
  process.stdout.write(`${JSON.stringify(outcome.output)}\n`);
  process.exitCode = outcome.exitCode;
}
