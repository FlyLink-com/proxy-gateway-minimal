import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

const workerEntrypoint = fileURLToPath(new URL("../src/index.mjs", import.meta.url));
const issuer = "https://admin.example.test/";
const appOrigin = "https://admin.example.test";
const clientId = "adminClient123";
const audience = "https://api.admin.example.test/";
const claimUri = "https://flylink.example.test/mfa";
const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateJwk = keyPair.privateKey.export({ format: "jwk" });
const publicJwk = {
  ...keyPair.publicKey.export({ format: "jwk" }),
  kid: "workerd-admin-test-key",
  kty: "RSA",
  use: "sig",
  alg: "RS256",
  key_ops: ["verify"],
};

const idpWorkerScript = String.raw