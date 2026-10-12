// Single-purpose aggregate-only diagnostic. No install, collector, protocol, writer or recovery invocation.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
const ROOT='/opt/gccwebos-runtime/collector-plan-e834185cca07';
const OLD='/opt/gccwebos-runtime/collector-reset-fa492bd93c09';
const BASE='/opt/proxy-gateway-minimal-candidate';
const APP=BASE+'/releases/control-plane-pr772-63dd535428a2-mixed-reset764-guard767';
const DB=BASE+'/shared/state/subscription-control.sqlite';
const JOURNAL=BASE+'/full-metering-bwh-local-20261009/journal';
const CONFIG=BASE+'/full-metering-bwh-local-20261009/config.json';
const CONFIG_SHA='682ced6e0c8e9c685f814f5a67b707e884953bcbd23689cace0def7af02d5b41';
const NODE_SHA='93956de2e59480474a7b46571da1651180b1a050cdf32641ebec4ce6e478e068';
const SCOPE='local-three-v1', ACTIVATION='bwh-local-three-20261009-01';
// Exact collector-manifest.json a2cb8709a237d9167577e2c5cd02af6905c7ebdf52da9684198370d070e02862.
export const FILES=Object.freeze([
  ['node_modules/better-sqlite3/build/Release/better_sqlite3.node','1ba30ab367585433049007c732f0d83423584697636474ab99b9c64911650bd3',2118112],
  ['node_modules/better-sqlite3/lib/database.js','02ea23bdd23d7ac5de0675a2f32fc686e76d5c6a32bd3e3891f360e72e07f61f',4149],
  ['node_modules/better-sqlite3/lib/index.js','82db11c4ee43a41d859988c5db42c3771dff565371f94bacbd1e4d8d6ceb47cd',110],
  ['node_modules/better-sqlite3/lib/methods/aggregate.js','e9f74eb919ec93fe089c95ddf25a98f1f631c80418fa34fb2346ca1bc29f1b82',1932],
  ['node_modules/better-sqlite3/lib/methods/backup.js','ea29d34992bb02e006d0fdeda9675ac5d2bb227aaf57468decd997e9fc9c7dbf',2380],
  ['node_modules/better-sqlite3/lib/methods/function.js','f431d49303b8bbdc044b1f1b455bdad21fc9b74b007de0acb22f08f25b4febd3',1396],
  ['node_modules/better-sqlite3/lib/methods/inspect.js','4975a78daee850adee62ba98719d0f223819a0ec135a07c0e302994bd8dbff61',174],
  ['node_modules/better-sqlite3/lib/methods/pragma.js','8b1c54475bd4340b15e25c50d53d06308be65f8f919ecbe4aa9d285ca859ad5a',536],
  ['node_modules/better-sqlite3/lib/methods/serialize.js','7a10ee5c2735384b7f0c361811bc6d017db29f62b203fd3c68a35f667e2c2605',625],
  ['node_modules/better-sqlite3/lib/methods/table.js','97c42d9ded1aa96c7d916b5b92f96b4e59581d50eaf629cd2c7afb78ff26a9ea',7144],
  ['node_modules/better-sqlite3/lib/methods/transaction.js','bc8624a3ef689d8f78e5669020ad121e17acbc93b1d5ee5afe26860b1084c66c',2792],
  ['node_modules/better-sqlite3/lib/methods/wrappers.js','a150a6271d23f4e5f8953b129f370ff096c7cdc4b812afbf080a6cf4ab741bcf',1145],
  ['node_modules/better-sqlite3/lib/sqlite-error.js','2582d61c27680dead168543f392eb102be621dfbef282a4ca4c7c21aa5e7c75d',717],
  ['node_modules/better-sqlite3/lib/util.js','92b2e39e2151b43a2252e10b6d6de876ecaf0008336a4fa1dfe1317b20f1916f',331],
  ['node_modules/better-sqlite3/package.json','d1db58a099dfdef5d10253e873e358eb1e9e2ebb01fa6ef0d40150e37cef6317',1436],
  ['node_modules/bindings/bindings.js','8e32a0d37f20bd6f7d5bdbf99d041aa27be47cbbe5172ac13ebf7380a10b3bf6',5986],
  ['node_modules/bindings/package.json','a87721fe406e1f1798fef44d697b46ea1efe346fda118010334713346ee4207c',660],
  ['node_modules/file-uri-to-path/index.js','e62293e871bdd5a7449ff3c7956c9536ec1d2ea7369461de77322b5256bb93e7',1723],
  ['node_modules/file-uri-to-path/package.json','71eb1e24bb9694f89c613fa0aa307f977dd43f41d11794c7b48fabf6c55f66b0',717],
  ['scripts/lib/full-metering-billing-window-continuation.mjs','4f66b3f6c706898d938873bbf4cc39b0498ab49dda6c674846d9dcec44363e26',7346],
  ['scripts/lib/full-metering-collection.mjs','9e33ca6aff05cb728710a542cf250ccfeeb3c60fb6a2c2a784a70616e54e7860',18681],
  ['scripts/lib/full-metering-command.mjs','edb56b2a809448dcf6c1ac7674482183ba56197551a671950140318f5681542c',13739],
  ['scripts/lib/full-metering-journal.mjs','fa7c750bf586f0aeb0cc8eab910aa8a341b9d7cbb2798704fe9b584a1aab3cc7',11277],
  ['scripts/lib/full-metering-local-source.mjs','f947bb87625dedc1635e049f10f6d33c1f60e66d43b1350f26cd995394da3bd2',15393],
  ['scripts/lib/full-metering-material-continuation.mjs','e31d7ea3dc03d353700ce1022d59323c64dd7d24e9ca19f72267d9bcf9d16f33',7376],
  ['scripts/lib/full-metering-plan-switch-continuation.mjs','f798d405f68b1a7310423a6c0108a5172b888fc6ee1cfb4e94e4bd09cdce673c',4880],
  ['scripts/lib/full-metering-plan-switch-proof.mjs','6c49735a0c9f1636947f87ac8072a1086833de67d5dd3e2b6388368d9ac5cbd6',15242],
  ['scripts/lib/full-metering-sample-writer.mjs','18674db428ae13b5bae23e598489c41e47b171e2833611f3acf47c2f0a4105a4',7128],
  ['scripts/lib/full-metering-scope.mjs','02af48dc796919ea3bcf51227fe188a7e3f81f5eb2bf4042a1a8670ea34266da',2818],
  ['scripts/lib/full-metering-source-driver.mjs','2eab01aa5eb407f8ae045b6d136f7e27ddc589e4974d201afc40b0a6868ec1c9',6519],
  ['scripts/lib/traffic-vless-recovery-baseline.mjs','2a8c9688ae42f7e7f58503c30c8c023f74a9162a972fb490563a5e334f8a4aec',53223],
  ['scripts/traffic-full-metering-collect.mjs','2ffe8e2d762677c82397997b9d75ac4e66a14801cf3c793940e79be904e98b1e',647],
  ['scripts/traffic-full-metering-source.mjs','f58112228525f223e6cb16fa95563f2d675e3d8da7e2318ac448d9e40556d4f6',1179],
  ['server/services/deployment/strict-json-scan.mjs','c3ed625964b61ff43dc91ad688e04c4459220aa4094c2b6e3d76795decf9d010',3932],
  ['server/services/edge/full-metering-connection-history.mjs','36682fd78976d18634b69414def74cfb4279f4b5a1a1baf923d8c204fc13c689',6305],
  ['server/services/edge/full-metering-counter-transition.mjs','9476a926f9d68b02f1be9cc8e5f8bd34d412f23708664c546c223457d2b060bc',63008],
  ['server/services/edge/full-metering-source-readers.mjs','dc505b14cb76b11a6a87f03155286f17030d46677bfb97e7e1b20f5159d7a25c',8866],
  ['server/services/edge/xray-recovery-counter-parser.mjs','64b984b1df0722c4eb48c395335fb1e2cef95f9e42dd6aad4a603c40fffe425a',2234],
  ['server/services/edge/xray-stats-cli-usage-reader.mjs','1024f23b15b09fd2d1567941072d80282f122ed3996fd17d8bd39eabe45fc4fc',5784],
  ['server/services/platform/account-resource-authority.mjs','f3b32c58ccf9cc85df62a7ece896e815a34ddd617cd54a9d49d0d969587b7a39',16442],
  ['server/services/platform/coin-commerce-domain.mjs','b831dfda2c54f30b661daf085e2d7c49b23f3e212fd0c505d77c8a36cc16c516',11757],
  ['server/services/platform/coin-commerce-plan-switch-policy.mjs','cd7c98435bad1fbb24d13b33cb0eececc0a2e7052a60d81d60c4a013b7ebc6b7',14516],
  ['server/services/platform/coin-commerce-plan-switch-runtime.mjs','70f66a206611dcef0c4b9f2872c4b8396166fc8d7a0f5f30e34099377014b98e',18141],
  ['server/services/platform/coin-commerce-production-catalog.mjs','e0803cac741053cf2b099d2192102b91b8ab749b891acc52da3566295f792a0c',3034],
  ['server/services/platform/coin-wallet-domain.mjs','87a0ff04f747db332730243d4ec76526642771fb5242148447eaa41c044dd809',10347],
  ['server/services/platform/portal-referral-contract.mjs','0d73c569492e53634095eb5b8f9c45f957302d028d2ed7726cbbe8f01f8458a9',3750],
  ['server/services/platform/portal-subscription-link-reset-store.mjs','74125e4ca9a3148652c360e5e0ab91a3cffa97489984ab28210b38550c71bdb2',14308],
  ['server/services/platform/subscription-control-db.mjs','b0ba9756f833afc14d148c50dd52c4d1954dfc7f7d50575cef27e8c7965613b5',302383],
  ['server/services/platform/usage-billing-cycle.mjs','ea3732227e5dc4c3f0665d7a20a89dd0b608de288fbee1527c4484fbdbefafd0',4911]
].map(Object.freeze));
const CHANNELS=Object.freeze({'channel-vultr-a-vless-reality-tcp':'vless','channel-vultr-a-hy2':'hy2','channel-vultr-a-tuic':'tuic'});
export const PROBE_LIMITS=Object.freeze({maxDurationMs:30000,maxRssBytes:256*1024*1024,maxPlainBytes:32*1024*1024,maxCheckpointBytes:128*1024*1024,maxDecodedBytes:256*1024*1024,maxIdentities:10000,systemctlTimeoutMs:5000,sqliteTimeoutMs:5000});
const sha=x=>createHash('sha256').update(x).digest('hex'), equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=code=>{throw Object.assign(new Error('probe_stopped'),{safeCode:code});};
const need=(ok,code='input_invalid')=>{if(!ok)fail(code);};
export function assertProbeBounds(startedAtMs,usage=process.memoryUsage(),nowMs=Date.now()){
  need(Number.isFinite(startedAtMs)&&Number.isFinite(nowMs)&&nowMs-startedAtMs<=PROBE_LIMITS.maxDurationMs,'time_limit');
  need(Number.isFinite(usage?.rss)&&usage.rss>=0&&usage.rss<=PROBE_LIMITS.maxRssBytes,'memory_limit');
}
const signature=s=>['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].map(k=>String(s[k]));
function meta(file,uid=0,privateFile=false,directory=false){
  const s=fs.lstatSync(file,{bigint:true});
  need(fs.realpathSync(file)===file&&!s.isSymbolicLink()&&s.uid===BigInt(uid)&&(directory?s.isDirectory():s.isFile()&&s.nlink===1n)
    &&(s.mode&BigInt(privateFile?0o077:0o022))===0n,'file_unsafe');return s;
}
function read(file,uid=0,privateFile=false,max=1024*1024){
  const before=meta(file,uid,privateFile);need(before.size<=BigInt(max),'file_bound');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{need(equal(signature(fs.fstatSync(fd,{bigint:true})),signature(before)),'file_changed');const data=fs.readFileSync(fd);
    need(data.length<=max&&equal(signature(fs.fstatSync(fd,{bigint:true})),signature(before))&&equal(signature(meta(file,uid,privateFile)),signature(before)),'file_changed');
    return {data,sha:sha(data),signature:signature(before)};
  }finally{fs.closeSync(fd);}
}
function absent(file){try{fs.lstatSync(file);return false;}catch(e){if(e.code==='ENOENT')return true;throw e;}}
function verifyClosure(){
  const directories=new Set([ROOT]);for(const [file]of FILES){let p=ROOT;for(const part of file.split('/').slice(0,-1)){p+='/'+part;directories.add(p);}}
  for(const p of directories)meta(p,0,false,true);
  const expected=new Set(FILES.map(([p])=>ROOT+'/'+p));for(const p of directories)for(const name of fs.readdirSync(p))need(directories.has(p+'/'+name)||expected.has(p+'/'+name),'candidate_extra_file');
  return FILES.map(([p,h,size])=>{const v=read(ROOT+'/'+p,0,false,size);need(v.sha===h&&v.data.length===size,'candidate_changed');return v.signature;});
}
function services(){
  need(fs.realpathSync(BASE+'/current')===APP,'app_changed');meta(OLD,0,false,true);
  const snapshot=[];for(const unit of ['proxy-gateway-candidate.service','gccgw-full-metering-collect.service','gccgw-full-metering-collect.timer']){
    const fields=['LoadState','ActiveState','SubState','Job',...(unit.endsWith('.service')?['MainPID','ControlPID','WorkingDirectory','ExecStart']:[])];
    const r=spawnSync('/usr/bin/systemctl',['show',unit,'--no-pager','--property='+fields.join(',')],{encoding:'utf8',timeout:PROBE_LIMITS.systemctlTimeoutMs,maxBuffer:65536,env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC'},stdio:['ignore','pipe','pipe']});
    need(!r.error&&r.status===0&&r.stderr==='','service_read_failed');const row={};
    for(const line of r.stdout.trimEnd().split('\n')){const at=line.indexOf('='),key=line.slice(0,at);need(at>0&&fields.includes(key)&&!Object.hasOwn(row,key),'service_shape_invalid');row[key]=line.slice(at+1);}
    need(fields.every(k=>Object.hasOwn(row,k))&&row.LoadState==='loaded'&&row.Job==='','service_changed');
    if(unit==='proxy-gateway-candidate.service')need(row.ActiveState==='active'&&row.SubState==='running'&&/^[1-9]\d*$/.test(row.MainPID)&&row.ControlPID==='0'&&row.WorkingDirectory===APP&&fs.realpathSync('/proc/'+row.MainPID+'/cwd')===APP,'app_changed');
    else if(unit.endsWith('.timer'))need(row.ActiveState==='inactive'&&row.SubState==='dead','collector_not_quiet');
    else need(['failed','inactive'].includes(row.ActiveState)&&row.MainPID==='0'&&row.ControlPID==='0'&&row.WorkingDirectory===OLD&&row.ExecStart.includes(OLD+'/scripts/traffic-full-metering-collect.mjs --collect --config '+CONFIG+' --config-sha256 '+CONFIG_SHA+' ;'),'collector_changed');
    snapshot.push(row);
  }need(absent(JOURNAL+'/pending.json')&&absent(JOURNAL+'/writer.lock'),'journal_not_quiet');return snapshot;
}
export function decodeCheckpoint(bytes,context,digest,scan){
  need(Buffer.isBuffer(bytes)&&bytes.length<=PROBE_LIMITS.maxCheckpointBytes,'journal_invalid');let text=bytes;
  if(bytes.subarray(0,8).equals(Buffer.from('GCCFMJ2\n'))){need(bytes.length>16,'journal_invalid');const length=bytes.readBigUInt64LE(8);
    need(length>0n&&length<=BigInt(PROBE_LIMITS.maxDecodedBytes),'journal_invalid');try{text=gunzipSync(bytes.subarray(16),{maxOutputLength:Number(length)});}catch{fail('journal_invalid');}need(text.length===Number(length),'journal_invalid');
  }else need(bytes.length<=PROBE_LIMITS.maxPlainBytes,'journal_invalid');
  try{const body=text.toString('utf8');scan(body);const e=JSON.parse(body);
    need(e?.version===1&&Object.keys(e).sort().join(',')==='context,digest,payload,version'&&e.digest===digest({version:e.version,context:e.context,payload:e.payload})&&digest(e.context)===digest(context),'journal_invalid');return e.payload;
  }catch{fail('journal_invalid');}
}
// Pure analysis with injected read callback; private digests are solely for in-memory stability checks.
export function analyze({checkpoint,inventory,api,readProof,now}){
  const {digest,identity,admit,history,assertScope}=api;assertScope(checkpoint,SCOPE);
  need(checkpoint.version===1&&checkpoint.activationId===ACTIVATION&&Number.isSafeInteger(checkpoint.sequence)&&checkpoint.sequence>=0,'checkpoint_invalid');
  need(Array.isArray(inventory.entries)&&Array.isArray(inventory.retainedBindings)&&inventory.entries.length+inventory.retainedBindings.length<=PROBE_LIMITS.maxIdentities,'binding_invalid');
  const entries=inventory.entries.map(identity),retained=inventory.retainedBindings.map(x=>({channelRef:x.channelRef,edgeCredentialRef:x.edgeCredentialRef,materialDigest:x.materialDigest,runtimeAbsenceRequired:x.reasons?.includes('portal_durable_scope_supersedes_primary')===true}));
  const key=x=>x.channelRef+'\0'+x.edgeCredentialRef,seen=new Set();for(const x of [...entries,...retained]){need(Object.hasOwn(CHANNELS,x.channelRef)&&!seen.has(key(x)),'binding_invalid');seen.add(key(x));}
  const active=new Map(entries.map(x=>[key(x),x])),oldSeen=new Set(),perSource={};let changed=0,proofCalls=0,proofPassed=0;
  const planHistory=history(checkpoint), evidence=[];
  for(const source of checkpoint.sources){
    const state=source.counterState;need(Array.isArray(source.identities)&&source.identities.length<=PROBE_LIMITS.maxIdentities&&state&&['eligibleRefs','retainedRefs','archivedRefs','retiredEntries'].every(k=>Array.isArray(state[k])),'checkpoint_invalid');
    const row={checkpointIdentities:source.identities.length,unchanged:0,billingChanged:0,otherChanged:0,retained:0,missing:0,reactivationCandidates:0,archiveMissing:0,
      planBoundaryCount:(state.planSwitchBoundaries??[]).length,reactivationHistoryCount:(state.planSwitchReactivations??[]).length};
    need(Array.isArray(state.planSwitchBoundaries??[])&&Array.isArray(state.planSwitchReactivations??[])&&row.planBoundaryCount<=128&&row.reactivationHistoryCount<=128,'history_invalid');
    for(const old of source.identities){need(old.channelRef===source.channelRef&&!oldSeen.has(key(old))&&digest(identity(old))===digest(old),'checkpoint_invalid');oldSeen.add(key(old));const live=active.get(key(old));
      if(!live){const r=retained.find(x=>key(x)===key(old));if(r&&r.materialDigest===old.materialDigest)row.retained++;else row.missing++;continue;}
      if(digest(live)===digest(old)){row.unchanged++;continue;}changed++;
      if(digest({...old,billingBinding:live.billingBinding})===digest(live))row.billingChanged++;else row.otherChanged++;
      if(state.retainedRefs.includes(old.edgeCredentialRef)){row.reactivationCandidates++;if(!state.archivedRefs.includes(old.edgeCredentialRef)||state.retiredEntries.filter(x=>x.edgeCredentialRef===old.edgeCredentialRef).length!==1)row.archiveMissing++;}
    }perSource[CHANNELS[source.channelRef]]=row;
  }
  let admitted,admissionPassed=true;try{admitted=admit({checkpoint,identities:{entries,retained},now,readPlanSwitchProof:args=>{proofCalls++;const r=readProof(args);if(r?.ok===true){proofPassed++;evidence.push(r.proof);}return r;}});}
  catch(e){if(e.code!=='full_metering_plan_switch_unproven')throw e;admissionPassed=false;}
  const summary={sequence:checkpoint.sequence,eligible:entries.length,retained:retained.length,newEligible:entries.filter(x=>!oldSeen.has(key(x))).length,changed,proofCalls,proofPassed,admitted:admitted?.changes.size??0,admissionPassed,
    planHistoryCount:planHistory.length,planHistoryRemaining:128-planHistory.length,perSource,historyCountsOnly:true,counterStateValidated:false};
  return {summary,privateProjectionDigest:digest({entries,retained}),privateAdmissionDigest:digest({evidence,changes:admitted?[...admitted.changes]:[],summary})};
}
async function main(){
  let db,phase='runtime_preconditions',watchdog;const startedAtMs=Date.now();try{
    watchdog=setTimeout(()=>{console.log(JSON.stringify({ok:false,phase:'time_limit',category:'time_limit',mutated:false,rawReturned:false,recoveryReady:false}));process.exit(2);},PROBE_LIMITS.maxDurationMs);
    assertProbeBounds(startedAtMs);
    need(process.argv.length===2&&process.platform==='linux'&&process.arch==='x64'&&process.getuid()===0&&process.versions.node==='22.23.1'&&process.versions.modules==='127'&&!process.env.NODE_OPTIONS&&!process.env.NODE_PATH,'runtime_invalid');
    need(fs.realpathSync(process.execPath)==='/usr/bin/node'&&read('/usr/bin/node',0,false,200*1024*1024).sha===NODE_SHA,'node_changed');
    const beforeServices=services();phase='candidate_files';const beforeFiles=verifyClosure();meta(JOURNAL,0,true,true);
    const config=read(CONFIG,0,true);need(config.sha===CONFIG_SHA,'config_changed');const checkpointFile=read(JOURNAL+'/checkpoint.json',0,true,PROBE_LIMITS.maxCheckpointBytes);
    const dbState=()=>{const s=meta(DB,999,true);need(s.gid===992n,'database_identity_invalid');return {path:DB,dev:String(s.dev),ino:String(s.ino)};};const dbBefore=dbState();
    phase='module_imports';const load=p=>import(pathToFileURL(ROOT+'/'+p).href),require=createRequire(pathToFileURL(ROOT+'/scripts/lib/full-metering-plan-switch-proof.mjs'));
    need(require.resolve('better-sqlite3')===ROOT+'/node_modules/better-sqlite3/lib/index.js','dependency_changed');const Database=require('better-sqlite3');
    const {fullMeteringDigest:digest}=await load('scripts/lib/full-metering-journal.mjs'),{assertNoDuplicateObjectKeys:scan}=await load('server/services/deployment/strict-json-scan.mjs');
    const {readFullMeteringBindings}=await load('scripts/lib/traffic-vless-recovery-baseline.mjs'),{readFullMeteringPlanSwitchProof}=await load('scripts/lib/full-metering-plan-switch-proof.mjs');
    const {admitFullMeteringPlanSwitches:admit,planSwitchContinuationHistory:history}=await load('scripts/lib/full-metering-plan-switch-continuation.mjs');
    const {fullMeteringBindingIdentity:identity}=await load('scripts/lib/full-metering-sample-writer.mjs'),{assertFullMeteringCheckpointScope:assertScope}=await load('scripts/lib/full-metering-scope.mjs');
    const context={scopeDigest:CONFIG_SHA,databaseIdentityDigest:digest(dbBefore),meteringScope:SCOPE};phase='checkpoint_decode';const checkpoint=decodeCheckpoint(checkpointFile.data,context,digest,scan);
    phase='database_read';db=new Database(DB,{readonly:true,fileMustExist:true,timeout:PROBE_LIMITS.sqliteTimeoutMs,nativeBinding:ROOT+'/node_modules/better-sqlite3/build/Release/better_sqlite3.node'});
    db.pragma('trusted_schema = OFF');db.pragma('query_only = ON');need(db.readonly===true&&db.pragma('query_only',{simple:true})===1&&db.pragma('trusted_schema',{simple:true})===0,'database_readonly_failed');
    const now=new Date().toISOString(),readSnapshot=db.transaction(()=>analyze({checkpoint,inventory:readFullMeteringBindings({db,databaseIdentityDigest:context.databaseIdentityDigest,channelRefs:Object.keys(CHANNELS),now}),
      api:{digest,identity,admit,history,assertScope},readProof:args=>readFullMeteringPlanSwitchProof({db,...args}),now}));
    phase='first_snapshot';assertProbeBounds(startedAtMs);const first=readSnapshot();phase='second_snapshot';assertProbeBounds(startedAtMs);const second=readSnapshot();need(equal(first,second),'snapshot_changed');db.close();db=null;
    phase='final_stability';assertProbeBounds(startedAtMs);need(equal(beforeServices,services())&&equal(beforeFiles,verifyClosure())&&equal(dbBefore,dbState()),'runtime_changed');
    for(const [p,prior,max]of [[CONFIG,config,1024*1024],[JOURNAL+'/checkpoint.json',checkpointFile,PROBE_LIMITS.maxCheckpointBytes]]){const after=read(p,0,true,max);need(after.sha===prior.sha&&equal(after.signature,prior.signature),'file_changed');}
    need(Object.keys(require.cache).every(p=>FILES.some(([name])=>p===ROOT+'/'+name)),'dependency_changed');
    const result={ok:true,at:now,scope:SCOPE,sourceMatched:true,snapshotStable:true,readonlyDatabase:true,mutated:false,rawReturned:false,proof:first.summary,
      runtimeCountersRead:false,protocolConfigRead:false,materialFileRead:false,usageRowsRead:false,recoveryReady:false,productionWritesAuthorized:false};console.log(JSON.stringify(result));
  }catch(e){const allowed=new Set(['input_invalid','file_unsafe','file_bound','file_changed','candidate_extra_file','candidate_changed','app_changed','service_read_failed','service_shape_invalid','service_changed','collector_not_quiet','collector_changed','journal_not_quiet','journal_invalid','checkpoint_invalid','binding_invalid','history_invalid','runtime_invalid','node_changed','config_changed','database_identity_invalid','dependency_changed','database_readonly_failed','snapshot_changed','runtime_changed','time_limit','memory_limit']);
    console.log(JSON.stringify({ok:false,phase,category:allowed.has(e.safeCode)?e.safeCode:e.code==='full_metering_plan_switch_unproven'?'commerce_proof_unproven':'read_failed',mutated:false,rawReturned:false,recoveryReady:false}));process.exitCode=2;
  }finally{if(watchdog)clearTimeout(watchdog);if(db?.open)db.close();}
}
if(process.argv[1]==='-'||(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url))await main();
