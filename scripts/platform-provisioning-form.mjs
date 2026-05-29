#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildProvisioningFormPackage } from "../server/services/platform/provisioning-form.mjs";

const inputPath = process.argv[2];

try {
  if (!inputPath) {
    throw new Error("usage: platform-provisioning-form <operator-form-input.json>");
  }

  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const result = buildProvisioningFormPackage(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`platform provisioning form failed: ${error.message}\n`);
  process.exitCode = 1;
}
