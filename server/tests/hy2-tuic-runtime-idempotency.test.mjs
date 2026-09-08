import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { createHysteria2ExplicitRestartAdapter, createHysteria2HostRuntimeAdapter } from "../services/edge/hysteria2-runtime-adapter.mjs";
import { createMihomoTuicExplicitRestartAdapter } from "../services/edge/mihomo-tuic-runtime-adapter.mjs";
import { createMihomoTuicHostRuntimeAdapter } from "../services/edge/mihomo-tuic-host-runtime-adapter.mjs";
import { readActiveConfigFile, validateRunningConfigFile } from "../services/edge/runtime-config-readonly-proof.mjs";

const payload = (kind) => ({runtime:kind,activationSurface:"explicit-restart",channelRef:"channel-synthetic",desiredStateRef:"synthetic-generation",actions:[{action:"unchanged",credentialRef:"edgecred_synthetic"}]});
const listener = () => ({name:"synthetic-listener",listen:"127.0.0.1:18443",port:18443,certificate:"synthetic-cert",privateKey:"synthetic-key",validationAttempts:1,validationRetryDelayMs:0});
const make = {hysteria2:createHysteria2ExplicitRestartAdapter,"mihomo-tuic":createMihomoTuicExplicitRestartAdapter};
const host = {hysteria2:createHysteria2HostRuntimeAdapter,"mihomo-tuic":createMihomoTuicHostRuntimeAdapter};
const writes = ["write","backup","replace","restart"];
function fixture(kind) {
  const s={active:null,candidate:null,calls:[],healthy:true,loaded:true,processRef:"synthetic-pid:start",password:"synthetic-password",afterTest:null,readFailure:false,activeTestExit:0};
  const adapter=make[kind]({listener:listener(),resolveCredentialMaterial:()=>({uuid:"synthetic-uuid",password:s.password}),
    readActiveConfig(){if(s.readFailure)throw Error("synthetic private failure");return s.active;},
    validateRunningConfig:()=>({loaded:s.loaded,processRef:s.processRef}),
    writeCandidateConfig(v){s.calls.push("write");s.candidate=v;},
    runConfigTest(options){s.calls.push(options?.active?"active-test":"candidate-test");if(options?.active)s.afterTest?.();return {exitCode:options?.active?s.activeTestExit:0};},
    backupActiveConfig(){s.calls.push("backup");return {backupRef:"synthetic-backup"};},
    replaceActiveConfig(){s.calls.push("replace");s.active=s.candidate;},
    restartService(){s.calls.push("restart");return {ok:true};},
    validateService:()=>({active:s.healthy}),validateListener:()=>({udp443:s.healthy})});
  assert.equal(adapter.applyCredentialReconciliation(payload(kind)).status,"applied");s.calls=[];
  return {s,adapter};
}

