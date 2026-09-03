import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/control-plane-artifact-ingress.yml"),
  "utf8"
);

test("manual artifact-ingress workflow streams only one verified packet to the fixed receiver", () => {
  assert.match(workflow, /^name: Control Plane Artifact Ingress$/m);
  assert.match(workflow, /^\s+workflow_dispatch:$/m);
  for (const input of [
    "confirmation", "source_commit", "release_run_id", "source_artifact_name",
    "dependency_run_id", "dependency_artifact_name"
  ]) assert.match(workflow, new RegExp(`^\\s+${input}:$`, "m"));
  assert.match(workflow, /inputs\.confirmation == 'deliver artifact ingress packet'/);
  assert.match(workflow, /^\s+actions: read$/m);
  assert.match(workflow, /^\s+contents: read$/m);
  assert.match(
    workflow,
    /^\s+environment:\r?\n\s+name: control-plane-artifact-ingress$/m
  );
  assert.match(workflow, /actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38/);
  assert.match(workflow, /node-version: 22\.23\.1/);
  assert.equal(
    (workflow.match(/actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/g) ?? []).length,
    2
  );
  assert.match(workflow, /source_commit_invalid/);
  assert.match(workflow, /scripts\/control-plane-artifact-ingress-packet-builder\.mjs/);
  assert.match(workflow, /artifact_ingress_packet_prepared/);
  assert.match(workflow, /scripts\/control-plane-artifact-ingress-delivery-cli\.mjs/);
  assert.match(workflow, /mkdir -p "\$RUNNER_TEMP\/control-plane-ingress-delivery"/);
  assert.match(workflow, /--expires-at "\$expires_at" > "\$RUNNER_TEMP\/control-plane-ingress-delivery\/packet\.bin"/);
  assert.match(workflow, /cat "\$RUNNER_TEMP\/control-plane-ingress-delivery\/packet\.bin" \| \\\r?\n\s+ssh -T -i/);
  assert.match(workflow, /ConnectTimeout=15/);
  assert.match(workflow, /secrets\.CONTROL_PLANE_ARTIFACT_INGRESS_SSH_PRIVATE_KEY/);
  assert.match(workflow, /secrets\.CONTROL_PLANE_ARTIFACT_INGRESS_HOST/);
  assert.match(workflow, /secrets\.CONTROL_PLANE_ARTIFACT_INGRESS_SSH_PORT/);
  assert.match(workflow, /secrets\.CONTROL_PLANE_ARTIFACT_INGRESS_KNOWN_HOSTS/);
  assert.match(workflow, /ssh -T -i/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.match(workflow, /IdentitiesOnly=yes/);
  assert.match(workflow, /GlobalKnownHostsFile=\/dev\/null/);
  assert.match(workflow, /Remove ephemeral packet materials/);
  assert.doesNotMatch(workflow, /\bscp\b|\brsync\b/i);
  assert.doesNotMatch(workflow, /actions\/upload-artifact|writeArtifactIngressPacket/);
});
