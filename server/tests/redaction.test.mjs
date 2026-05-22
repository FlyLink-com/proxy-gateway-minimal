import assert from "node:assert/strict";
import test from "node:test";
import {
  redactAuthorizationHeader,
  redactRequestTarget
} from "../services/redaction.mjs";

test("redactRequestTarget redacts token query values and preserves diagnostics", () => {
  assert.equal(
    redactRequestTarget("/sub/clash.yaml?token=pgsub_secret&client=clash"),
    "/sub/clash.yaml?token=[redacted]&client=clash"
  );
  assert.equal(
    redactRequestTarget("https://gateway.example.com/sub/clash.yaml?token=pgtmp_secret"),
    "https://gateway.example.com/sub/clash.yaml?token=[redacted]"
  );
});

test("redactRequestTarget leaves non-token URLs readable", () => {
  assert.equal(redactRequestTarget("/api/health?probe=1"), "/api/health?probe=1");
});

test("redactAuthorizationHeader redacts bearer tokens", () => {
  assert.equal(redactAuthorizationHeader("Bearer pgsub_secret"), "Bearer [redacted]");
  assert.equal(redactAuthorizationHeader("Basic abc"), "Basic abc");
  assert.equal(redactAuthorizationHeader(""), "");
});
