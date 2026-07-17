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

const MAX_ARTIFACT_BYTES = 4744340;

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
  const reordered = Buffer.from(JSON.stringify({
    operation: execute.operation,
    runAttempt: execute.runAttempt,
    schemaVersion: execute.schemaVersion,
    workflowCommit: execute.workflowCommit,
    executionGateId: execute.executionGateId,
    executionNonce: execute.executionNonce
  }));
  assert.deepEqual(JSON.parse(reordered), execute);
  for (const controlBytes of [
    Buffer.from('{"operation":"execute","runAttempt":"1","schemaVersion":"3","workflowCommit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'),
    Buffer.from(`${canonical.subarray(0, -1)},"extra":true}`),
    Buffer.from(canonical.toString().replace('"operation":"execute"', '"operation":"execute","operation":"execute"')),
    reordered
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

test("accepts the exact maximum artifact and rejects one sentinel after its valid frame", async () => {
  const artifact = Buffer.alloc(MAX_ARTIFACT_BYTES, 0x7a);
  const valid = encodeRepairFrame({ control: execute, artifact });
  const result = await readRepairFrame(Readable.from(valid), {
    expectedArtifactSize: MAX_ARTIFACT_BYTES,
    maxControlBytes: 1024
  });
  assert.deepEqual(result.control, execute);
  assert.equal(result.artifact.length, MAX_ARTIFACT_BYTES);
  await assert.rejects(
    () => readRepairFrame(Readable.from(Buffer.concat([valid, Buffer.from([0])])), {
      expectedArtifactSize: MAX_ARTIFACT_BYTES,
      maxControlBytes: 1024
    }),
    (error) => error.code === "frame_trailing_bytes"
  );
});

test("rejects maximum-plus-one and uint32 artifact declarations before reading a body", async () => {
  assert.throws(
    () => encodeRepairFrame({ control: execute, artifact: Buffer.alloc(MAX_ARTIFACT_BYTES + 1) }),
    (error) => error.code === "frame_too_large"
  );
  for (const declaredSize of [MAX_ARTIFACT_BYTES + 1, 0xffffffff]) {
    const header = Buffer.alloc(FRAME_MAGIC.length + 8);
    FRAME_MAGIC.copy(header);
    header.writeUInt32BE(canonicalRepairControl(execute).length, FRAME_MAGIC.length);
    header.writeUInt32BE(declaredSize, FRAME_MAGIC.length + 4);
    let calls = 0;
    const input = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            calls += 1;
            if (calls === 1) return { value: header, done: false };
            throw new Error("body must not be read");
          }
        };
      }
    };
    await assert.rejects(
      () => readRepairFrame(input, { expectedArtifactSize: 3, maxControlBytes: 1024 }),
      (error) => error.code === "frame_too_large"
    );
    assert.equal(calls, 1);
  }
});

test("handles one maximum frame chunk with huge trailing data without copying the whole chunk", async () => {
  const artifact = Buffer.alloc(MAX_ARTIFACT_BYTES, 0x5a);
  const valid = encodeRepairFrame({ control: execute, artifact });
  const inputChunk = Buffer.concat([valid, Buffer.alloc(1024 * 1024, 0x00)]);
  const sourceFrom = Buffer.from;
  let copiedWholeChunk = false;
  Buffer.from = function patchedBufferFrom(...args) {
    if (args[0] === inputChunk) {
      copiedWholeChunk = true;
      throw new Error("whole chunk copy");
    }
    return sourceFrom.apply(Buffer, args);
  };
  try {
    const input = {
      [Symbol.asyncIterator]() {
        let sent = false;
        return {
          async next() {
            if (sent) return { done: true };
            sent = true;
            return { value: inputChunk, done: false };
          }
        };
      }
    };
    await assert.rejects(
      () => readRepairFrame(input, { expectedArtifactSize: MAX_ARTIFACT_BYTES, maxControlBytes: 1024 }),
      (error) => error.code === "frame_trailing_bytes"
    );
    assert.equal(copiedWholeChunk, false);
  } finally {
    Buffer.from = sourceFrom;
  }
});
