#!/usr/bin/env node
// Internal host-to-host reader only. stdout is a private SSH response consumed
// in control-host memory, NEVER a user-facing status or an execution receipt.
import { assertNoDuplicateObjectKeys } from "../server/services/deployment/strict-json-scan.mjs";
import { readFullMeteringLocalSource } from "./lib/full-metering-local-source.mjs";
try {
  if (process.platform !== "linux" || process.argv.slice(2).join(" ") !== "--read-stdin") throw new Error("invalid");
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > 4 * 1024 * 1024) throw new Error("bound"); chunks.push(chunk); }
  const text = Buffer.concat(chunks).toString("utf8");
  assertNoDuplicateObjectKeys(text);
  const request = JSON.parse(text);
  if (Object.keys(request).sort().join(",") !== "configPath,credentialRefByRuntimeUser,kind,runtimeUnit") throw new Error("invalid");
  process.stdout.write(JSON.stringify({ ok: true, privateSnapshot: await readFullMeteringLocalSource(request) }));
} catch {
  process.stdout.write(JSON.stringify({ ok: false, errorCode: "full_metering_local_source_failed" }));
  process.exitCode = 2;
}
