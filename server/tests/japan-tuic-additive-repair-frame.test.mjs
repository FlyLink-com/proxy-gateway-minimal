import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import {
  FRAME_MAGIC,
  FRAME_SCHEMA_VERSION,
  JapanTuicRepairFrameError,
  canonicalRepairControl,
  encodeRepairFrame,
  readRepairFrame
} from "../../scripts/japan-tuic-additive-repair-frame.mjs";

const inspect = {
  operation: "inspect",
  runAttempt: "2",
  schemaVersion: "3",
  workflowCommit: "a".repeat(40)
};

const execute = {
  executionGateId: "github-actions-japan-tuic-additive-repair-20260717-001",
  executionNonce: "88a2bb9923bb67a0893b2abcd3d30c951c3041a938583026526c78a5d223d00b",
  operation: "execute",
  runAttempt: "1",
  schemaVersion: "3",
  workflowCommit: "a".repeat(40)
};

const closeout = {
  ...execute,
  operation: "closeout"
};

const frame = ({ controlBytes, artifact = Buffer.from("zip"), magic = FRAME_MAGIC }) => {
  const header = Buffer.alloc(FRAME_MAGIC.length + 8);
  magic.copy(header);
  header.writeUInt32BE(controlBytes.length, FRAME_MAGIC.length);
  header.writeUInt32BE(artifact.length, FRAME_MAGIC.length + 4);
  return Buffer.concat([header, controlBytes, artifact]);
};

const expectFrameError = async (input, options = {}, code = "frame_invalid") => {
  await assert.rejects(
    () => readRepairFrame(Readable.from(input), { expectedArtifactSize: 3, maxControlBytes: 1024, ...options }),
    (error) => error instanceof JapanTuicRepairFrameError && error.code === code && error.message === code
  );
};

test("freezes the frame schema identity and canonical control encodings", () => {
  assert.equal(FRAME_SCHEMA_VERSION, "3");
  assert.deepEqual(FRAME_MAGIC, Buffer.from("GCCGWJPR3\0", "ascii"));
  assert.deepEqual(canonicalRepairControl(inspect), Buffer.from(JSON.stringify(inspect)));
  assert.deepEqual(canonicalRepairControl(execute), Buffer.from(JSON.stringify(execute)));
  assert.deepEqual(canonicalRepairControl(closeout), Buffer.from(JSON.stringify(closeout)));
});

test("round trips an exact execute frame", async () => {
  assert.deepEqual(
    await readRepairFrame(Readable.from(encodeRepairFrame({ control: execute, artifact: Buffer.from("zip") })), {
      expectedArtifactSize: 3,
      maxControlBytes: 1024
    }),
    { control: execute, artifact: Buffer.from("zip") }
  );
});

test("rejects unknown operation and invalid control forms", async () => {
  assert.throws(
    () => canonicalRepairControl({ ...inspect, operation: "apply" }),
    (error) => error.code === "frame_invalid"
  );
  for (const control of [
    { runAttempt: "2", schemaVersion: "3", workflowCommit: "a".repeat(40) },
    { ...inspect, unexpected: true },
    { ...execute, operation: "inspect" },
    { ...inspect, schemaVersion: "2" },
    { ...execute, executionNonce: "not-a-nonce" }
  ]) {
    assert.throws(() => canonicalRepairControl(control), (error) => error.code === "frame_invalid");
  }
  await expectFrameError(frame({ controlBytes: Buffer.from('{"operation":"apply"}') }));
});

test("rejects missing, extra, duplicate, and reordered JSON keys", async () => {
  const canonical = canonicalRepairControl(execute);
  for (const controlBytes of [
    Buffer.from('{"operation":"execute","runAttempt":"1","schemaVersion":"3","workflowCommit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'),
    Buffer.from(`${canonical.subarray(0, -1)},"extra":true}`),
    Buffer.from(canonical.toString().replace('"operation":"execute"', '"operation":"execute","operation":"execute"')),
    Buffer.from(JSON.stringify({ ...inspect, executionGateId: execute.executionGateId, executionNonce: execute.executionNonce }))
  ]) {
    await expectFrameError(frame({ controlBytes }));
  }
});

test("rejects wrong magic, invalid UTF-8, and oversized control bytes", async () => {
  const wrongMagic = Buffer.from(FRAME_MAGIC);
  wrongMagic[8] = 0x34;
  await expectFrameError(frame({ controlBytes: canonicalRepairControl(execute), magic: wrongMagic }));
  await expectFrameError(frame({ controlBytes: Buffer.from([0xc3, 0x28]) }));
  await expectFrameError(
    frame({ controlBytes: Buffer.alloc(1025, 0x20) }),
    {},
    "frame_too_large"
  );
});

test("rejects artifact shape and declared artifact length drift", async () => {
  assert.throws(
    () => encodeRepairFrame({ control: closeout, artifact: Buffer.from("zip") }),
    (error) => error.code === "frame_invalid"
  );
  assert.throws(
    () => encodeRepairFrame({ control: inspect }),
    (error) => error.code === "frame_invalid"
  );
  assert.throws(
    () => encodeRepairFrame({ control: execute }),
    (error) => error.code === "frame_invalid"
  );
  await expectFrameError(
    frame({ controlBytes: canonicalRepairControl(execute), artifact: Buffer.from("too-long") })
  );
  await expectFrameError(
    frame({ controlBytes: canonicalRepairControl(closeout), artifact: Buffer.from("zip") })
  );
});

test("rejects header and body truncation plus a trailing byte", async () => {
  await expectFrameError(Buffer.alloc(FRAME_MAGIC.length + 7));
  const valid = encodeRepairFrame({ control: execute, artifact: Buffer.from("zip") });
  await expectFrameError(valid.subarray(0, FRAME_MAGIC.length + 8));
  await expectFrameError(valid.subarray(0, -1));
  await expectFrameError(Buffer.concat([valid, Buffer.from([0])]), {}, "frame_trailing_bytes");
});
