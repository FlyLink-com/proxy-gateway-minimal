#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  WelcomeCoinsNativeBuildError,
  buildWelcomeCoinsNativeBootstrap,
  verifyWelcomeCoinsNativeBootstrap
} from "./control-plane-welcome-coins-native-build-lib.mjs";

function parseArguments(argv) {
  if (!Array.isArray(argv)) throw new WelcomeCoinsNativeBuildError("native_build_invalid");
  if (argv.length !== 4) throw new WelcomeCoinsNativeBuildError("native_build_invalid");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!["--mode", "--root"].includes(key) || values.has(key)
      || typeof value !== "string" || !value || value.startsWith("--")) {
      throw new WelcomeCoinsNativeBuildError("native_build_invalid");
    }
    values.set(key, value);
  }
  const mode = values.get("--mode");
  if (!["build", "verify"].includes(mode) || !values.has("--root")) {
    throw new WelcomeCoinsNativeBuildError("native_build_invalid");
  }
  return Object.freeze({ mode, root: resolve(values.get("--root")) });
}

export async function runWelcomeCoinsNativeBuildCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  let mode = null;
  try {
    const parsed = parseArguments(argv);
    mode = parsed.mode;
    const operation = mode === "build"
      ? buildWelcomeCoinsNativeBootstrap
      : verifyWelcomeCoinsNativeBootstrap;
    const result = operation({
      root: parsed.root,
      runtime: Object.freeze({ platform: process.platform, spawnSync })
    });
    stdout.write(`${JSON.stringify({
      schemaVersion: "1",
      type: "welcome_coins_native_build",
      mode,
      state: "verified",
      receiptSha256: result.receiptSha256,
      outputs: result.outputs
    })}\n`);
    return 0;
  } catch (error) {
    const condition = error instanceof WelcomeCoinsNativeBuildError
      ? error.condition
      : "native_build_invalid";
    stderr.write(`${JSON.stringify({
      schemaVersion: "1",
      type: "welcome_coins_native_build",
      mode,
      state: "blocked",
      condition
    })}\n`);
    return 1;
  }
}

process.exitCode = await runWelcomeCoinsNativeBuildCli();
