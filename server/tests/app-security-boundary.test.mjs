import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("payment callback is only mounted through the default-off recharge router", async () => {
  const source = await readFile(new URL("../app.mjs", import.meta.url), "utf8");
  assert.match(source, /coinRechargeEnabled/u);
  assert.match(source, /portal-coin-recharge/u);
  assert.doesNotMatch(source, /clientSecret|webhookId|access_token/u);
});
