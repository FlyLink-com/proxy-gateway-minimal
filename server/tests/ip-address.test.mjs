import assert from "node:assert/strict";
import test from "node:test";
import {
  createIpAllowlist,
  isPrivateOrLoopbackIp,
  normalizeIpAddress,
  resolveClientIp
} from "../services/ip-address.mjs";

function request({ remoteAddress, forwardedFor }) {
  return {
    socket: { remoteAddress },
    headers: forwardedFor === undefined ? {} : { "x-forwarded-for": forwardedFor }
  };
}

test("normalizeIpAddress handles IPv4-mapped IPv6 addresses and preserves invalid input", () => {
  const cases = [
    ["::ffff:203.0.113.10", "203.0.113.10"],
    ["::FFFF:203.0.113.10", "203.0.113.10"],
    ["::ffff:not-an-ip", "::ffff:not-an-ip"],
    ["::1", "::1"],
    [" 127.0.0.1 ", "127.0.0.1"]
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeIpAddress(input), expected, input);
  }
});

test("private and loopback detection covers default admin ranges", () => {
  assert.equal(isPrivateOrLoopbackIp("127.0.0.1"), true);
  assert.equal(isPrivateOrLoopbackIp("10.1.2.3"), true);
  assert.equal(isPrivateOrLoopbackIp("172.16.0.1"), true);
  assert.equal(isPrivateOrLoopbackIp("172.31.255.255"), true);
  assert.equal(isPrivateOrLoopbackIp("192.168.1.5"), true);
  assert.equal(isPrivateOrLoopbackIp("203.0.113.10"), false);
});

test("resolveClientIp ignores X-Forwarded-For unless the direct peer is explicitly trusted", () => {
  assert.equal(resolveClientIp(request({
    remoteAddress: "::ffff:127.0.0.1",
    forwardedFor: "198.51.100.10, 10.0.0.5"
  })), "127.0.0.1");

  assert.equal(resolveClientIp(request({
    remoteAddress: "203.0.113.20",
    forwardedFor: "198.51.100.10"
  }), { trustedProxyCidrs: ["127.0.0.1/32"] }), "203.0.113.20");
});

test("resolveClientIp derives the rightmost untrusted forwarded IP from trusted proxy chains", () => {
  assert.equal(resolveClientIp(request({
    remoteAddress: "::ffff:127.0.0.1",
    forwardedFor: "198.51.100.10, 10.0.0.5"
  }), { trustedProxyCidrs: ["127.0.0.1/32", "10.0.0.0/8"] }), "198.51.100.10");

  assert.equal(resolveClientIp(request({
    remoteAddress: "10.0.0.9",
    forwardedFor: "198.51.100.10, 203.0.113.5, 10.0.0.5"
  }), { trustedProxyCidrs: ["10.0.0.0/8"] }), "203.0.113.5");

  assert.equal(resolveClientIp(request({
    remoteAddress: "127.0.0.1:1234",
    forwardedFor: "198.51.100.10"
  })), "127.0.0.1:1234");
});

test("resolveClientIp fails closed instead of using the trusted proxy address for a malformed chain", () => {
  const trustedProxyCidrs = ["127.0.0.1/32", "10.0.0.0/8"];
  const malformedChains = [
    "198.51.100.10, not-an-ip, 10.0.0.5",
    "198.51.100.10, , 10.0.0.5",
    ["198.51.100.10", "10.0.0.5:443"],
    ""
  ];

  for (const forwardedFor of malformedChains) {
    assert.equal(resolveClientIp(request({
      remoteAddress: "127.0.0.1",
      forwardedFor
    }), { trustedProxyCidrs }), "", String(forwardedFor));
  }

  assert.equal(resolveClientIp(request({
    remoteAddress: "127.0.0.1"
  }), { trustedProxyCidrs }), "127.0.0.1", "missing header keeps the direct address");
});

test("createIpAllowlist matches exact IPv4, IPv4 CIDR, and IPv6 loopback", () => {
  const allowlist = createIpAllowlist(["127.0.0.1", "::1", "10.0.0.0/8", "203.0.113.5/32"]);

  assert.equal(allowlist("127.0.0.1"), true);
  assert.equal(allowlist("::1"), true);
  assert.equal(allowlist("10.9.8.7"), true);
  assert.equal(allowlist("203.0.113.5"), true);
  assert.equal(allowlist("203.0.113.6"), false);
});

test("trust-boundary parsing rejects ambiguous and suffix-bearing address literals", () => {
  const allowlist = createIpAllowlist(["127.0.0.1", "10.0.0.0/8"]);

  assert.equal(allowlist("::ffff:10.0.0.1"), true);
  assert.equal(allowlist("012.0.0.1"), false);
  assert.equal(allowlist("010.0.0.1"), false);
  assert.equal(allowlist("10.0.0.1/0"), false);
  assert.equal(allowlist("127.0.0.1/0"), false);
  assert.equal(allowlist("::ffff:012.0.0.1"), false);

  assert.equal(resolveClientIp(request({
    remoteAddress: "127.0.0.1",
    forwardedFor: "012.0.0.1"
  }), { trustedProxyCidrs: ["127.0.0.1/32"] }), "");
});

test("IP helpers reject malformed IPv4 addresses and CIDR rules", () => {
  assert.equal(isPrivateOrLoopbackIp("127.0.0.1:1234"), false);
  assert.equal(isPrivateOrLoopbackIp("10x.0.0.1"), false);
  assert.equal(isPrivateOrLoopbackIp("192.168.1.5zzz"), false);

  assert.equal(createIpAllowlist(["0.0.0.0/0junk"])("203.0.113.1"), false);
  assert.equal(createIpAllowlist(["10.0.0.0/8junk"])("10.1.2.3"), false);
  assert.equal(createIpAllowlist(["10.0.0.0/8/garbage"])("10.1.2.3"), false);
  assert.equal(createIpAllowlist(["203.0.113.5/32junk"])("203.0.113.5"), false);
  assert.equal(createIpAllowlist(["203.0.113.5/32/garbage"])("203.0.113.5"), false);
  assert.equal(createIpAllowlist(["2001:db8::/32"])("2001:db8::1"), false);
});
