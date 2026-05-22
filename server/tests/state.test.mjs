import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRuntimeState } from "../state.mjs";

test("createRuntimeState exposes expected ports and services", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-state-"));
  let state;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: { CONSOLE_TOKEN: "secret", SS_PASSWORD: "pw" },
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      autoStartHttpProxy: false
    });

    assert.equal(state.host, "127.0.0.1");
    assert.equal(state.ports.console, 3456);
    assert.equal(state.ports.socks, 1080);
    assert.equal(state.ports.httpProxy, 18180);
    assert.equal(typeof state.services.ssLocal.start, "function");
    assert.equal(typeof state.services.httpProxy.start, "function");
    assert.equal(typeof state.proxyConfig, "object");
    assert.equal(state.consoleToken, "secret");
  } finally {
    state?.subscriptions?.repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState reuses a generated console token across restarts", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-token-"));
  const tokenStorePath = join(dir, "console-token");
  let first;
  let second;

  try {
    let generated = 0;
    const options = {
      rootDir: new URL("../../", import.meta.url),
      env: { SS_PASSWORD: "pw" },
      autoStartHttpProxy: false,
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      consoleTokenStorePath: tokenStorePath,
      tokenFactory: () => `generated-token-${++generated}`
    };

    first = createRuntimeState(options);
    second = createRuntimeState(options);

    assert.equal(first.consoleToken, "generated-token-1");
    assert.equal(second.consoleToken, "generated-token-1");
    assert.equal(generated, 1);
    assert.equal(readFileSync(tokenStorePath, "utf8"), "generated-token-1\n");
  } finally {
    first?.subscriptions?.repository.close();
    second?.subscriptions?.repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState wires subscription runtime services with default public URL", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-subscriptions-"));
  let state;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: { CONSOLE_TOKEN: "secret", SS_PASSWORD: "pw" },
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      autoStartHttpProxy: false
    });

    assert.equal(state.subscriptions.publicSubscriptionBaseUrl, "http://127.0.0.1:3456");
    assert.equal(typeof state.subscriptions.service.createTenant, "function");
    assert.equal(typeof state.subscriptions.repository.close, "function");
  } finally {
    state?.subscriptions?.repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState respects PUBLIC_SUBSCRIPTION_BASE_URL override", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-subscriptions-"));
  let state;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        PUBLIC_SUBSCRIPTION_BASE_URL: "  https://subscriptions.example.test///  "
      },
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      autoStartHttpProxy: false
    });

    assert.equal(state.subscriptions.publicSubscriptionBaseUrl, "https://subscriptions.example.test");
    assert.equal(typeof state.subscriptions.service.createTenant, "function");
  } finally {
    state?.subscriptions?.repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState closes only owned subscription repositories", () => {
  let closeCount = 0;
  const repository = {
    close: () => {
      closeCount += 1;
    }
  };

  const state = createRuntimeState({
    rootDir: new URL("../../", import.meta.url),
    env: { CONSOLE_TOKEN: "secret", SS_PASSWORD: "pw" },
    subscriptionRepository: repository,
    autoStartHttpProxy: false
  });

  state.close();
  state.subscriptions.close();

  assert.equal(closeCount, 0);
  assert.equal(state.subscriptions.repository, repository);
  assert.equal(typeof state.subscriptions.service.createTenant, "function");
});

test("createRuntimeState does not create a repository when subscription service is injected alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-service-only-"));
  const service = { createTenant: () => {} };

  try {
    const state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: { CONSOLE_TOKEN: "secret", SS_PASSWORD: "pw" },
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      subscriptionService: service,
      autoStartHttpProxy: false
    });

    assert.equal(state.subscriptions.repository, null);
    assert.equal(state.subscriptions.service, service);
    assert.equal(existsSync(join(dir, "subscriptions.sqlite")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState parses hardening security environment", () => {
  const state = createRuntimeState({
    rootDir: new URL("../../", import.meta.url),
    env: {
      CONSOLE_TOKEN: "secret",
      SS_PASSWORD: "pw",
      ADMIN_ALLOWED_CIDRS: "127.0.0.1/32,10.0.0.0/8",
      SUB_RATE_LIMIT_WINDOW_MS: "1000",
      SUB_RATE_LIMIT_MAX: "2",
      SUBSCRIPTION_TEMP_LINK_TTL_MINUTES: "30"
    },
    autoStartHttpProxy: false,
    subscriptionDbPath: ":memory:"
  });

  try {
    assert.deepEqual(state.security.adminAllowedCidrs, ["127.0.0.1/32", "10.0.0.0/8"]);
    assert.deepEqual(state.security.subRateLimit, { windowMs: 1000, max: 2 });
    assert.equal(state.subscriptions.tempLinkTtlMinutes, 30);
  } finally {
    state.close();
  }
});
