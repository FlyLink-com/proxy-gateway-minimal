#!/usr/bin/env node

import {
  buildLeadRetentionCommandResult,
  runLeadBackup,
  runLeadPrune,
  runLeadPurge,
  serializeLeadRetentionCommandResult
} from "../server/services/platform/lead-retention-operations.mjs";
import { isAbsolute } from "node:path";

const COMMANDS = new Set(["purge", "backup", "prune"]);

function parseArguments(args, env) {
  const command = args[0];
  if (!COMMANDS.has(command)) return null;
  let apply = false;
  let backupDir = null;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply" && !apply) {
      apply = true;
      continue;
    }
    if (argument === "--backup-dir" && backupDir === null) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return null;
      backupDir = value;
      index += 1;
      continue;
    }
    return null;
  }
  if (command === "purge" && backupDir !== null) return null;
  if ((command === "backup" || command === "prune")
    && (backupDir === null || !isAbsolute(backupDir))) return null;
  const dbPath = String(env.SUBSCRIPTION_CONTROL_DB_PATH || "").trim();
  if ((command === "purge" || command === "backup") && !dbPath) return null;
  return { apply, backupDir, command, dbPath };
}

function contractErrorResult(args) {
  const command = COMMANDS.has(args[0]) ? args[0] : "purge";
  return buildLeadRetentionCommandResult({
    command,
    mode: args.includes("--apply") ? "apply" : "dry-run",
    status: "blocked",
    mutationState: "none",
    counts: {},
    reasonCodes: ["invalid_command_contract"]
  });
}

function internalErrorResult(command, apply) {
  return buildLeadRetentionCommandResult({
    command: COMMANDS.has(command) ? command : "purge",
    mode: apply ? "apply" : "dry-run",
    status: "internal_error",
    mutationState: "none",
    counts: {},
    reasonCodes: ["internal_error"]
  });
}

function exitCodeFor(result, contractError = false) {
  if (contractError) return 64;
  if (result.status === "planned" || result.status === "completed") return 0;
  if (result.status === "blocked") return 20;
  if (result.status === "reconciliation_required") return 30;
  return 70;
}

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArguments(args, process.env);
  if (!parsed) {
    const result = contractErrorResult(args);
    process.stdout.write(serializeLeadRetentionCommandResult(result));
    process.exitCode = exitCodeFor(result, true);
    return;
  }

  let result;
  try {
    if (parsed.command === "purge") {
      result = runLeadPurge({ dbPath: parsed.dbPath, apply: parsed.apply });
    } else if (parsed.command === "backup") {
      result = await runLeadBackup({
        dbPath: parsed.dbPath,
        backupDir: parsed.backupDir,
        apply: parsed.apply
      });
    } else {
      result = runLeadPrune({
        backupDir: parsed.backupDir,
        apply: parsed.apply
      });
    }
  } catch {
    result = internalErrorResult(parsed.command, parsed.apply);
  }
  process.stdout.write(serializeLeadRetentionCommandResult(result));
  process.exitCode = exitCodeFor(result);
}

await main();
