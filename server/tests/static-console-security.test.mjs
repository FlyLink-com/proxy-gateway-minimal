import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function publicIndexSource() {
  return readFileSync(new URL("../../public/index.html", import.meta.url), "utf8");
}

test("legacy static console keeps console tokens out of browser storage", () => {
  const source = publicIndexSource();

  assert.doesNotMatch(source, /localStorage|sessionStorage|console_token/);
});

test("legacy static console avoids string HTML sinks for API-rendered data", () => {
  const source = publicIndexSource();

  assert.doesNotMatch(source, /\.innerHTML\s*=/);
});
