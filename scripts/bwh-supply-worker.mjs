#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";
import { createSubscriptionDistributionSystemdHost } from "./lib/subscription-distribution-systemd-adapter.mjs";
import { parseBwhSupplyWireRequest, encodeBwhSupplyWireResponse,
  BWH_SUPPLY_WIRE_MAX_REQUEST_BYTES } from "./lib/bwh-supply-wire.mjs";

// One socket-activated process handles one frame. The root adapter's durable
// intent, lock, per-step readbacks and rollback boundaries remain authoritative.
// In particular a peer disappearing after dispatch is NOT an abort signal.
function readRequest(input, setTimer, clearTimer) {
  return new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0, done = false, timer;
    const finish = error => {
      if (done) return; done = true; clearTimer(timer);
      input.removeListener("data", data); input.removeListener("end", end); input.removeListener("error", failed);
      input.pause();
      if (error) reject(new Error("BWH supply request unavailable"));
      else {
        try { resolve(parseBwhSupplyWireRequest(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)))); }
        catch { reject(new Error("BWH supply request unavailable")); }
      }
    };
    const data = chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length; if (bytes > BWH_SUPPLY_WIRE_MAX_REQUEST_BYTES) finish(true); else chunks.push(buffer);
    };
    const end = () => finish(false), failed = () => finish(true);
    timer = setTimer(() => finish(true), 5000);
    input.on("data", data); input.once("end", end); input.once("error", failed); input.resume();
  });
}

function writeReply(output, reply) {
  return new Promise(resolve => {
    // The operation has already completed (or rejected). Never let EPIPE or a
    // disconnected peer change its durable result or trigger a second attempt.
    if (output.destroyed || !output.writable) { resolve(); return; }
    try { output.write(reply, () => resolve()); } catch { resolve(); }
  });
}

export async function runBwhSupplyWorker({ argv = [], input = process.stdin, output = process.stdout,
  host = createSubscriptionDistributionSystemdHost(), isRoot = () => process.geteuid?.() === 0,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  // Keep error listeners for the lifetime of this one-shot worker, including
  // after EOF and during root IO. Socket errors never become uncaught throws.
  input.on("error", () => {}); output.on("error", () => {});
  const failure = encodeBwhSupplyWireResponse({ version: 1, ok: false });
  if (!isRoot()) { await writeReply(output, failure); return 77; }
  if (argv.length !== 0) { await writeReply(output, failure); return 64; }
  let request;
  try { request = await readRequest(input, setTimer, clearTimer); }
  catch { await writeReply(output, failure); return 64; }
  let reply;
  try {
    const status = request.action === "status" ? host.status() : await host.change(request.action, request.revision);
    reply = encodeBwhSupplyWireResponse({ version: 1, ok: true, status });
  } catch { await writeReply(output, failure); return 2; }
  await writeReply(output, reply); return 0;
}

export function isBwhSupplyWorkerEntrypoint({ argv1 = process.argv[1], moduleUrl = import.meta.url, realpath = realpathSync } = {}) {
  try { return !!argv1 && pathToFileURL(realpath(argv1)).href === pathToFileURL(realpath(fileURLToPath(moduleUrl))).href; }
  catch { return false; }
}
if (isBwhSupplyWorkerEntrypoint()) process.exitCode = await runBwhSupplyWorker({ argv: process.argv.slice(2) });
