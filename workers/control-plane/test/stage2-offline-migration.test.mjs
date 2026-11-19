import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createWorker } from "./helpers.mjs";
import {
  Stage2MigrationError, STAGE2_SYNTHETIC_TABLES,
  stage2Digest, beginStage2Run, applyStage2Batch, reconcileStage2Snapshot,
} from "../src/stage2-offline-migration.mjs";

const epoch=3, t="2026-11-20T00:00:00.000Z", later="2026-11-21T00:00:00.000Z";
const h="a".repeat(64), h2="b".repeat(64), h3="c".repeat(64);
const acct=(id,status="active",updated_at=t)=>({id,status,created_at:t,updated_at});
const entitlement=(id,account_id)=>({
  id,account_id,plan:"synth-monthly",status:"active",valid_from:t,valid_until:later,
});
const manifest=(runId="synth-stage2-run-a",sourceSnapshotId="synth-snapshot-a",tables=STAGE2_SYNTHETIC_TABLES)=>({
  runId,sourceSnapshotId,sourceSchemaSha256:h,
  mappingSha256:h2,targetSchemaSha256:h3,tables,
});
async function batch({runId="synth-stage2-run-a",table="platform_accounts",
    sequence=1,startAfterPk=null,changes}){
  const unsigned={runId,table,sequence,startAfterPk,changes};
  return {...unsigned,payloadSha256:await stage2Digest(unsigned)};
}
const change=async (projection,previousFingerprint=null)=>({
  op:"upsert",pk:projection.id,previousFingerprint,projection,
});
const remove=(pk,previousFingerprint)=>({op:"delete",pk,previousFingerprint,projection:null});

async function setup(opts={}) {
  const result=await createWorker({seed:false,withAgent:false,...opts});
  const sql=await readFile(new URL("./fixtures/stage2-offline-inbox.sql",import.meta.url),"utf8");
  const stmts=sql.split("-- STAGE2_STATEMENT").map((part)=>
    part.split("\n").filter(x=>!x.trimStart().startsWith("--")).join("\n").trim()
      .replace(/;\s*$/,"")).filter(Boolean);
  assert.equal(stmts.length,8);
  await result.db.batch(stmts.map(sql=>result.db.prepare(sql)));
  return result;
}
async function count(db,table){
  return (await db.prepare("SELECT COUNT(*) AS n FROM "+table).first()).n;
}

test("S2A-01 offline staging schema is isolated; BWH_DEFAULT cannot start D1 ingest",async(ti)=>{
  const {mf,db}=await setup({writerPhase:"BWH_ACTIVE"});ti.after(()=>mf.dispose());
  assert.equal(await count(db,"stage2_rehearsal_runs"),0);
  await assert.rejects(beginStage2Run(db,{epoch:1,manifest:manifest()}),{
    name:"WriterAuthorityError",code:"writer_authority_not_d1"
  });
  assert.equal(await count(db,"stage2_rehearsal_runs"),0);
  assert.equal((await db.prepare(
    "SELECT authority,phase,epoch FROM platform_writer_authority"
  ).first()).phase,"BWH_ACTIVE");
});

test("S2A-02 D1_ACTIVE synthetic import has atomic manifest, table checkpoints and exact replay",async(ti)=>{
  const {mf,db}=await setup();ti.after(()=>mf.dispose());
  assert.deepEqual(await beginStage2Run(db,{epoch,manifest:manifest()}),{created:true});
  assert.deepEqual(await beginStage2Run(db,{epoch,manifest:manifest()}),{created:false});
  const row1=acct("synth-acct-001"),row2=acct("synth-acct-002","suspended");
  const first=await batch({changes:[await change(row1),await change(row2)]});
  assert.deepEqual(await applyStage2Batch(db,{epoch,batch:first}),{
    replayed:false,rows:2,sequence:1,lastPk:"synth-acct-002"
  });
  assert.deepEqual(await applyStage2Batch(db,{epoch,batch:first}),{replayed:true,rows:0});
  const checkpoint=await db.prepare(
    "SELECT last_sequence,last_pk FROM stage2_rehearsal_checkpoints WHERE run_id=? AND table_name=?"
  ).bind(first.runId,first.table).first();
  assert.deepEqual(checkpoint,{last_sequence:1,last_pk:"synth-acct-002"});
  assert.equal(await count(db,"stage2_rehearsal_rows"),2);
  assert.equal(await count(db,"stage2_rehearsal_operations"),2);
  assert.equal(await count(db,"stage2_rehearsal_batches"),1);
  const expected={
    platform_accounts:[
      {pk:row1.id,fingerprint:await stage2Digest(row1)},
      {pk:row2.id,fingerprint:await stage2Digest(row2)}
    ],platform_entitlements:[]
  };
  const receipt=await reconcileStage2Snapshot(db,{runId:first.runId,expected});
  assert.equal(receipt.tables[0].count,2);
  assert.equal(receipt.tables[1].count,0);
  assert.match(receipt.digest,/^[0-9a-f]{64}$/);
});

