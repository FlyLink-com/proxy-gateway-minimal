import test from "node:test";
import assert from "node:assert/strict";
import { parseFullMeteringCommand, validateFullMeteringConfig, assertFullMeteringSshFileMetadata, assertFullMeteringSshFileUnchanged } from "../../scripts/lib/full-metering-command.mjs";
const sshMetadata = (changes = {}) => ({ uid: 0n, gid: 0n, mode: 0o100644n, dev: 1n, ino: 2n, nlink: 1n, size: 80n, mtimeNs: 10n, ctimeNs: 10n, isFile: () => true, isSymbolicLink: () => false, ...changes });
test("SSH trust anchor permits owned 0644 but rejects foreign ownership and writable trust", () => {
  assert.doesNotThrow(() => assertFullMeteringSshFileMetadata(sshMetadata(), { expectedUid: 0n }));
  for (const changes of [{ uid: 1000n }, { mode: 0o100666n }, { mode: 0o100664n }, { nlink: 2n }, { isSymbolicLink: () => true }]) {
    assert.throws(() => assertFullMeteringSshFileMetadata(sshMetadata(changes), { expectedUid: 0n }), /ssh_file_untrusted/);
  }
  assert.doesNotThrow(() => assertFullMeteringSshFileMetadata(sshMetadata({ mode: 0o100600n }), { expectedUid: 0n, privateFile: true }));
  assert.throws(() => assertFullMeteringSshFileMetadata(sshMetadata(), { expectedUid: 0n, privateFile: true }), /ssh_file_untrusted/);
});
test("SSH trust and identity files must remain unchanged across the source read", () => {
  assert.doesNotThrow(() => assertFullMeteringSshFileUnchanged(sshMetadata(), sshMetadata()));
  for (const key of ["uid", "gid", "mode", "dev", "ino", "nlink", "size", "mtimeNs", "ctimeNs"]) {
    assert.throws(() => assertFullMeteringSshFileUnchanged(sshMetadata(), sshMetadata({ [key]: sshMetadata()[key] + 1n })), /ssh_file_changed/);
  }
});
test("command requires exact mode, protected config and digest without implicit collect", () => {
  const input = ["--preflight", "--config", "/private/config.json", "--config-sha256", "a".repeat(64)];
  assert.deepEqual(parseFullMeteringCommand(input), { mode: "preflight", configPath: "/private/config.json", configSha256: "a".repeat(64) });
  for (const argv of [[], input.slice(0, 3), [...input, "--collect"], ["--collect", ...input.slice(1), "--retry"], ["--initialize", "--config", "relative", "--config-sha256", "a".repeat(64)]]) assert.throws(() => parseFullMeteringCommand(argv), /command_invalid/);
});
test("product reset collection is an explicit owned-store mode and accepts no caller proof payload", () => {
  const input = ["--collect-pack-resets", "--config", "/private/config.json", "--config-sha256", "a".repeat(64)];
  assert.deepEqual(parseFullMeteringCommand(input), { mode: "collect-pack-resets", configPath: "/private/config.json", configSha256: "a".repeat(64) });
  for (const suffix of [["--material-approval", "/private/proof.json"], ["--reset-proof", "caller-value"], ["--continue-material"]]) {
    assert.throws(() => parseFullMeteringCommand([...input, ...suffix]), /command_invalid/);
  }
});
test("config forbids missing backup, undeclared fields and remote command interpolation", () => {
  const config = { version: 1, activationId: "full-test", dbPath: "/private/db.sqlite", journalDirectory: "/private/journal", materialPath: "/private/material.json", sources: [],
    backup: { path: "/private/snapshot.sqlite", sha256: "c".repeat(64) },
    sgp: { target: "root@sgp", identityFile: "/private/key", knownHostsFile: "/private/known_hosts", readerScript: "/private/source/scripts/traffic-full-metering-source.mjs" } };
  assert.deepEqual(validateFullMeteringConfig(config), config);
  assert.throws(() => validateFullMeteringConfig({ ...config, unrelated: true }), /config_invalid/);
  assert.throws(() => validateFullMeteringConfig({ ...config, backup: undefined }), /config_invalid/);
  assert.throws(() => validateFullMeteringConfig({ ...config, sgp: { ...config.sgp, target: "root@sgp;id" } }), /config_invalid/);
  assert.throws(() => validateFullMeteringConfig({ ...config, sgp: { ...config.sgp, readerScript: "/private/source $(id)" } }), /config_invalid/);
});
