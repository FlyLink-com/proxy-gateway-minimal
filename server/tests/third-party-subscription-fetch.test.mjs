import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeFetchTarget,
  isBlockedAddress,
  detectCountryCode,
  fetchAndSplitSubscription,
  parseHttpsUrl,
  parseSubscriptionNodes
} from "../services/platform/third-party-subscription-fetch.mjs";

const SS_LINK = "ss://YWVzLTI1Ni1nY206c3ludGhldGljLXBhc3N3b3Jk@203.0.113.10:8388#%F0%9F%87%AD%F0%9F%87%B0%20HK";
const VLESS_LINK = "vless://11111111-1111-4111-8111-111111111111@203.0.113.11:443?type=tcp&security=reality&sni=www.example.test&fp=chrome&pbk=synthetic-public-key&sid=abcd&flow=xtls-rprx-vision#%E6%97%A5%E6%9C%AC";
const HY2_LINK = "hysteria2://synthetic-hy2@203.0.113.12:443?sni=hy2.example.test#%E6%96%B0%E5%8A%A0%E5%9D%A1";
const TUIC_LINK = "tuic://22222222-2222-4222-8222-222222222222:synthetic-tuic@203.0.113.13:443?sni=tuic.example.test&alpn=h3#%E7%BE%8E%E5%9B%BD";

function textResponse(body, { status = 200, headers = {}, delayMs = 0 } = {}) {
  const payload = Buffer.from(body);
  return {
    status,
    headers: new Headers(headers),
    body: new ReadableStream({
      start(controller) {
        const enqueue = () => {
          controller.enqueue(payload);
          controller.close();
        };
        if (delayMs) setTimeout(enqueue, delayMs);
        else enqueue();
      }
    }),
    arrayBuffer: async () => payload
  };
}

test("share-link parsers accept ss/vless/hy2/tuic and count unsupported or malformed lines", () => {
  const parsed = parseSubscriptionNodes([
    SS_LINK,
    VLESS_LINK,
    HY2_LINK,
    TUIC_LINK,
    "vmess://aaaa",
    "trojan://bbbb",
    "ss://not-valid",
    ""
  ].join("\n"));
  assert.equal(parsed.counts.valid, 4);
  assert.equal(parsed.counts.unsupported, 2);
  assert.equal(parsed.counts.malformed, 1);
  const hy2Alias = parseSubscriptionNodes(HY2_LINK.replace("hysteria2://", "hy2://"));
  assert.equal(hy2Alias.nodes[0].protocol, "hysteria2");
  assert.deepEqual(parsed.nodes.map((node) => node.protocol), ["ss", "vless", "hysteria2", "tuic"]);
  assert.equal(parsed.nodes[0].countryCode, "HK");
  assert.equal(parsed.nodes[1].countryCode, "JP");
  assert.equal(parsed.nodes[2].countryCode, "SG");
  assert.equal(parsed.nodes[3].countryCode, "US");
  const serialized = JSON.stringify(parsed);
  assert.equal(serialized.includes("example.invalid"), false);
});

test("base64 subscription bodies decode to the same node set as plain text", () => {
  const plain = [SS_LINK, VLESS_LINK].join("\n");
  const encoded = Buffer.from(plain, "utf8").toString("base64");
  const fromPlain = parseSubscriptionNodes(plain);
  const fromBase64 = parseSubscriptionNodes(encoded);
  assert.equal(fromBase64.encoding, "base64");
  assert.deepEqual(fromBase64.nodes.map((node) => node.fingerprint), fromPlain.nodes.map((node) => node.fingerprint));
});

test("region detection uses flag/zh/en tokens and source override wins", () => {
  assert.equal(detectCountryCode("香港加速"), "HK");
  assert.equal(detectCountryCode("Tokyo JP"), "JP");
  assert.equal(detectCountryCode("mystery node"), "OTHER");
  assert.equal(detectCountryCode("mystery node", "SG"), "SG");
  assert.equal(detectCountryCode("香港", "US"), "US");
});

test("import URL validation rejects non-https, userinfo, localhost and private literals", () => {
  assert.throws(() => parseHttpsUrl("http://example.invalid/x"), (error) => error.code === "invalid_url");
  assert.throws(() => parseHttpsUrl("https://user:pass@example.invalid/x"), (error) => error.code === "invalid_url");
  assert.throws(() => parseHttpsUrl("https://localhost/x"), (error) => error.code === "invalid_url");
  assert.throws(() => parseHttpsUrl("https://127.0.0.1/x"), (error) => error.code === "invalid_url");
  assert.throws(() => parseHttpsUrl("https://10.0.0.8/x"), (error) => error.code === "invalid_url");
  assert.throws(() => parseHttpsUrl("https://169.254.169.254/latest"), (error) => error.code === "invalid_url");
  assert.equal(parseHttpsUrl("https://example.invalid/source").hostname, "example.invalid");
});

test("fetch safety rejects private resolved addresses, private redirects, oversize bodies and timeouts", async () => {
  await assert.rejects(
    () => assertSafeFetchTarget("https://example.invalid/x", { resolveFn: async () => ["127.0.0.1"] }),
    (error) => error.code === "fetch_blocked_address"
  );

  await assert.rejects(
    () => fetchAndSplitSubscription("https://example.invalid/x", {
      resolveFn: async () => ["203.0.113.8"],
      fetchFn: async () => textResponse("", {
        status: 302,
        headers: { location: "https://127.0.0.1/secret" }
      })
    }),
    (error) => error.code === "fetch_blocked_address"
  );

  await assert.rejects(
    () => fetchAndSplitSubscription("https://example.invalid/x", {
      resolveFn: async () => ["203.0.113.8"],
      maxBytes: 8,
      fetchFn: async () => textResponse("0123456789")
    }),
    (error) => error.code === "fetch_oversize"
  );

  await assert.rejects(
    () => fetchAndSplitSubscription("https://example.invalid/x", {
      resolveFn: async () => ["203.0.113.8"],
      timeoutMs: 20,
      fetchFn: async (_url, { signal } = {}) => new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })
    }),
    (error) => error.code === "fetch_timeout"
  );
});

test("successful fetch+split returns valid nodes without exposing the URL in errors", async () => {
  const parsed = await fetchAndSplitSubscription("https://example.invalid/x", {
    resolveFn: async () => ["203.0.113.8"],
    fetchFn: async () => textResponse([SS_LINK, "vmess://x", "ss://bad"].join("\n"))
  });
  assert.equal(parsed.counts.valid, 1);
  assert.equal(parsed.counts.unsupported, 1);
  assert.equal(parsed.counts.malformed, 1);
  assert.equal(parsed.nodes[0].protocol, "ss");
});

test("blocked address ranges cover CGNAT, multicast, reserved and hex-mapped IPv6", () => {
  for (const address of [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "100.127.255.254", "198.18.0.1", "224.0.0.1", "240.0.0.1",
    "::1", "fe80::1", "fd00:ec2::254", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe"
  ]) {
    assert.equal(isBlockedAddress(address), true, address);
  }
  for (const address of ["203.0.113.10", "8.8.8.8", "100.128.0.1", "2001:db8::1"]) {
    assert.equal(isBlockedAddress(address), false, address);
  }
});