test("S2A-03 stale checkpoint and out-of-order page reject without partial data",async(ti)=>{
  const {mf,db}=await setup();ti.after(()=>mf.dispose());
  await beginStage2Run(db,{epoch,manifest:manifest()});
  const wrongSeq=await batch({
    sequence:2,changes:[await change(acct("synth-acct-003"))]
  });
  await assert.rejects(applyStage2Batch(db,{epoch,batch:wrongSeq}),{
    code:"stage2_checkpoint_conflict"
  });
  const wrongCursor=await batch({
    startAfterPk:"synth-acct-000",changes:[await change(acct("synth-acct-003"))]
  });
  await assert.rejects(applyStage2Batch(db,{epoch,batch:wrongCursor}),{
    code:"stage2_checkpoint_conflict"
  });
  assert.equal(await count(db,"stage2_rehearsal_rows"),0);
  assert.equal(await count(db,"stage2_rehearsal_batches"),0);
  assert.equal((await db.prepare(
    "SELECT last_sequence FROM stage2_rehearsal_checkpoints WHERE table_name='platform_accounts'"
  ).first()).last_sequence,0);
});

test("S2A-04 failed last operation rolls back earlier upserts and checkpoint atomically",async(ti)=>{
  const {mf,db}=await setup();ti.after(()=>mf.dispose());
  await beginStage2Run(db,{epoch,manifest:manifest()});
  const invalid=await batch({changes:[
    await change(acct("synth-acct-003")),
    await change(acct("synth-acct-004"),"0".repeat(64)),
  ]});
  await assert.rejects(applyStage2Batch(db,{epoch,batch:invalid}),{
    code:"stage2_previous_fingerprint_conflict"
  });
  for(const table of ["stage2_rehearsal_rows","stage2_rehearsal_operations","stage2_rehearsal_batches"]){
    assert.equal(await count(db,table),0,table);
  }
  const good=await batch({changes:[await change(acct("synth-acct-003"))]});
  assert.equal((await applyStage2Batch(db,{epoch,batch:good})).rows,1);
});

test("S2A-05 successive snapshot deltas update/delete and reconcile exactly",async(ti)=>{
  const {mf,db}=await setup();ti.after(()=>mf.dispose());
  const a=acct("synth-acct-001"),b=acct("synth-acct-002");
  await beginStage2Run(db,{epoch,manifest:manifest()});
  await applyStage2Batch(db,{epoch,batch:await batch({changes:[await change(a),await change(b)]})});
  const ent=entitlement("synth-ent-001",a.id);
  await applyStage2Batch(db,{epoch,batch:await batch({
    table:"platform_entitlements",changes:[await change(ent)]
  })});
  const changed=acct(a.id,"suspended",later),newer=acct("synth-acct-003");
  const secondManifest=manifest("synth-stage2-run-b","synth-snapshot-b");
  await beginStage2Run(db,{epoch,manifest:secondManifest});
  const update=await batch({runId:secondManifest.runId,changes:[
    await change(changed,await stage2Digest(a)),
    remove(b.id,await stage2Digest(b)),
    await change(newer)
  ]});
  assert.equal((await applyStage2Batch(db,{epoch,batch:update})).rows,3);
  const expected={platform_accounts:[
    {pk:changed.id,fingerprint:await stage2Digest(changed)},
    {pk:newer.id,fingerprint:await stage2Digest(newer)}
  ],platform_entitlements:[{pk:ent.id,fingerprint:await stage2Digest(ent)}]};
  const res=await reconcileStage2Snapshot(db,{runId:secondManifest.runId,expected});
  assert.equal(res.tables[0].count,2);
  assert.equal(res.tables[1].count,1);
  assert.equal(await count(db,"stage2_rehearsal_operations"),6);
  assert.equal(await count(db,"stage2_rehearsal_rows"),3);
  const mismatched=structuredClone(expected);
  mismatched.platform_accounts[0].fingerprint="0".repeat(64);
  await assert.rejects(reconcileStage2Snapshot(db,{runId:secondManifest.runId,expected:mismatched}),{
    code:"stage2_reconciliation_mismatch"
  });
});

test("S2A-06 corrupted payload cannot advance checkpoint or add operations",async(ti)=>{
  const {mf,db}=await setup();ti.after(()=>mf.dispose());
  await beginStage2Run(db,{epoch,manifest:manifest()});
  const x=await batch({changes:[await change(acct("synth-acct-001"))]});
  x.payloadSha256="0".repeat(64);
  await assert.rejects(applyStage2Batch(db,{epoch,batch:x}),{code:"stage2_payload_mismatch"});
  assert.equal(await count(db,"stage2_rehearsal_batches"),0);
});

