// Local synthetic tests: pure probe exports only; main/SSH/production paths are never invoked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { FILES, decodeCheckpoint, analyze, PROBE_LIMITS, assertProbeBounds, candidateWorkingDirectoryMatchesApp } from '../../scripts/traffic-full-metering-proof-readonly.mjs';
import { fullMeteringDigest as digest } from '../../scripts/lib/full-metering-journal.mjs';
import { fullMeteringBindingIdentity as identity } from '../../scripts/lib/full-metering-sample-writer.mjs';
import { admitFullMeteringPlanSwitches as admit, planSwitchContinuationHistory as history } from '../../scripts/lib/full-metering-plan-switch-continuation.mjs';
import { readFullMeteringPlanSwitchProof } from '../../scripts/lib/full-metering-plan-switch-proof.mjs';
import { assertFullMeteringCheckpointScope as assertScope, fullMeteringChannels } from '../../scripts/lib/full-metering-scope.mjs';
import { transitionFullMeteringCounters } from '../services/edge/full-metering-counter-transition.mjs';
import { assertNoDuplicateObjectKeys as scan } from '../services/deployment/strict-json-scan.mjs';
import { deriveCommerceOperationRefs } from '../services/platform/coin-commerce-domain.mjs';
import { PLAN_SWITCH_TIERS } from '../services/platform/coin-commerce-plan-switch-policy.mjs';
import { execFileSync } from 'node:child_process';

const api={digest,identity,admit,history,assertScope},scope='local-three-v1';
const [BASIC,PLUS]=PLAN_SWITCH_TIERS,channels=fullMeteringChannels(scope);
const FROM='2026-10-01T00:00:00.000Z',UNTIL='2026-10-31T00:00:00.000Z';
const BOUNDARY='2026-10-12T00:00:00.000Z',AT='2026-10-12T00:00:01.000Z',NOW='2026-10-12T00:00:02.000Z';
const hash=x=>createHash('sha256').update(x).digest('hex');
const context={scopeDigest:'a'.repeat(64),databaseIdentityDigest:'b'.repeat(64),meteringScope:scope};
const stubProof=args=>({ok:true,proof:{version:1,kind:'commerce_billing_chain',
  fromIdentityDigest:digest(args.previousIdentity),toIdentityDigest:digest(args.currentIdentity),
  evidenceDigest:'c'.repeat(64),transitionCount:1,changedAt:AT}});
function fixture(changed=true){
  const entries=channels.map((source,index)=>identity({...source,edgeCredentialRef:`synthetic-ref-${index}`,accountId:'acct_synthetic',
    entitlementId:'ent_synthetic',requestId:'request_synthetic',materialDigest:'synthetic-material-digest',
    billingBinding:{plan:BASIC.offerVersionRef,validFrom:FROM,validUntil:UNTIL}}));
  const checkpoint={version:1,activationId:'bwh-local-three-20261009-01',meteringScope:scope,sequence:7,startedAt:FROM,
    sources:channels.map((source,index)=>({channelRef:source.channelRef,identities:[structuredClone(entries[index])],counterState:transitionFullMeteringCounters({state:null,...source,
      generation:'f'.repeat(64),eligibleRefs:[entries[index].edgeCredentialRef],retainedRefs:[],minObservedAt:FROM,observedAt:BOUNDARY,now:BOUNDARY,
      observations:[{edgeCredentialRef:entries[index].edgeCredentialRef,uploadBytes:100,downloadBytes:80,...(source.mode==='connections'?{connectionId:'synthetic-connection'}:{})}]}).nextState}))};
  if(changed)entries.forEach(entry=>{entry.billingBinding.plan=PLUS.offerVersionRef;});
  const f={checkpoint,inventory:{entries,retainedBindings:[]}};
  f.run=(readProof=stubProof)=>analyze({...f,api,readProof,now:NOW});return f;
}
function bytes(payload=fixture().checkpoint,overrides={}){
  const body={version:1,context,payload},envelope={...body,digest:digest(body),...overrides};return Buffer.from(JSON.stringify(envelope));
}
function compressed(raw,declared=raw.length){const header=Buffer.alloc(16);Buffer.from('GCCFMJ2\n').copy(header);header.writeBigUInt64LE(BigInt(declared),8);return Buffer.concat([header,gzipSync(raw)]);}
const decode=raw=>decodeCheckpoint(raw,context,digest,scan);
const journalRejected=raw=>assert.throws(()=>decode(raw),e=>e.safeCode==='journal_invalid');

