import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function normalizeToken(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function defaultConsoleTokenStorePath(rootDir) {
  return join(rootDir, ".proxy-gateway", "console-token");
}

export function resolveConsoleToken({
  rootDir,
  env = process.env,
  tokenStorePath = defaultConsoleTokenStorePath(rootDir),
  tokenFactory = crypto.randomUUID
}) {
  const envToken = normalizeToken(env.CONSOLE_TOKEN);
  if (envToken) {
    return { token: envToken, source: "env", generated: false, tokenStorePath };
  }

  if (existsSync(tokenStorePath)) {
    const storedToken = normalizeToken(readFileSync(tokenStorePath, "utf8"));
    if (storedToken) {
      return { token: storedToken, source: "file", generated: false, tokenStorePath };
    }
  }

  const token = normalizeToken(tokenFactory());
  if (!token) {
    throw new Error("Generated console token is empty");
  }

  mkdirSync(dirname(tokenStorePath), { recursive: true });
  writeFileSync(tokenStorePath, `${token}\n`, { mode: 0o600 });

  return { token, source: "file", generated: true, tokenStorePath };
}
