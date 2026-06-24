import assert from "node:assert/strict";
import test from "node:test";
import { buildTlsMaterialPreflightReport } from "../services/edge/tls-material-preflight.mjs";

function validCertificateFacts() {
  return {
    dnsNames: ["sgp.gccwebos.com"],
    keyPairMatches: true,
    notAfter: "2026-09-15T00:00:00.000Z",
    fingerprintSha256: "sha256:synthetic-public-cert-fingerprint"
  };
}

test("TLS material preflight blocks Mihomo TUIC live cert paths outside safe runtime roots", () => {
  const report = buildTlsMaterialPreflightReport({
    runtime: "mihomo-tuic",
    channelRef: "channel-sgp-a-tuic",
    host: "sgp.gccwebos.com",
    listener: {
      certificate: "/etc/letsencrypt/live/sgp.gccwebos.com/fullchain.pem",
      privateKey: "/etc/letsencrypt/live/sgp.gccwebos.com/privkey.pem"
    },
    certificate: validCertificateFacts(),
    fileAccess: {
      certificateReadableByService: true,
      privateKeyReadableByService: true
    }
  });

  assert.equal(report.type, "gccgw_edge_tls_material_preflight");
  assert.equal(report.ok, false);
  assert.equal(report.runtime, "mihomo-tuic");
  assert.equal(report.redacted, true);
  assert.equal(report.checks.safePathPolicy.ok, false);
  assert.deepEqual(report.blockers.map((blocker) => blocker.code).sort(), [
    "certificate_outside_safe_path",
    "private_key_outside_safe_path"
  ]);
  assert.doesNotMatch(JSON.stringify(report), /letsencrypt|privkey|fullchain|sgp\.gccwebos\.com\/fullchain/i);
});

test("TLS material preflight accepts protected safe copies with matching source parity", () => {
  const report = buildTlsMaterialPreflightReport({
    runtime: "mihomo-tuic",
    channelRef: "channel-sgp-a-tuic",
    host: "sgp.gccwebos.com",
    listener: {
      certificate: "/etc/mihomo/tls/sgp.gccwebos.com/fullchain.pem",
      privateKey: "/etc/mihomo/tls/sgp.gccwebos.com/privkey.pem"
    },
    materialSource: {
      certificate: "/etc/mihomo/tls/sgp.gccwebos.com/fullchain.pem",
      privateKey: "/etc/mihomo/tls/sgp.gccwebos.com/privkey.pem"
    },
    certificate: validCertificateFacts(),
    fileAccess: {
      certificateReadableByService: true,
      privateKeyReadableByService: true
    }
  });

  assert.equal(report.ok, true);
  assert.equal(report.status, "ready");
  assert.equal(report.checks.certificateCoversHost.ok, true);
  assert.equal(report.checks.keyPairMatches.ok, true);
  assert.equal(report.checks.serviceReadable.ok, true);
  assert.equal(report.checks.safePathPolicy.ok, true);
  assert.equal(report.checks.materialSourceParity.ok, true);
  assert.equal(report.summary.materialSourceParity, "matched");
  assert.doesNotMatch(JSON.stringify(report), /privkey|fullchain|\/etc\/mihomo|synthetic-public-cert-fingerprint/i);
});

test("TLS material preflight treats wildcard certificates as single-label matches", () => {
  const report = buildTlsMaterialPreflightReport({
    runtime: "mihomo-tuic",
    channelRef: "channel-sgp-a-tuic",
    host: "nested.sgp.gccwebos.com",
    listener: {
      certificate: "/etc/mihomo/tls/sgp.gccwebos.com/fullchain.pem",
      privateKey: "/etc/mihomo/tls/sgp.gccwebos.com/privkey.pem"
    },
    certificate: {
      dnsNames: ["*.gccwebos.com"],
      keyPairMatches: true
    },
    fileAccess: {
      certificateReadableByService: true,
      privateKeyReadableByService: true
    }
  });

  assert.equal(report.ok, false);
  assert.equal(report.checks.certificateCoversHost.ok, false);
  assert.ok(report.blockers.some((blocker) => blocker.code === "certificate_host_mismatch"));
  assert.doesNotMatch(JSON.stringify(report), /privkey|fullchain|\/etc\/mihomo/i);
});

test("TLS material preflight fails closed when runtime paths drift from protected material source", () => {
  const report = buildTlsMaterialPreflightReport({
    runtime: "mihomo-tuic",
    channelRef: "channel-sgp-a-tuic",
    host: "sgp.gccwebos.com",
    listener: {
      certificate: "/etc/mihomo/tls/sgp.gccwebos.com/fullchain.pem",
      privateKey: "/etc/mihomo/tls/sgp.gccwebos.com/privkey.pem"
    },
    materialSource: {
      certificate: "/etc/letsencrypt/live/sgp.gccwebos.com/fullchain.pem",
      privateKey: "/etc/letsencrypt/live/sgp.gccwebos.com/privkey.pem"
    },
    certificate: validCertificateFacts(),
    fileAccess: {
      certificateReadableByService: true,
      privateKeyReadableByService: true
    }
  });

  assert.equal(report.ok, false);
  assert.equal(report.checks.materialSourceParity.ok, false);
  assert.ok(report.blockers.some((blocker) => blocker.code === "runtime_material_source_drift"));
  assert.doesNotMatch(JSON.stringify(report), /\/etc\/|letsencrypt|privkey|fullchain/i);
});

test("TLS material preflight can require Hysteria2 protected runtime copies during rotation", () => {
  const report = buildTlsMaterialPreflightReport({
    runtime: "hysteria2",
    channelRef: "channel-sgp-a-hy2",
    host: "sgp.gccwebos.com",
    requireSafeRuntimeCopy: true,
    safePathRoots: ["/etc/hysteria/tls"],
    listener: {
      certificate: "/etc/letsencrypt/live/sgp.gccwebos.com/fullchain.pem",
      privateKey: "/etc/letsencrypt/live/sgp.gccwebos.com/privkey.pem"
    },
    certificate: validCertificateFacts(),
    fileAccess: {
      certificateReadableByService: true,
      privateKeyReadableByService: true
    }
  });

  assert.equal(report.ok, false);
  assert.equal(report.checks.safePathPolicy.ok, false);
  assert.ok(report.blockers.some((blocker) => blocker.code === "private_key_outside_safe_path"));
  assert.doesNotMatch(JSON.stringify(report), /letsencrypt|privkey|fullchain/i);
});
