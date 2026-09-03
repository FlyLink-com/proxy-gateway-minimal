import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const v1 = readFileSync(
  resolve(process.cwd(), ".github/workflows/control-plane-artifact-ingress.yml"),
  "utf8"
);
const v2 = readFileSync(
  resolve(process.cwd(), ".github/workflows/control-plane-artifact-ingress-v2.yml"),
  "utf8"
);

test("v2 ingress remains an independent manual workflow with a receiver-upgrade precondition", () => {
  assert.match(v2, /^name: Control Plane Artifact Ingress V2$/m);
  assert.match(v2, /^run-name: .*receiver v2 prerequisite/m);
  assert.match(v2, /^\s+workflow_dispatch:$/m);
  assert.match(v2, /inputs\.confirmation == 'deliver artifact ingress v2 packet after receiver upgrade'/);
  assert.match(v2, /^\s+packet_id:$/m);
  assert.match(v2, /github\.ref == 'refs\/heads\/master'/);
  assert.match(v2, /^\s+actions: read$/m);
  assert.match(v2, /^\s+contents: read$/m);
  assert.match(v2, /^\s+timeout-minutes: 10$/m);
  assert.match(v2, /^\s+environment:\r?\n\s+name: control-plane-artifact-ingress$/m);
  assert.match(v2, /actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803/);
  assert.match(v2, /persist-credentials: false/);
  assert.match(v2, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(v2, /fetch-depth: 0/);
  assert.match(v2, /git merge-base --is-ancestor "\$SOURCE_COMMIT" "\$GITHUB_SHA"/);
  assert.match(v2, /repos\/\$GITHUB_REPOSITORY\/actions\/runs\/\$RELEASE_RUN_ID/);
  assert.match(v2, /repos\/\$GITHUB_REPOSITORY\/actions\/runs\/\$DEPENDENCY_RUN_ID/);
  assert.match(v2, /scripts\/control-plane-artifact-ingress-v2-run-contract\.mjs/);
  assert.match(v2, /actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38/);
  assert.match(v2, /node-version: 22\.23\.1/);
  assert.equal(
    (v2.match(/actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/g) ?? []).length,
    2
  );
  assert.match(v2, /scripts\/control-plane-artifact-ingress-v2-delivery-cli\.mjs/);
  assert.match(v2, /artifact_ingress_v2_packet_verified/);
  assert.match(v2, /control-plane-ingress-v2-delivery\/packet\.bin/);
  assert.match(v2, /cat "\$RUNNER_TEMP\/control-plane-ingress-v2-delivery\/packet\.bin" \| \\\r?\n\s+ssh -T -i/);
  assert.match(v2, /ConnectTimeout=15/);
  assert.match(v2, /StrictHostKeyChecking=yes/);
  assert.match(v2, /IdentitiesOnly=yes/);
  assert.match(v2, /GlobalKnownHostsFile=\/dev\/null/);
  assert.match(v2, /secrets\.CONTROL_PLANE_ARTIFACT_INGRESS_SSH_PRIVATE_KEY/);
  assert.match(v2, /secrets\.CONTROL_PLANE_ARTIFACT_INGRESS_HOST/);
  assert.match(v2, /secrets\.CONTROL_PLANE_ARTIFACT_INGRESS_SSH_PORT/);
  assert.match(v2, /secrets\.CONTROL_PLANE_ARTIFACT_INGRESS_KNOWN_HOSTS/);
  assert.match(v2, /Remove ephemeral v2 packet materials/);
  assert.match(v2, /group: control-plane-artifact-ingress-\$\{\{ github\.ref \}\}/);
  assert.doesNotMatch(v2, /\bscp\b|\brsync\b|\bsudo\b|\bsystemctl\b|control-plane-production-stage-controller/i);
  assert.doesNotMatch(v2, /actions\/upload-artifact/);
  assert.ok(
    v2.indexOf("Verify both selected producer runs")
      < v2.indexOf("Retrieve the selected source artifact"),
    "producer provenance must be verified before download"
  );
  assert.ok(
    v2.indexOf("packet.bin") < v2.indexOf("Materialize the host-bound delivery identity"),
    "the complete packet must exist before the SSH identity"
  );
});

test("adding v2 does not rewrite or silently route through the v1 workflow", () => {
  assert.match(v1, /^name: Control Plane Artifact Ingress$/m);
  assert.match(v1, /control-plane-artifact-ingress-packet-builder\.mjs/);
  assert.doesNotMatch(v1, /ingress-v2|Ingress V2/);
  assert.doesNotMatch(v2, /control-plane-artifact-ingress-packet-builder\.mjs/);
  assert.doesNotMatch(v2, /control-plane-artifact-ingress-delivery-cli\.mjs/);
});
