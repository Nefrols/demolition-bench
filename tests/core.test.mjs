import test from 'node:test';
import assert from 'node:assert/strict';
import {createSolver as baseline} from '../engine/baseline.js';
import {createSolver as candidate} from '../solver.js';
import {referenceStep,cloneWorld,prepareScenario,checkResult} from '../engine/oracle.js';
import {makeWorld,edgeCases,makeScenario,random,edit,FAMILIES} from '../engine/scenarios.js';
import {runTrial,benchmark} from '../engine/benchmark.js';
import {validReport,compatible} from '../reports.js';

test('hand-checked reductions: pair, single voxel, hollow shell',()=>{
  const cases=[
    [makeWorld(3,1,1,x=>x>0,()=>false),[1,2],[1,2,3,0,0,10,1,0,0,2,0,0]],
    [makeWorld(3,3,3,(x,y,z)=>x===1&&y===2&&z===1,()=>false),[22],[22,1,1,2,1,6,1,2,1,1,2,1]],
    [makeWorld(3,3,3,(x,y,z)=>x!==1||y!==1||z!==1,()=>false),Array.from({length:27},(_,i)=>i).filter(i=>i!==13),[0,26,26,26,26,60,0,0,0,2,2,2]]
  ];
  for(const [w,ids,record] of cases)for(const factory of [baseline,candidate]){const s=factory(cloneWorld(w)),a=s.step(edit()),b=referenceStep(cloneWorld(w),edit());assert.deepEqual([...a.detached].sort((a,b)=>a-b),ids);assert.deepEqual([...a.components],record);assert.deepEqual([...b.components],record);assert.equal(s.step(edit()).detached.length,0);}
});
test('transaction precedence, no-op add and no remembered anchors in air',()=>{
  const s=baseline(makeWorld(1,1,1,()=>true));
  assert.equal(s.step(edit({add:[0]})).detached.length,0);
  assert.equal(s.step(edit({remove:[0,0],add:[0,0]})).detached.length,1);
  assert.equal(s.step(edit({anchorOn:[0]})).detached.length,0);
  assert.equal(s.step(edit({add:[0]})).detached.length,1);
  assert.equal(s.step(edit({add:[0],anchorOff:[0],anchorOn:[0]})).detached.length,0);
  assert.equal(s.step(edit({anchorOff:[0]})).detached.length,1);
});
test('anchor transfer, split, rebuilding, alternate support and boundaries',()=>{
  for(const seed of [0,1,42,91871,0xffffffff])for(const s of edgeCases(seed)){const ready=prepareScenario(s);runTrial(baseline,ready);runTrial(candidate,ready);}
});
test('component buffer grows beyond 256 fragments',()=>{
  const w=makeWorld(32,4,32,(x,y,z)=>x%2===0&&y%2===0&&z%2===0,()=>false);
  const expected=referenceStep(cloneWorld(w),edit()),s=baseline(w);
  assert.equal(expected.components.length/12,512);assert.ok(checkResult(s.step(edit()),expected,4096).ok);
});
test('generators are deterministic and exercise bulk collapse',()=>{
  for(const family of FAMILIES){const a=makeScenario(family,1234,'S',8);assert.deepEqual(a,makeScenario(family,1234,'S',8));assert.equal(a.events.length,28);const p=prepareScenario(a);runTrial(candidate,p);assert.ok(p.frames.some(f=>f.expected.detached.length>100));}
});
test('checker validates arbitrary order and every component field',()=>{
  const e=referenceStep(makeWorld(5,1,1,x=>x%2===0,()=>false),edit());
  const reverse={detached:e.detached.slice().reverse(),components:Uint32Array.from([...e.components.slice(24),...e.components.slice(12,24),...e.components.slice(0,12)])};
  assert.ok(checkResult(reverse,e,5).ok);
  for(let k=0;k<12;k++){const a={detached:e.detached,components:e.components.slice()};a.components[k]++;assert.equal(checkResult(a,e,5).ok,false);}
  assert.throws(()=>checkResult({detached:new Uint32Array([0,0]),components:e.components},e,5),/Duplicate/);
  assert.throws(()=>checkResult({detached:[0],components:e.components},e,5),/Uint32Array/);
  assert.throws(()=>checkResult({detached:new Uint32Array([5]),components:e.components},e,5),/Out-of-range/);
  assert.equal(checkResult({detached:new Uint32Array([1,2,4]),components:e.components},e,5).ok,false);
});
test('private mutable inputs cannot contaminate independent trials',()=>{
  const p=prepareScenario(makeScenario('arcology',42,'S',2)),before=structuredClone(p);
  runTrial(baseline,p);runTrial(candidate,p);assert.deepEqual(p,before);
});
test('timers include factory and steps, exclude checking',()=>{
  const p=prepareScenario({id:'tiny',world:makeWorld(1,2,1,()=>true),events:[{edit:edit({remove:[0]})},{edit:edit()}]});
  let t=0;const r=runTrial(candidate,p,()=>++t);assert.equal(r.buildMs,1);assert.equal(r.queryMs,2);assert.equal(r.totalMs,3);
});
test('wrong solver is invalid with no speedup or score',async()=>{
  const r=await benchmark(()=>({step:()=>({detached:new Uint32Array(),components:new Uint32Array()})}),{profile:'quick',repeats:3});assert.equal(r.status,'invalid');assert.equal(r.score,null);assert.equal(r.speedup,null);
});
test('random mixed transactions maintain correct persistent state',()=>{
  const rnd=random(76311);
  for(let seed=0;seed<30;seed++){
    const w=makeWorld(17,13,19,()=>rnd()<.75,()=>rnd()<.003),s=candidate(cloneWorld(w));
    const ids=()=>Array.from({length:40},()=>Math.floor(rnd()*w.solid.length));
    for(let i=0;i<80;i++){const e=edit({remove:ids(),add:ids(),anchorOff:ids(),anchorOn:ids()}),expected=referenceStep(w,e);assert.ok(checkResult(s.step(e),expected,w.solid.length).ok);}
  }
});
test('quick profile produces internally consistent portable reports',async()=>{
  const r=await benchmark(candidate,{profile:'quick',repeats:3});r.candidate='baseline';r.environment={runtime:'test'};assert.equal(r.status,'valid');assert.equal(r.cases.length,8);assert.ok(validReport(r));assert.ok(compatible(r,structuredClone(r)));
  for(const mutate of [r=>r.score=Infinity,r=>r.score+=1,r=>r.cases[0].candidate.totalMs=-1,r=>r.schema=1,r=>r.cases.push(r.cases[0])]){const bad=structuredClone(r);mutate(bad);assert.equal(validReport(bad),false);}
  assert.equal(compatible(r,{...r,seed:1}),false);
});
