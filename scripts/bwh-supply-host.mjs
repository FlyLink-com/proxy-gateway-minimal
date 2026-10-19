#!/usr/bin/env node
import { readSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { createSubscriptionDistributionSystemdHost } from "./lib/subscription-distribution-systemd-adapter.mjs";

export async function runBwhSupplyHost({ argv = process.argv.slice(2), input, host = createSubscriptionDistributionSystemdHost(),
  write = value => process.stdout.write(`${JSON.stringify(value)}\n`), isSudo = () => !!process.env.SUDO_UID } = {}) {
  if (argv.length !== 1 || !["status", "pause", "enable", "initialize"].includes(argv[0])) return 64;
  try {
    const action = argv[0];
    if (action === "status") { write(host.status()); return 0; }
    if (action === "initialize") { if (isSudo()) return 64; write(host.initialize()); return 0; }
    let revision = input;
    if (revision === undefined) {
      const buffer = Buffer.alloc(66); let count = 0;
      while (count < buffer.length) { const bytes = readSync(0, buffer, count, buffer.length - count, null); if (!bytes) break; count += bytes; }
      revision = buffer.subarray(0, count).toString("utf8");
    }
    if (typeof revision !== "string" || revision.length > 65 || !/^[a-f0-9]{64}\n?$/.test(revision)) return 64;
    write(await host.change(action, revision.trim())); return 0;
  } catch { return 2; }
}
export function isBwhSupplyHostEntrypoint({ argv1 = process.argv[1], moduleUrl = import.meta.url, realpath = realpathSync } = {}) {
  try { return !!argv1 && pathToFileURL(realpath(argv1)).href === pathToFileURL(realpath(fileURLToPath(moduleUrl))).href; }
  catch { return false; }
}
if (isBwhSupplyHostEntrypoint()) process.exitCode = await runBwhSupplyHost();
