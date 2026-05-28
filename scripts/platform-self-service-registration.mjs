#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildPlatformSelfServiceRegistrationPackage } from "../server/services/platform/self-service-registration-flow.mjs";

const inputPath = process.argv[2];

try {
  if (!inputPath) {
    throw new Error("usage: platform-self-service-registration <self-service-registration-input.json>");
  }

  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const packageSummary = buildPlatformSelfServiceRegistrationPackage(input);
  process.stdout.write(`${JSON.stringify(packageSummary, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`platform self-service registration failed: ${error.message}\n`);
  process.exitCode = 1;
}