for (const kind of Object.keys(make)) {
  test(`${kind} identical loaded healthy config skips writes and restart`,()=>{
    const {s,adapter}=fixture(kind),before=s.active;
    const receipt=adapter.applyCredentialReconciliation(payload(kind));
    assert.equal(receipt.status,"unchanged");assert.equal(receipt.mutation,false);assert.equal(receipt.service.restarted,false);
    assert.equal(receipt.listener.udp443,true);assert.equal(s.active,before);assert.deepEqual(s.calls,["active-test"]);
    assert.doesNotMatch(JSON.stringify(receipt),/synthetic-password|synthetic-uuid|synthetic-key/);
  });
  test(`${kind} CRLF and diagnostic generation comment alone do not restart`,()=>{
    const {s,adapter}=fixture(kind);s.active=s.active.replaceAll("\n","\r\n");
    const receipt=adapter.applyCredentialReconciliation({...payload(kind),desiredStateRef:"another-diagnostic-generation"});
    assert.equal(receipt.status,"unchanged");assert.deepEqual(s.calls,["active-test"]);
  });
  for(const reason of ["changed","unhealthy","not-loaded"]){
    test(`${kind} ${reason} retains normal replacement/restart`,()=>{
      const {s,adapter}=fixture(kind);if(reason==="changed")s.password="different-synthetic-password";if(reason==="unhealthy")s.healthy=false;if(reason==="not-loaded")s.loaded=false;
      const receipt=adapter.applyCredentialReconciliation(payload(kind));assert.equal(receipt.mutation,true);assert.deepEqual(s.calls.filter(v=>writes.includes(v)),writes);
    });
  }
  for(const reason of ["read-error","pid-drift","file-drift","active-test-failed"]){
    test(`${kind} ${reason} is failed with zero writes`,()=>{
      const {s,adapter}=fixture(kind);
      if(reason==="read-error")s.readFailure=true;
      if(reason==="pid-drift")s.afterTest=()=>{s.processRef="different-instance";};
      if(reason==="file-drift")s.afterTest=()=>{s.active+="# concurrent change\n";};
      if(reason==="active-test-failed")s.activeTestExit=1;
      const receipt=adapter.applyCredentialReconciliation(payload(kind));assert.equal(receipt.status,"failed");assert.equal(receipt.mutation,false);assert.deepEqual(s.calls.filter(v=>writes.includes(v)),[]);
    });
  }
  test(`${kind} host second apply proves active file and same process without mutation`,()=>{
    const root=mkdtempSync(join(tmpdir(),"hy2-tuic-noop-")),active=join(root,"active.yaml"),candidate=join(root,"candidate.yaml"),backup=join(root,"backups");
    const calls=[];let showExit=0,serviceExit=0,listenerExit=0,loaded=true;
    try{
      const adapter=host[kind]({activeConfigPath:active,candidateConfigPath:candidate,backupDir:backup,listener:listener(),resolveCredentialMaterial:()=>({uuid:"synthetic-uuid",password:"synthetic-password"}),
        hysteriaBinary:"synthetic-hy2",mihomoBinary:"synthetic-mihomo",commandRunner(cmd,args){calls.push([cmd,...args]);
          if(cmd==="systemctl"&&args[0]==="show"){
            const f=statSync(active),d=loaded?new Date(Math.ceil(Math.max(f.mtimeMs,f.ctimeMs))+1000):new Date("2020-01-01T00:00:00.000Z");
            const stamp=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()]+" "+d.toISOString().replace("T"," ").replace(/\.(\d{3})Z$/,".$1000 UTC");
            return {exitCode:showExit,stdout:`ActiveState=active\nMainPID=12345\nExecMainStartTimestamp=${stamp}\n`};
          }
          if(cmd==="systemctl"&&args[0]==="is-active")return {exitCode:serviceExit};
          if(cmd==="ss")return {exitCode:listenerExit,stdout:"UNCONN 0 0 127.0.0.1:18443 0.0.0.0:*"};
          if(cmd==="synthetic-hy2"&&args.includes("--help"))return {exitCode:0,stdout:"--check"};
          return {exitCode:0};
        }});
      assert.equal(adapter.applyCredentialReconciliation(payload(kind)).status,"applied");calls.length=0;
      const before=readFileSync(active),candidateBefore=readFileSync(candidate),backups=readdirSync(backup);
      assert.equal(adapter.applyCredentialReconciliation(payload(kind)).status,"unchanged");
      assert.deepEqual(readFileSync(active),before);assert.deepEqual(readFileSync(candidate),candidateBefore);assert.deepEqual(readdirSync(backup),backups);
      assert.equal(calls.filter(c=>c[0]==="systemctl"&&c[1]==="restart").length,0);
      assert.equal(calls.filter(c=>c[0]==="systemctl"&&c[1]==="show").length,2);
      assert(calls.some(c=>c.includes(active)));assert(!calls.some(c=>c.includes(candidate)));
      calls.length=0;showExit=1;
      assert.equal(adapter.applyCredentialReconciliation(payload(kind)).status,"failed");assert(!calls.some(c=>c[1]==="restart"));assert.deepEqual(readFileSync(active),before);
      showExit=0;serviceExit=1;calls.length=0;
      assert.equal(adapter.applyCredentialReconciliation(payload(kind)).status,"failed");assert(!calls.some(c=>c[1]==="restart"));assert.deepEqual(readFileSync(active),before);
      serviceExit=0;listenerExit=1;calls.length=0;
      assert.equal(adapter.applyCredentialReconciliation(payload(kind)).status,"failed");assert(!calls.some(c=>c[1]==="restart"));assert.deepEqual(readFileSync(active),before);
      listenerExit=0;loaded=false;calls.length=0;
      assert.equal(adapter.applyCredentialReconciliation(payload(kind)).status,"applied");assert.equal(calls.filter(c=>c[1]==="restart").length,1);
    }finally{assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert(basename(root).startsWith("hy2-tuic-noop-"));rmSync(root,{recursive:true,force:true});}
  });
}

for (const mode of ["unknown-state","duplicate-property","coarse-time","file-race","directory"]){
  test(`UDP loaded-config proof rejects ${mode}`,()=>{
    const root=mkdtempSync(join(tmpdir(),"hy2-tuic-noop-")),path=join(root,"active.yaml");
    try{
      if(mode==="directory"){mkdirSync(path);assert.throws(()=>readActiveConfigFile(path));return;}
      writeFileSync(path,"synthetic: true\n");
      const runner=()=>{
        if(mode==="file-race")writeFileSync(path,"synthetic: altered and longer\n");
        return {exitCode:0,stdout:`ActiveState=${mode==="unknown-state"?"unknown":"active"}\nMainPID=42\n${mode==="duplicate-property"?"MainPID=43\n":""}ExecMainStartTimestamp=Tue 2030-01-01 00:00:00${mode==="coarse-time"?"":".123456"} UTC\n`};
      };
      assert.throws(()=>validateRunningConfigFile(path,"synthetic.service",runner));
    }finally{assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert(basename(root).startsWith("hy2-tuic-noop-"));rmSync(root,{recursive:true,force:true});}
  });
}