test("S2A-07 a committed batch cannot replay with changed payload or source mapping",async(ti)=>{
  const {mf,db}=await setup();ti.after(()=>mf.dispose());
  await beginStage2Run(db,{epoch,manifest:manifest()});
  const x=await batch({changes:[await change(acct("synth-acct-001"))]});
  await applyStage2Batch(db,{epoch,batch:x});
  const y=await batch({changes:[await change(acct("synth-acct-001","suspended"))]});
  await assert.rejects(applyStage2Batch(db,{epoch,batch:y}),{code:"stage2_replay_conflict"});
  await assert.rejects(beginStage2Run(db,{epoch,manifest:{...manifest(),mappingSha256:h3}}),{
    code:"stage2_run_conflict"
  });
  assert.equal(await count(db,"stage2_rehearsal_batches"),1);
});

test("S2A-08 sensitive columns, foreign identifiers and extra projections are denied",async(ti)=>{
  const {mf,db}=await setup();ti.after(()=>mf.dispose());
  await beginStage2Run(db,{epoch,manifest:manifest()});
  const original=acct("synth-acct-001");
  const variants=[
    {...original,email:"person@example.com"},
    {...original,metadata_json:"{}"},
    {...original,status:"unknown"},
    {...original,id:"real-customer-account-123"},
  ];
  for(const [index,projection] of variants.entries()){
    const b=await batch({changes:[{
      op:"upsert",pk:projection.id,previousFingerprint:null,projection
    }]});
    // A non-synthetic PK is rejected at the batch envelope boundary;
    // unsafe fields on a valid synthetic ID fail the projection allowlist.
    await assert.rejects(applyStage2Batch(db,{epoch,batch:b}),{
      code:index===3?"stage2_batch_invalid":"stage2_projection_denied"
    });
  }
  assert.equal(await count(db,"stage2_rehearsal_rows"),0);
});

test("S2A-09 unapproved table, malformed manifest and incomplete reconciliation deny",async(ti)=>{
  const {mf,db}=await setup();ti.after(()=>mf.dispose());
  await assert.rejects(beginStage2Run(db,{epoch,manifest:manifest("synth-run-c","synth-snapshot-c",["platform_payment_receipts"])}),{
    code:"stage2_manifest_invalid"
  });
  await beginStage2Run(db,{epoch,manifest:manifest()});
  const x=await batch({table:"platform_payment_receipts",changes:[await change(acct("synth-acct-001"))]});
  await assert.rejects(applyStage2Batch(db,{epoch,batch:x}),{code:"stage2_batch_invalid"});
  await assert.rejects(reconcileStage2Snapshot(db,{
    runId:"synth-stage2-run-a",expected:{platform_accounts:[]}
  }),{code:"stage2_reconciliation_invalid"});
});

test("S2A-10 authority withdraw after source preflight aborts staging ingest",async(ti)=>{
  const {mf,db}=await setup();ti.after(()=>mf.dispose());
  await beginStage2Run(db,{epoch,manifest:manifest()});
  await db.prepare(
    "UPDATE platform_writer_authority SET authority='D1',phase='RECOVERY',epoch=4, "+
    "changed_at='2026-11-20T00:00:03.000Z' WHERE singleton=1"
  ).run();
  const x=await batch({changes:[await change(acct("synth-acct-001"))]});
  await assert.rejects(applyStage2Batch(db,{epoch,batch:x}),{
    code:"writer_authority_not_d1"
  });
  assert.equal(await count(db,"stage2_rehearsal_batches"),0);
});

test("S2A-11 rejected update/delete previous hash never mutates committed staging rows",async(ti)=>{
  const {mf,db}=await setup();ti.after(()=>mf.dispose());
  await beginStage2Run(db,{epoch,manifest:manifest()});
  const original=acct("synth-acct-001");
  await applyStage2Batch(db,{epoch,batch:await batch({changes:[await change(original)]})});
  const next=await batch({runId:"synth-stage2-run-a",sequence:2,
    startAfterPk:"synth-acct-001",
    changes:[remove("synth-acct-002","0".repeat(64))]});
  await assert.rejects(applyStage2Batch(db,{epoch,batch:next}),{
    code:"stage2_previous_fingerprint_conflict"
  });
  const retained=await db.prepare(
    "SELECT projection_json FROM stage2_rehearsal_rows WHERE table_name='platform_accounts' AND pk=?"
  ).bind(original.id).first();
  assert.deepEqual(JSON.parse(retained.projection_json),original);
  assert.equal(await count(db,"stage2_rehearsal_batches"),1);
});
