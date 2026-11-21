#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";
import {
  BWH_BANDWIDTH_WIRE_MAX_REQUEST_BYTES, encodeBwhBandwidthWireResponse, parseBwhBandwidthWireRequest
} from "./lib/bwh-bandwidth-wire.mjs";

// One shot, one bandwidth frame. This is the supply worker's socket boundary
// with a separate wire. It cannot run tc, change a service, or mark a policy applied.
function readFrame(input, setTimer, clearTimer) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let done = false;
    let timer;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimer(timer);
      input.removeListener("data", data);
      input.removeListener("end", end);
      input.removeListener("error", failed);
      input.pause();
      if (error) reject(new Error("BWH bandwidth request unavailable"));
      else {
        try {
          resolve(parseBwhBandwidthWireRequest(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks))));
        } catch { reject(new Error("BWH bandwidth request unavailable")); }
      }
    };
    const data = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > BWH_BANDWIDTH_WIRE_MAX_REQUEST_BYTES) finish(true);
      else chunks.push(buffer);
    };
    const end = () => finish(false);
    const failed = () => finish(true);
    timer = setTimer(() => finish(true), 5000);
    input.on("data", data);
    input.once("end", end);
    input.once("error", failed);
    input.resume();
  });
}

function writeReply(output, reply) {
  return new Promise((resolve) => {
    if (!output || output.destroyed || output.writable === false) { resolve(); return; }
    try { output.write(reply, () => resolve()); } catch { resolve(); }
  });
}

export async function runBwhBandwidthWorker({
  argv = [], input, output, isRoot = () => process.geteuid?.() === 0,
  setTimer = setTimeout, clearTimer = clearTimeout
} = {}) {
  if (input) { input.on?.("error", () => {}); }
  if (output) { output.on?.("error", () => {}); }
  const failure = encodeBwhBandwidthWireResponse({ version: 1, ok: false });
  if (!isRoot()) { await writeReply(output, failure); return 77; }
  if (argv.length !== 0) { await writeReply(output, failure); return 64; }
  try { await readFrame(input, setTimer, clearTimer); }
  catch { await writeReply(output, failure); return 64; }
  await writeReply(output, failure);
  return 2;
}

export function isBwhBandwidthWorkerEntrypoint({ argv1 = process.argv[1], moduleUrl = import.meta.url, realpath = realpathSync } = {}) {
  try { return !!argv1 && pathToFileURL(realpath(argv1)).href === pathToFileURL(realpath(fileURLToPath(moduleUrl))).href; }
  catch { return false; }
}

if (isBwhBandwidthWorkerEntrypoint()) process.exitCode = await runBwhBandwidthWorker({ argv: process.argv.slice(2) });