test('exact 49 path/hash/byte pins remain frozen and match collector source blobs at e834185c',()=>{
  assert.equal(FILES.length,49);assert.equal(new Set(FILES.map(x=>x[0])).size,49);
  assert.ok(Object.isFrozen(FILES)&&FILES.every(Object.isFrozen));
  const sourceFiles=FILES.filter(([path])=>!path.startsWith('node_modules/'));
  assert.equal(sourceFiles.length,30);
  assert.equal(FILES.filter(([path])=>path.startsWith('node_modules/')).length,19);
  const pin='e834185cca073455d8ac314cdf908ec8fc4c5e8d';
  for(const [path,sha256,bytes]of sourceFiles){
    const data=execFileSync('git',['show',`${pin}:${path}`],{windowsHide:true});
    assert.equal(data.length,bytes);
    assert.equal(hash(data),sha256);
  }
});
const APP='/opt/proxy-gateway-minimal-candidate/releases/control-plane-pr772-63dd535428a2-mixed-reset764-guard767';
const CURRENT='/opt/proxy-gateway-minimal-candidate/current';
test('candidate working directory accepts the current symlink only when it resolves to APP',()=>{
  assert.equal(candidateWorkingDirectoryMatchesApp(CURRENT,APP,CURRENT,path=>{assert.equal(path,CURRENT);return APP;}),true);
});
test('candidate working directory rejects the current symlink when it resolves elsewhere',()=>{
  assert.equal(candidateWorkingDirectoryMatchesApp(CURRENT,APP,CURRENT,()=>'/opt/proxy-gateway-minimal-candidate/releases/other'),false);
});
test('candidate working directory rejects an arbitrary path even if that path would resolve to APP',()=>{
  assert.equal(candidateWorkingDirectoryMatchesApp('/tmp/not-the-candidate',APP,CURRENT,()=>{throw new Error('realpath_not_allowed');}),false);
});
test('candidate working directory accepts the APP path without resolving a symlink',()=>{
  assert.equal(candidateWorkingDirectoryMatchesApp(APP,APP,CURRENT,()=>{throw new Error('realpath_not_allowed');}),true);
  const source=readFileSync(new URL('../../scripts/traffic-full-metering-proof-readonly.mjs',import.meta.url),'utf8');
  assert.match(source,/candidateWorkingDirectoryMatchesApp\(row\.WorkingDirectory,APP,BASE\+'\/current',fs\.realpathSync\)&&fs\.realpathSync\('\/proc\/'\+row\.MainPID\+'\/cwd'\)===APP/);
});
test('probe bounds reject overrun time and memory without reading production inputs',()=>{
  assert.equal(PROBE_LIMITS.maxDurationMs,30000);
  assert.equal(PROBE_LIMITS.maxRssBytes,256*1024*1024);
  assert.doesNotThrow(()=>assertProbeBounds(Date.now()-1000,{rss:1024}));
  assert.throws(()=>assertProbeBounds(Date.now()-PROBE_LIMITS.maxDurationMs-1,{rss:1024}),e=>e.safeCode==='time_limit');
  assert.throws(()=>assertProbeBounds(Date.now(),{rss:PROBE_LIMITS.maxRssBytes+1}),e=>e.safeCode==='memory_limit');
});
test('importing the probe does not invoke main or print a production receipt',()=>{
  assert.equal(typeof analyze,'function');
  assert.equal(typeof decodeCheckpoint,'function');
});
test('plain checkpoint decodes using actual canonical digest and strict JSON scanner',()=>{const f=fixture();assert.deepEqual(decode(bytes(f.checkpoint)),f.checkpoint);});
test('GCCFMJ2 compressed checkpoint decodes identically',()=>{const f=fixture();assert.deepEqual(decode(compressed(bytes(f.checkpoint))),f.checkpoint);});
test('bad payload digest and mismatched context fail closed',()=>{
  journalRejected(bytes(undefined,{digest:'0'.repeat(64)}));
  const other={...context,scopeDigest:'d'.repeat(64)},body={version:1,context:other,payload:fixture().checkpoint};journalRejected(Buffer.from(JSON.stringify({...body,digest:digest(body)})));
});
test('duplicate JSON key and malformed JSON fail closed',()=>{
  journalRejected(Buffer.from(bytes().toString().replace('"version":1','"version":1,"version":1')));journalRejected(Buffer.from('{not-json'));
});
test('oversized plain/compressed declarations, mismatch, empty and corrupted compression fail closed',()=>{
  journalRejected(Buffer.alloc(32*1024*1024+1,32));journalRejected(compressed(bytes(),256*1024*1024+1));
  journalRejected(compressed(bytes(),0));journalRejected(compressed(bytes(),bytes().length+1));
  const broken=compressed(bytes());broken[broken.length-8]^=255;journalRejected(broken);journalRejected(Buffer.from('GCCFMJ2\n'));
});
test('real three-protocol identities plus real admission accept valid stub proof without input mutation',()=>{
  const f=fixture(),before=structuredClone({checkpoint:f.checkpoint,inventory:f.inventory}),r=f.run();
  assert.equal(r.summary.changed,3);assert.equal(r.summary.proofCalls,3);assert.equal(r.summary.proofPassed,3);assert.equal(r.summary.admitted,3);assert.equal(r.summary.admissionPassed,true);
  assert.deepEqual(Object.keys(r.summary.perSource).sort(),['hy2','tuic','vless']);for(const row of Object.values(r.summary.perSource))assert.equal(row.billingChanged,1);
  assert.deepEqual({checkpoint:f.checkpoint,inventory:f.inventory},before);assert.equal(r.summary.counterStateValidated,false);assert.equal(r.summary.historyCountsOnly,true);
  assert.doesNotMatch(JSON.stringify(r.summary),/acct_synthetic|synthetic-ref|request_synthetic|ent_synthetic|evidenceDigest|fromIdentityDigest/);
});
test('unproven stub result stops admission and does not invent permission',()=>{
  const r=fixture().run(()=>({ok:false,reason:'full_metering_plan_switch_unproven'}));assert.equal(r.summary.admissionPassed,false);assert.equal(r.summary.admitted,0);assert.equal(r.summary.proofCalls,1);assert.equal(r.summary.proofPassed,0);
});
test('missing proof shape is denied by actual admission',()=>{const r=fixture().run(()=>({ok:true,proof:{}}));assert.equal(r.summary.admissionPassed,false);assert.equal(r.summary.admitted,0);});
test('material drift is refused before proof callback',()=>{
  const f=fixture();f.inventory.entries[0].materialDigest='synthetic-other';let called=0;
  const r=f.run(args=>{called++;return stubProof(args);});assert.equal(called,0);assert.equal(r.summary.admissionPassed,false);assert.equal(r.summary.perSource.vless.otherChanged,1);
});
test('unchanged identities need no proof',()=>{const r=fixture(false).run(()=>{throw new Error('unexpected-proof');});assert.equal(r.summary.admitted,0);assert.equal(r.summary.changed,0);assert.equal(r.summary.proofCalls,0);});
test('retained matching material and missing identity are distinct aggregate classifications',()=>{
  const f=fixture(false),[retired]=f.inventory.entries.splice(0,1);f.inventory.retainedBindings.push(retired);f.inventory.entries.splice(0,1);
  const r=f.run();assert.equal(r.summary.perSource.vless.retained,1);assert.equal(r.summary.perSource.vless.missing,0);assert.equal(r.summary.perSource.hy2.missing,1);assert.equal(r.summary.perSource.tuic.unchanged,1);
  assert.equal(r.summary.counterStateValidated,false); // Admission only is intentionally not a full binding/counter readiness verdict.
});
test('retained material mismatch is counted missing, not accepted retention',()=>{
  const f=fixture(false),[retired]=f.inventory.entries.splice(0,1);f.inventory.retainedBindings.push({...retired,materialDigest:'synthetic-other'});
  const r=f.run();assert.equal(r.summary.perSource.vless.retained,0);assert.equal(r.summary.perSource.vless.missing,1);
});
test('reactivation archive counts do not pretend to validate the counter state',()=>{
  const f=fixture(),state=f.checkpoint.sources[0].counterState,ref=f.checkpoint.sources[0].identities[0].edgeCredentialRef;
  state.retainedRefs.push(ref);let r=f.run();assert.equal(r.summary.perSource.vless.reactivationCandidates,1);assert.equal(r.summary.perSource.vless.archiveMissing,1);
  state.archivedRefs.push(ref);state.retiredEntries.push({edgeCredentialRef:ref});r=f.run();assert.equal(r.summary.perSource.vless.archiveMissing,0);assert.equal(r.summary.counterStateValidated,false);
});
test('actual plan-history validation refuses a full 128-entry append capacity',()=>{
  const f=fixture(),change={channelRef:f.inventory.entries[0].channelRef,edgeCredentialRef:f.inventory.entries[0].edgeCredentialRef,
    proof:stubProof({previousIdentity:f.checkpoint.sources[0].identities[0],currentIdentity:f.inventory.entries[0]}).proof};
  f.checkpoint.planSwitchContinuations=Array.from({length:128},(_,i)=>{const d=i.toString(16).padStart(64,'0');return{version:1,previousCheckpointDigest:d,completedAt:NOW,identityCount:1,unassignedBytes:null,archiveName:`plan-switch-before-${d}.json`,changes:[change]};});
  const r=f.run();assert.equal(r.summary.planHistoryRemaining,0);assert.equal(r.summary.admissionPassed,false);assert.equal(r.summary.admitted,0);
  f.checkpoint.planSwitchContinuations.push(structuredClone(f.checkpoint.planSwitchContinuations[0]));assert.throws(()=>f.run(),e=>e.code==='full_metering_plan_switch_unproven');
});
test('reactivation history above capacity is rejected',()=>{const f=fixture();f.checkpoint.sources[0].counterState.planSwitchReactivations=Array(129).fill({});assert.throws(()=>f.run(),e=>e.safeCode==='history_invalid');});
test('duplicate checkpoint identity is rejected',()=>{const f=fixture();f.checkpoint.sources[0].identities.push(structuredClone(f.checkpoint.sources[0].identities[0]));assert.throws(()=>f.run(),e=>e.safeCode==='checkpoint_invalid');});
test('duplicate active or active-retained identities are rejected',()=>{
  const f=fixture();f.inventory.entries.push(structuredClone(f.inventory.entries[0]));assert.throws(()=>f.run(),e=>e.safeCode==='binding_invalid');
  f.inventory.entries.pop();f.inventory.retainedBindings.push(structuredClone(f.inventory.entries[0]));assert.throws(()=>f.run(),e=>e.safeCode==='binding_invalid');
});

