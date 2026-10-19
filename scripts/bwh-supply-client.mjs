#!/usr/bin/env node
import { lstatSync, realpathSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseBwhSupplyHostStatus } from "../server/services/platform/bwh-supply-status.mjs";
import { BWH_SUPPLY_SOCKET_PATH, BWH_SUPPLY_WIRE_MAX_RESPONSE_BYTES,
  encodeBwhSupplyWireRequest, parseBwhSupplyWireResponse } from "./lib/bwh-supply-wire.mjs";

const failure = () => Object.assign(new Error("BWH supply host unavailable"), { code: "bwh_supply_host_unavailable" });

function trustedSocket({ lstat, getegid }) {
  const gid = getegid();
  if (!Number.isSafeInteger(gid) || gid < 0) throw failure();
  let path = BWH_SUPPLY_SOCKET_PATH, socket;
  while (true) {
    const info = lstat(path);
    if (info.uid !== 0 || info.isSymbolicLink()) throw failure();
    if (path === BWH_SUPPLY_SOCKET_PATH) {
      if (!info.isSocket() || (info.mode & 0o7777) !== 0o660 || info.gid !== gid) throw failure();
      socket = { dev: info.dev, ino: info.ino };
    } else if (!info.isDirectory() || (info.mode & 0o022) !== 0) throw failure();
    if (path === "/") break;
    path = dirname(path);
  }
  return socket;
}
const sameSocket = (before, after) => before.dev === after.dev && before.ino === after.ino;

/** No privilege change, configurable destination or alternate transport. */
export async function requestBwhSupplyStatus(input, { connect = createConnection, lstat = lstatSync,
  getegid = () => process.getegid?.(), nowFn = () => new Date(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let request, before;
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw failure();
    request = encodeBwhSupplyWireRequest({ version: 1, ...input });
    // Do not permit caller-supplied protocol version or extra fields.
    if (Object.hasOwn(input, "version")) throw failure();
    before = trustedSocket({ lstat, getegid });
  } catch { throw failure(); }
  return new Promise((resolve, reject) => {
    let socket, timer, settled = false, connected = false, length = 0;
    const chunks = [];
    const finish = (error, status) => {
      if (settled) return;
      settled = true; clearTimer(timer); socket?.destroy();
      if (error) reject(failure()); else resolve(status);
    };
    try {
      timer = setTimer(() => finish(true), input.action === "status" ? 5000 : 120_000);
      socket = connect({ path: BWH_SUPPLY_SOCKET_PATH, allowHalfOpen: true });
      socket.on("error", () => finish(true));
      socket.on("close", () => { if (!settled) finish(true); });
      socket.on("connect", () => {
        if (settled || connected) return;
        connected = true;
        try {
          if (!sameSocket(before, trustedSocket({ lstat, getegid }))) throw failure();
          // Request EOF is part of the protocol; allowHalfOpen keeps the reply
          // readable after this writable half is closed.
          socket.end(request);
        } catch { finish(true); }
      });
      socket.on("data", chunk => {
        if (settled) return;
        const bytes = Buffer.from(chunk); length += bytes.length;
        if (!connected || length > BWH_SUPPLY_WIRE_MAX_RESPONSE_BYTES) { finish(true); return; }
        chunks.push(bytes);
      });
      socket.on("end", () => {
        if (settled) return;
        try {
          if (!connected || !sameSocket(before, trustedSocket({ lstat, getegid }))) throw failure();
          // Preserve a BOM instead of silently stripping it: it is not part of
          // the exact JSON-line wire protocol.
          const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks, length));
          const response = parseBwhSupplyWireResponse(text);
          if (!response.ok) throw failure();
          finish(false, parseBwhSupplyHostStatus(JSON.stringify(response.status), { now: nowFn().getTime() }));
        } catch { finish(true); }
      });
    } catch { finish(true); }
  });
}

function readInput(stream, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  return new Promise((resolve, reject) => {
    let count = 0, settled = false; const chunks = [];
    const done = error => {
      if (settled) return;
      settled = true; clearTimer(timer);
      stream.removeListener("data", onData); stream.removeListener("end", onEnd); stream.removeListener("error", onError);
      if (error) { stream.pause(); reject(failure()); }
      else resolve(Buffer.concat(chunks, count).toString("utf8"));
    };
    const onData = chunk => { const value = Buffer.from(chunk); count += value.length; if (count > 65) done(true); else chunks.push(value); };
    const onEnd = () => done(false), onError = () => done(true);
    const timer = setTimer(() => done(true), 5000);
    stream.on("data", onData); stream.on("end", onEnd); stream.on("error", onError);
    stream.resume();
  });
}

export async function runBwhSupplyClient({ argv = process.argv.slice(2), input, inputStream = process.stdin,
  requestOptions, write = value => process.stdout.write(`${JSON.stringify(value)}\n`) } = {}) {
  if (argv.length !== 1 || !["status", "pause", "enable"].includes(argv[0])) return 64;
  let value;
  try { value = input === undefined ? await readInput(inputStream) : input; } catch { return 64; }
  if (typeof value !== "string" || Buffer.byteLength(value) > 65) return 64;
  const action = argv[0];
  if (action === "status" ? value !== "" : !/^[a-f0-9]{64}\n?$/.test(value)) return 64;
  try {
    write(await requestBwhSupplyStatus(action === "status" ? { action } : { action, revision: value.trim() }, requestOptions));
    return 0;
  } catch { return 2; }
}

function isEntrypoint() {
  try { return !!process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href; }
  catch { return false; }
}
if (isEntrypoint()) process.exitCode = await runBwhSupplyClient();
