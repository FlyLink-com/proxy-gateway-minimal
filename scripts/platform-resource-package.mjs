#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildPlatformResourcePackage } from "../server/services/platform/resource-package.mjs";

const inputPath = process.argv[2];

try {
  if (!inputPath) {
    throw new Error("usage: platform-resource-package <resource-package-input.json>");
  }

  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const resourcePackage = buildPlatformResourcePackage(input);
  process.stdout.write(`${JSON.stringify(resourcePackage, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`platform resource package failed: ${error.message}\n`);
  process.exitCode = 1;
}
