#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createBwhSupplyVerifier } from "./lib/bwh-supply-verification.mjs";

export async function runBwhSupplyVerify({ argv = process.argv.slice(2), input,
  verify = createBwhSupplyVerifier(), write = value => process.stdout.write(`${JSON.stringify(value)}\n`),
  isRoot = () => process.platform === "linux" && process.geteuid?.() === 0 } = {}) {
  if (!Array.isArray(argv) || argv.length !== 1 || !["inspect", "resume"].includes(argv[0]) || !isRoot()) return 64;
  try {
    const body = input ?? readFileSync(0, "utf8");
    if (body !== "") return 64;
    // The reused identity reader opens immutable file: URIs. SQLite must see
    // this process setting before its first native connection is constructed.
    process.env.SQLITE_USE_URI = "1";
    write(await verify(argv[0])); return 0;
  } catch { return 2; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await runBwhSupplyVerify();