// Real proof-module SQL fixture, modelled on the committed proof suite. The DB is RAM-only,
// tables are deliberately minimal; this does NOT cover production binding-schema inventory.
function realProofFixture(t){
  const db=new Database(':memory:');t.after(()=>db.close());
  db.exec(`
    create table platform_accounts(id text primary key,status text);
    create table platform_entitlements(id text primary key,account_id text,status text,plan text,valid_from text,valid_until text,traffic_limit_bytes integer);
    create table platform_issuance_requests(id text primary key,account_id text,entitlement_id text,status text);
    create table platform_issued_subscription_links(id text primary key,request_id text,tenant_ref text,artifact_ref text,status text);
    create table platform_portal_access_requests(id text primary key,portal_user_ref text,entitlement_ref text,status text,valid_until text,expires_at text);
    create table platform_coin_commerce_plan_switch_quotes(quote_ref text primary key,account_id text,entitlement_id text,kind text,from_offer_version_ref text,to_offer_version_ref text,snapshot_valid_from text,snapshot_valid_until text,cancels_switch_ref text,effective_at text,created_at text);
    create table platform_coin_commerce_quotes(quote_ref text primary key,account_id text,offer_version_ref text,amount_units integer,status text,consumed_at text);
    create table platform_coin_commerce_orders(order_ref text primary key,account_id text,quote_ref text,offer_version_ref text,hold_ref text,amount_units integer,payment_status text,created_at text);
    create table platform_coin_wallets(wallet_ref text primary key,account_id text);
    create table platform_coin_holds(hold_ref text primary key,wallet_ref text,purpose text,purpose_ref text,amount_units integer,status text);
    create table platform_coin_commerce_fulfillment_commands(command_ref text primary key,order_ref text,account_id text,status text,payload_json text,updated_at text);
    create table platform_coin_commerce_fulfillment_receipts(receipt_ref text primary key,command_ref text,effect_ref text,status text,safe_code text,recorded_at text);
    create table platform_audit_events(id text primary key,entity_type text,entity_ref text,action text,actor_ref text,created_at text,metadata_json text);
    create table platform_scheduled_plan_switches(switch_ref text primary key,account_id text,entitlement_id text,from_offer_version_ref text,to_offer_version_ref text,effective_at text,paid_units integer,status text,created_at text,resolved_at text,superseded_by_order_ref text);
  `);
  const insert=(table,row)=>db.prepare(`insert into ${table} (${Object.keys(row).join(',')}) values (${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
  insert('platform_accounts',{id:'acct_synthetic',status:'active'});insert('platform_coin_wallets',{wallet_ref:'wallet_synthetic',account_id:'acct_synthetic'});
  insert('platform_entitlements',{id:'ent_synthetic',account_id:'acct_synthetic',status:'active',plan:PLUS.offerVersionRef,valid_from:FROM,valid_until:UNTIL,traffic_limit_bytes:PLUS.monthlyTrafficGb*1024**3});
  insert('platform_issuance_requests',{id:'request_synthetic',account_id:'acct_synthetic',entitlement_id:'ent_synthetic',status:'issued'});
  insert('platform_issued_subscription_links',{id:'issued_synthetic',request_id:'request_synthetic',tenant_ref:'tenantref_synthetic',artifact_ref:'artifactref_synthetic',status:'active'});
  insert('platform_portal_access_requests',{id:'request_synthetic',portal_user_ref:'acct_synthetic',entitlement_ref:'ent_synthetic',status:'issued',valid_until:UNTIL,expires_at:UNTIL});
  const order='order_synthetic',command=deriveCommerceOperationRefs(order).commandRef;
  const effect=`effect_coin_commerce_${hash(`GCCWEBOS:COIN_COMMERCE_SUBSCRIPTION_FULFILLMENT:v1\0${command}`)}`;
  insert('platform_coin_commerce_plan_switch_quotes',{quote_ref:'quote_synthetic',account_id:'acct_synthetic',entitlement_id:'ent_synthetic',kind:'upgrade_inplace',from_offer_version_ref:BASIC.offerVersionRef,to_offer_version_ref:PLUS.offerVersionRef,snapshot_valid_from:FROM,snapshot_valid_until:UNTIL,cancels_switch_ref:null,effective_at:null,created_at:BOUNDARY});
  insert('platform_coin_commerce_quotes',{quote_ref:'quote_synthetic',account_id:'acct_synthetic',offer_version_ref:PLUS.offerVersionRef,amount_units:10,status:'consumed',consumed_at:BOUNDARY});
  insert('platform_coin_commerce_orders',{order_ref:order,account_id:'acct_synthetic',quote_ref:'quote_synthetic',offer_version_ref:PLUS.offerVersionRef,hold_ref:'hold_synthetic',amount_units:10,payment_status:'captured',created_at:BOUNDARY});
  insert('platform_coin_holds',{hold_ref:'hold_synthetic',wallet_ref:'wallet_synthetic',purpose:'product_purchase',purpose_ref:order,amount_units:10,status:'captured'});
  insert('platform_coin_commerce_fulfillment_commands',{command_ref:command,order_ref:order,account_id:'acct_synthetic',status:'delivered',payload_json:JSON.stringify({offerVersionRef:PLUS.offerVersionRef,delivery:{kind:'subscription_plan',durationDays:PLUS.durationDays,monthlyTrafficGb:PLUS.monthlyTrafficGb,trafficGb:null,neverExpires:false,discountBasisPoints:0}}),updated_at:AT});
  insert('platform_coin_commerce_fulfillment_receipts',{receipt_ref:'receipt_synthetic',command_ref:command,effect_ref:effect,status:'delivered',safe_code:null,recorded_at:AT});
  insert('platform_audit_events',{id:effect,entity_type:'coin_commerce_subscription_fulfillment',entity_ref:'ent_synthetic',action:'subscription_fulfillment_applied',actor_ref:'coin_commerce_fulfillment',created_at:AT,
    metadata_json:JSON.stringify({version:1,commandRef:command,orderRef:order,accountId:'acct_synthetic',requestRef:'request_synthetic',entitlementRef:'ent_synthetic',issuedLinkRef:'issued_synthetic',tenantRef:'tenantref_synthetic',artifactRef:'artifactref_synthetic',offerVersionRef:PLUS.offerVersionRef,portalPlan:'monthly',durationDays:PLUS.durationDays,monthlyTrafficGb:PLUS.monthlyTrafficGb,trafficLimitBytes:PLUS.monthlyTrafficGb*1024**3,validFrom:FROM,previousValidUntil:UNTIL,targetValidUntil:UNTIL,switchKind:'upgrade_inplace'})});
  const f=fixture();return{db,run:()=>db.transaction(()=>f.run(args=>readFullMeteringPlanSwitchProof({db,...args})))(),f};
}
test('REAL_SQL: three real proof chains pass inside query-only transaction with zero writes',t=>{
  const h=realProofFixture(t),changes=h.db.prepare('select total_changes() n').get().n;h.db.pragma('trusted_schema=OFF');h.db.pragma('query_only=ON');
  const r=h.run();assert.equal(r.summary.admissionPassed,true);assert.equal(r.summary.proofPassed,3);assert.equal(r.summary.admitted,3);assert.deepEqual(h.run(),r);
  assert.equal(h.db.prepare('select total_changes() n').get().n,changes);assert.doesNotMatch(JSON.stringify(r.summary),/acct_synthetic|order_synthetic|synthetic-ref|evidenceDigest/);
});
test('REAL_SQL: missing delivery is denied by real proof reader without writes',t=>{
  const h=realProofFixture(t);h.db.prepare('delete from platform_coin_commerce_fulfillment_receipts').run();const changes=h.db.prepare('select total_changes() n').get().n;
  h.db.pragma('query_only=ON');const r=h.run();assert.equal(r.summary.admissionPassed,false);assert.equal(r.summary.proofPassed,0);assert.equal(r.summary.admitted,0);assert.equal(h.db.prepare('select total_changes() n').get().n,changes);
});
test('REAL_SQL: missing schema is not disguised as an ordinary unproven result',t=>{
  const h=realProofFixture(t);h.db.exec('drop table platform_coin_holds');h.db.pragma('query_only=ON');assert.throws(()=>h.run(),e=>e.code==='SQLITE_ERROR');
});
