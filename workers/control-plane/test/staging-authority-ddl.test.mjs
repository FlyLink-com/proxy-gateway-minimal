// Safeguard: manual isolated Staging DDL must be byte-for-byte identical
// to the reviewed Worker local slice, excluding only the leading comments.
// This directory is intentionally NOT Wrangler's migrations_dir.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source=new URL("../migrations/0005_writer_authority_guard_slice.sql",import.meta.url);
const staging=new URL("../staging-sql/authority-guard-v1.sql",import.meta.url);
const sqlBody=(text)=>{
  const start=text.indexOf("CREATE TABLE platform_writer_authority");
  assert.notEqual(start,-1);
  return text.slice(start).trim();
};
test("manual Primary Staging DDL matches exactly the reviewed local epoch-fence migration",async()=>{
  const [a,b]=await Promise.all([readFile(source,"utf8"),readFile(staging,"utf8")]);
  assert.equal(sqlBody(b),sqlBody(a));
  assert.equal((b.match(/CREATE TRIGGER /g)||[]).length,4);
  assert.equal((b.match(/CREATE TABLE /g)||[]).length,2);
  assert.match(b,/VALUES \(1, 'BWH', 'BWH_ACTIVE', 1,/);
  assert.doesNotMatch(b,/DROP TABLE|DROP TRIGGER|INSERT INTO platform_accounts/i);
});
