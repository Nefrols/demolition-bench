import test from 'node:test';
import assert from 'node:assert/strict';
import {createSolver as baseline} from '../engine/baseline.js';
import {createSolver as candidate} from '../solver.js';
import {referenceStep,cloneWorld,prepareScenario,checkResult} from '../engine/oracle.js';
import {makeWorld,edgeCases,makeScenario,random,edit,REPEATS,ROUNDS,RUN_LIMIT_MS} from '../engine/scenarios.js';
import {runTrial,benchmark} from '../engine/benchmark.js';

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
test('fixed compact scenario stays within its budget and exercises collapse',()=>{
  const a=makeScenario();assert.deepEqual(a,makeScenario());assert.equal(a.world.solid.length,18432);assert.equal(a.events.length,24);
  const p=prepareScenario(a);runTrial(candidate,p);assert.ok(p.frames.some(f=>f.expected.detached.length>100));
  assert.equal(RUN_LIMIT_MS,120000);assert.equal(REPEATS,5);assert.equal(ROUNDS,4);
  for(const s of edgeCases(1))assert.ok(s.world.solid.length<=18432);
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
  const p=prepareScenario(makeScenario()),before=structuredClone(p);
  runTrial(baseline,p);runTrial(candidate,p);assert.deepEqual(p,before);
});
test('timers include factory and steps, exclude checking',()=>{
  const p=prepareScenario({id:'tiny',world:makeWorld(1,2,1,()=>true),events:[{edit:edit({remove:[0]})},{edit:edit()}]});
  let t=0;const r=runTrial(candidate,p,()=>++t);assert.equal(r.buildMs,1);assert.equal(r.queryMs,2);assert.equal(r.totalMs,3);
});
test('wrong solver is invalid with no speedup or score',async()=>{
  const r=await benchmark(()=>({step:()=>({detached:new Uint32Array(),components:new Uint32Array()})}));assert.equal(r.status,'invalid');assert.equal(r.score,null);assert.equal(r.speedup,null);
});
test('random mixed transactions maintain correct persistent state',()=>{
  const rnd=random(76311);
  for(let seed=0;seed<30;seed++){
    const w=makeWorld(17,13,19,()=>rnd()<.75,()=>rnd()<.003),s=candidate(cloneWorld(w));
    const ids=()=>Array.from({length:40},()=>Math.floor(rnd()*w.solid.length));
    for(let i=0;i<80;i++){const e=edit({remove:ids(),add:ids(),anchorOff:ids(),anchorOn:ids()}),expected=referenceStep(w,e);assert.ok(checkResult(s.step(e),expected,w.solid.length).ok);}
  }
});
test('all candidates receive one fixed workload and repetition count',async()=>{
  const r=await benchmark(candidate);assert.equal(r.status,'valid');assert.equal(r.cases.length,1);
  assert.equal(r.repeats,5);assert.equal(r.cases[0].rounds,4);assert.equal(r.cases[0].steps,24);
  assert.equal(r.score,100*Math.log2(r.speedup));assert.equal(r.cases[0].baseline.runs.length,5);
  assert.ok(!('profile' in r));assert.ok(!('seed' in r));
});
