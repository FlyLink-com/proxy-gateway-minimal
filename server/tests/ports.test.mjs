import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { isPortListening } from "../services/ports.mjs";

function listenOnRandomPort() {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => res.end("ok"));
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

test("isPortListening returns true for a listening TCP port", async () => {
  const { server, port } = await listenOnRandomPort();
  try {
    assert.equal(await isPortListening(port, "127.0.0.1", 500), true);
  } finally {
    server.close();
  }
});

test("isPortListening returns false for a closed TCP port", async () => {
  const { server, port } = await listenOnRandomPort();
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await isPortListening(port, "127.0.0.1", 500), false);
});
