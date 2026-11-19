import assert from "node:assert/strict";
import test from "node:test";
import { createWorker } from "./helpers.mjs";
import { createEpochFencedD1 } from "../src/epoch-fenced-d1.mjs";
import { WriterAuthorityRepository } from "../src/writer-authority.mjs";

const origin = "http://control-plane.local";
const desiredUrl = origin + "/v1/agent/desired-state?nodeRef=node-synth-01&channelRefs=chan-synth-hy2,chan-synth-vless";

function agentHeaders(agent, epoch = "3") {
  return {
    authorization: "Bearer " + agent.token,
    "x-agent-key-id": agent.keyId,
    "x-agent-node-ref": agent.nodeRef,
    "x-agent-timestamp": new Date().toISOString(),
    "x-agent-nonce": "nonce-" + crypto.randomUUID(),
    "idempotency-key": "claim:node-synth-01:" + crypto.randomUUID(),
    ...(epoch === null ? {} : { "x-writer-epoch": epoch }),
  };
}

async function find(db, sql) { return db.prepare(sql).first(); }
const stateSql = "SELECT COUNT(*) AS n FROM agent_request_nonces";

test("G4 desired-state GET is write-bearing: BWH/FROZEN/RECOVERY reject before nonce and claims", async (t) => {
  for (const [writerPhase, epoch] of [["BWH_ACTIVE","1"], ["FROZEN","2"], ["RECOVERY","4"]]) {
    const { mf, db, agent } = await createWorker({writerPhase});
    t.after(() => mf.dispose());
    const response = await mf.dispatchFetch(desiredUrl, { headers: agentHeaders(agent, epoch) });
    assert.equal(response.status, 503, writerPhase);
    assert.equal((await response.json()).error.code, "writer_authority_not_d1");
    assert.equal((await find(db, stateSql)).n, 0);
    assert.equal((await find(db, "SELECT COUNT(*) AS n FROM agent_manifest_claims")).n, 0);
  }
});

test("G4 missing/stale/invalid epoch reject before Agent nonce consumption", async (t) => {
  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());
  for (const [epoch, status, code] of [
    [null,400,"writer_epoch_required"],
    ["0",400,"writer_epoch_required"],
    ["2",409,"writer_epoch_stale"],
    ["4",409,"writer_epoch_stale"],
    ["003",400,"writer_epoch_required"]
  ]) {
    const response = await mf.dispatchFetch(desiredUrl, {headers:agentHeaders(agent,epoch)});
    assert.equal(response.status,status,"epoch="+epoch);
    assert.equal((await response.json()).error.code,code);
  }
  assert.equal((await find(db,stateSql)).n,0);
});

test("G4 valid D1 epoch issues claim and records nonce through the fenced D1 adapter", async (t) => {
  const { mf, db, agent } = await createWorker();
  t.after(() => mf.dispose());
  const response = await mf.dispatchFetch(desiredUrl, { headers: agentHeaders(agent) });
  assert.equal(response.status,200);
  assert.equal((await response.json()).manifest.nodeRef,agent.nodeRef);
  assert.equal((await find(db,stateSql)).n,1);
  assert.equal((await find(db,"SELECT COUNT(*) AS n FROM agent_manifest_claims")).n,1);
});

test("fenced D1 .run, .batch atomically reject stale epochs and preserve original rows", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const fenced=createEpochFencedD1(db,3);
  assert.deepEqual(await new WriterAuthorityRepository(db).assertWritable(3),{
    authority:"D1",phase:"D1_ACTIVE",epoch:3
  });
  const update=()=>fenced.prepare("UPDATE platform_accounts SET status = ? WHERE id = ?")
    .bind("disabled","acct-pg-101");
  await update().run();
  assert.equal((await find(db,"SELECT status FROM platform_accounts WHERE id='acct-pg-101'")).status,"disabled");
  // D1 batch atomicity: a valid UPDATE and a duplicate-key INSERT must roll back.
  await assert.rejects(fenced.batch([
    fenced.prepare("UPDATE platform_accounts SET status = 'suspended' WHERE id = 'acct-pg-101'"),
    fenced.prepare("INSERT INTO platform_accounts (id,owner_ref,status,created_at,updated_at) SELECT id,owner_ref,status,created_at,updated_at FROM platform_accounts WHERE id='acct-pg-101'")
  ]));
  assert.equal((await find(db,"SELECT status FROM platform_accounts WHERE id='acct-pg-101'")).status,"disabled");

  // Another authority transition commits *before* a stale request's batch.
  await db.prepare(
    "UPDATE platform_writer_authority SET phase='RECOVERY', epoch=4, changed_at='2026-11-20T00:00:04.000Z' WHERE singleton=1"
  ).run();
  await assert.rejects(update().run(),{name:"WriterAuthorityError",code:"writer_epoch_stale"});
  await assert.rejects(fenced.batch([
    fenced.prepare("UPDATE platform_accounts SET status='suspended' WHERE id='acct-pg-101'"),
    fenced.prepare("UPDATE platform_accounts SET status='disabled' WHERE id='acct-pg-102'")
  ]),{name:"WriterAuthorityError",code:"writer_epoch_stale"});
  assert.equal((await find(db,"SELECT status FROM platform_accounts WHERE id='acct-pg-101'")).status,"disabled");
  assert.equal((await find(db,"SELECT status FROM platform_accounts WHERE id='acct-pg-102'")).status,"active");
});

test("fenced D1 rejects raw statements, CTE mutation on read methods, exec and unreviewed SQL", async(t)=>{
  const { mf, db } = await createWorker();
  t.after(()=>mf.dispose());
  const fenced=createEpochFencedD1(db,3);
  assert.throws(()=>fenced.exec("INSERT INTO platform_accounts VALUES (...)"),{code:"writer_unfenced_exec_denied"});
  assert.throws(()=>fenced.prepare("UPDATE platform_accounts SET status = 'disabled'").all(),
    {code:"writer_query_method_denied"});
  assert.throws(()=>fenced.prepare("UPDATE platform_accounts SET status = 'disabled' RETURNING id").first(),
    {code:"writer_query_method_denied"});
  assert.throws(()=>fenced.prepare("WITH suspect AS (SELECT 1) DELETE FROM platform_accounts").first(),
    {code:"writer_query_method_denied"});
  await assert.rejects(fenced.batch([
    db.prepare("UPDATE platform_accounts SET status = 'disabled' WHERE id = 'acct-pg-101'")
  ]),{code:"writer_unfenced_statement_denied"});
  const row=await fenced.prepare("SELECT status FROM platform_accounts WHERE id = ?").bind("acct-pg-101").first();
  assert.equal(row.status,"active");
});
