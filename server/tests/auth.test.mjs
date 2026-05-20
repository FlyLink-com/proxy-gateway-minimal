import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import { createAuthMiddleware } from "../middleware/auth.mjs";

function listen(app) {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

test("auth middleware allows public paths", async () => {
  const app = express();
  app.use(createAuthMiddleware({ token: "secret", publicPaths: ["/api/health", "/proxy.pac"] }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    server.close();
  }
});

test("auth middleware blocks control paths without token", async () => {
  const app = express();
  app.use(createAuthMiddleware({ token: "secret", publicPaths: ["/api/health"] }));
  app.post("/api/proxy/start", (_req, res) => res.json({ ok: true }));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/proxy/start`, { method: "POST" });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  } finally {
    server.close();
  }
});

test("auth middleware accepts bearer token and token query", async () => {
  const app = express();
  app.use(createAuthMiddleware({ token: "secret", publicPaths: [] }));
  app.post("/api/proxy/start", (_req, res) => res.json({ ok: true }));
  app.post("/api/proxy/stop", (_req, res) => res.json({ ok: true }));

  const { server, baseUrl } = await listen(app);
  try {
    const bearer = await fetch(`${baseUrl}/api/proxy/start`, {
      method: "POST",
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(bearer.status, 200);
    assert.deepEqual(await bearer.json(), { ok: true });

    const query = await fetch(`${baseUrl}/api/proxy/stop?token=secret`, { method: "POST" });
    assert.equal(query.status, 200);
    assert.deepEqual(await query.json(), { ok: true });
  } finally {
    server.close();
  }
});
