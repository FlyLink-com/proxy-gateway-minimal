#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateGateLedger,
  validateGateLedgerTransition,
  validateRepairPolicy,
  validateRepairPolicyTransition
} from "../server/services/governance/gate-governance.mjs";

const REPOSITORY_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function readJson(path, label, errors) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`${label}: invalid or unreadable JSON (${error.message})`);
    return null;
  }
}

function parseMode(args) {
  if (args.length === 1 && args[0] === "--snapshot") return { type: "snapshot" };
  if (args.length === 1 && args[0] === "--base-state-missing") return { type: "base-missing" };
  if (args.length === 0 || args.length % 2 !== 0) throw new Error("gate_governance_arguments_invalid");
  const allowed = new Set([
    "--base-gates-file",
    "--base-policy-file",
    "--head-gates-file",
    "--head-policy-file"
  ]);
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!allowed.has(key) || values.has(key) || typeof value !== "string" || value.trim() === "") {
      throw new Error("gate_governance_arguments_invalid");
    }
    values.set(key, resolve(value));
  }
  const keys = [...values.keys()].sort().join(",");
  const baseKeys = ["--base-gates-file", "--base-policy-file"].sort().join(",");
  const trustedKeys = [
    "--base-gates-file",
    "--base-policy-file",
    "--head-gates-file",
    "--head-policy-file"
  ].sort().join(",");
  if (keys === baseKeys || keys === trustedKeys) {
    return {
      type: "base-file",
      baseGatesPath: values.get("--base-gates-file"),
      basePolicyPath: values.get("--base-policy-file"),
      headGatesPath: values.get("--head-gates-file") ?? resolve(REPOSITORY_ROOT, "project-state/gates.json"),
      headPolicyPath: values.get("--head-policy-file") ?? resolve(REPOSITORY_ROOT, "project-state/repair-policy.json")
    };
  }
  throw new Error("gate_governance_arguments_invalid");
}

function main() {
  let mode;
  try {
    mode = parseMode(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const errors = [];
  const headPolicyPath = mode.headPolicyPath ?? resolve(REPOSITORY_ROOT, "project-state/repair-policy.json");
  const headGatesPath = mode.headGatesPath ?? resolve(REPOSITORY_ROOT, "project-state/gates.json");
  const policy = readJson(
    headPolicyPath,
    "repair policy",
    errors
  );
  const ledger = readJson(
    headGatesPath,
    "gate ledger",
    errors
  );
  if (policy !== null) {
    const result = validateRepairPolicy(policy);
    errors.push(...result.errors.map((error) => `repair policy: ${error}`));
  }
  if (ledger !== null && policy !== null) {
    if (ledger.repairPolicyVersion !== policy.schemaVersion) {
      errors.push("gate ledger: repairPolicyVersion must match repair policy schemaVersion");
    }
    const result = validateGateLedger(ledger, { policy });
    errors.push(...result.errors);
  }

  if (errors.length === 0 && mode.type !== "snapshot") {
    let baseLedger = null;
    let basePolicy = null;
    if (mode.type === "base-file") {
      baseLedger = readJson(mode.baseGatesPath, "base gate ledger", errors);
      basePolicy = readJson(mode.basePolicyPath, "base repair policy", errors);
    }
    if (errors.length === 0) {
      const policyTransition = validateRepairPolicyTransition(basePolicy, policy);
      errors.push(...policyTransition.errors);
      const ledgerTransition = validateGateLedgerTransition(baseLedger, ledger, {
        basePolicy: basePolicy ?? policy,
        headPolicy: policy
      });
      errors.push(...ledgerTransition.errors);
    }
  }

  if (errors.length > 0) {
    process.stderr.write(`Gate governance validation failed (${errors.length} error(s))\n`);
    for (const error of errors) process.stderr.write(`- ${error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Gate governance validation passed (${ledger.gates.length} gate(s))\n`);
}

main();
