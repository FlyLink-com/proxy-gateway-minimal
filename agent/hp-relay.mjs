#!/usr/bin/env node

/**
 * hp-relay.mjs — Operator Lab diagnostic relay
 *
 * Risk: local/experiment only.
 * Boundary: docs/units/OPERATOR_LAB_UNIT.md
 * Authority: Does not authorize production, CI, staging, prod-edge-c,
 *   Server Edge Mesh, or Local Edge Agent runtime.
 *
 * Produces redacted diagnostic evidence for operator review.
 * Evidence must never be treated as production readiness or deployment approval.
 */

import { createChannelFromProfile } from "./channel-profile.mjs";

// ── assertions ────────────────────────────────────────────────────────
const NON_GOAL = Object.freeze({
  production: "HP Relay is not production.",
  ci: "HP Relay is not CI.",
  staging: "HP Relay is not staging.",
  prodEdgeC: "HP Relay is not prod-edge-c.",
  serverEdgeMesh: "HP Relay is not Server Edge Mesh.",
  localEdgeAgent: "HP Relay is not the official Local Edge Agent runtime.",
  customerTraffic: "HP Relay does not carry customer traffic.",
  subscriptionAuthority: "HP Relay does not make subscription decisions.",
  deploymentApproval: "HP Relay evidence is not deployment approval."
});

function assertBoundary() {
  if (process.env.OPERATOR_LAB_STRICT === "0") {
    return;
  }
  const violations = [];
  if (process.env.NODE_ENV === "production") {
    violations.push(NON_GOAL.production);
  }
  if (process.env.CI) {
    violations.push(NON_GOAL.ci);
  }
  if (violations.length > 0) {
    console.error("HP Relay boundary violation:");
    violations.forEach((v) => console.error(`  - ${v}`));
    console.error("Set OPERATOR_LAB_STRICT=0 to override (not recommended).");
    process.exit(1);
  }
}

// ── evidence packaging ────────────────────────────────────────────────

function timestampISO() {
  return new Date().toISOString();
}

/**
 * Wrap a diagnostic run into a redacted evidence package.
 * The evidence package is safe for documentation and cross-unit review.
 */
function packageEvidence({ profile, target, diagnostics, durationMs, error }) {
  const evidence = {
    boundary: "Operator Lab",
    risk: "local/experiment-only",
    notProduction: true,
    notCI: true,
    notStaging: true,
    timestamp: timestampISO(),
    profile: typeof profile === "object" ? { type: profile.type } : null,
    target: target ? { host: "[redacted]", port: target.port } : null,
    diagnostics: diagnostics ? diagnostics : null,
    durationMs: typeof durationMs === "number" ? Math.round(durationMs) : null,
    ok: !error,
    lastFailure: error ? { class: error.message || "unknown" } : null
  };

  return evidence;
}

// ── main diagnostic run ───────────────────────────────────────────────

/**
 * Run a single diagnostic probe through a channel profile.
 *
 * @param {object}  opts
 * @param {object}  opts.profile   - channel profile (disabled | direct-tcp | edge-tunnel)
 * @param {object} [opts.target]   - { host, port } to attempt connecting to
 * @param {number} [opts.timeoutMs] - timeout in ms, default 5000
 * @returns {object} redacted evidence package
 */
export async function runHpRelayDiagnostic({ profile, target, timeoutMs = 5000 } = {}) {
  assertBoundary();

  const channel = createChannelFromProfile(profile);
  const startedAt = Date.now();

  try {
    if (!target || !target.host || !target.port) {
      // snapshot-only mode — no connectivity test
      const snapshot = channel.diagnosticsSnapshot();
      return packageEvidence({
        profile,
        target: null,
        diagnostics: snapshot,
        durationMs: Date.now() - startedAt
      });
    }

    const socket = await Promise.race([
      channel.openTcp(target),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs)
      )
    ]);

    socket.destroy();
    const snapshot = channel.diagnosticsSnapshot();
    return packageEvidence({
      profile,
      target: { port: target.port },
      diagnostics: snapshot,
      durationMs: Date.now() - startedAt
    });
  } catch (err) {
    const snapshot = channel.diagnosticsSnapshot();
    return packageEvidence({
      profile,
      target: target ? { port: target.port } : null,
      diagnostics: snapshot,
      durationMs: Date.now() - startedAt,
      error: err
    });
  }
}

// ── CLI ────────────────────────────────────────────────────────────────

function printUsage() {
  console.error("Usage: node agent/hp-relay.mjs [options]");
  console.error("");
  console.error("Options:");
  console.error("  --profile <type>     channel profile: disabled | direct-tcp | edge-tunnel");
  console.error("  --host <host>        edge tunnel host (required for edge-tunnel)");
  console.error("  --port <port>        edge tunnel port (required for edge-tunnel)");
  console.error("  --target-host <host>  target host to test connectivity");
  console.error("  --target-port <port>  target port to test connectivity");
  console.error("  --timeout <ms>        timeout in ms (default 5000)");
  console.error("  --help               show this help");
  console.error("");
  console.error("Examples:");
  console.error("  node agent/hp-relay.mjs --profile disabled");
  console.error("  node agent/hp-relay.mjs --profile direct-tcp --target-host 127.0.0.1 --target-port 1080");
  console.error("  node agent/hp-relay.mjs --profile edge-tunnel --host 127.0.0.1 --port 3456 --target-host example.com --target-port 443");
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--profile":
        args.profile = argv[++i];
        break;
      case "--host":
        args.host = argv[++i];
        break;
      case "--port":
        args.port = parseInt(argv[++i], 10);
        break;
      case "--target-host":
        args.targetHost = argv[++i];
        break;
      case "--target-port":
        args.targetPort = parseInt(argv[++i], 10);
        break;
      case "--timeout":
        args.timeoutMs = parseInt(argv[++i], 10);
        break;
      case "--help":
        args.help = true;
        break;
      default:
        break;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.profile) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const profile = { type: args.profile };

  if (args.profile === "edge-tunnel") {
    if (!args.host || !args.port) {
      console.error("edge-tunnel profile requires --host and --port");
      process.exit(1);
    }
    profile.host = args.host;
    profile.port = args.port;
    profile.allowEdgeTunnel = true;
  }

  if (args.profile === "direct-tcp") {
    profile.allowDirectTcp = true;
  }

  const target =
    args.targetHost && args.targetPort
      ? { host: args.targetHost, port: args.targetPort }
      : undefined;

  console.error("[hp-relay] starting diagnostic (Operator Lab / local-only)");

  try {
    const evidence = await runHpRelayDiagnostic({
      profile,
      target,
      timeoutMs: args.timeoutMs || 5000
    });
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(evidence.ok ? 0 : 1);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("hp-relay.mjs") || process.argv[1].endsWith("hp-relay"));

if (isMain) {
  main();
}
