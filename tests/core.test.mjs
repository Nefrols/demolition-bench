import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolver as baseline } from '../engine/baseline.js';
import { createSolver as candidate } from '../solver.js';
import { referenceStep, cloneWorld, prepareScenario, checkResult } from '../engine/oracle.js';
import { makeWorld, edgeCases, makeScenario, random } from '../engine/scenarios.js';
import { runTrial, benchmark } from '../engine/benchmark.js';

test('hand-checked unsupported sets and persistent removals', () => {
  const w = makeWorld(1, 6, 1, () => true);
  const oracle = cloneWorld(w), solver = baseline(w);
  for (const [batch, expected] of [[[],[]],[[2],[3,4,5]],[[2,4],[]],[[0],[1]]]) {
    assert.deepEqual([...referenceStep(oracle,batch)],expected);
    assert.deepEqual([...solver.step(Uint32Array.from(batch))],expected);
  }
});

test('alternate supports, arbitrary support location, and empty first step', () => {
  const w = makeWorld(3,2,1,(x,y)=>y===1||x!==1);
  const solver = baseline(w);
  assert.deepEqual([...solver.step(new Uint32Array([0]))],[]);
  assert.deepEqual([...solver.step(new Uint32Array([2]))],[3,4,5]);
  const floating = baseline(makeWorld(2,2,2,()=>true,()=>false));
  assert.equal(floating.step(new Uint32Array()).length,8);
  assert.equal(floating.step(new Uint32Array()).length,0);
});

test('diagonal contacts and row boundaries do not transmit support', () => {
  const w = makeWorld(2,2,2,(x,y,z)=>(x===1&&y===0&&z===0)||(x===0&&y===1&&z===1));
  assert.deepEqual([...baseline(w).step(new Uint32Array())],[6]);
  const row = makeWorld(2,1,2,()=>true,(x,y,z)=>x===1&&z===0);
  row.solid[0]=0; row.solid[3]=0;
  assert.deepEqual([...baseline(row).step(new Uint32Array())],[2]);
});

test('baseline and candidate match independent oracle across seeds and shapes', () => {
  for (const seed of [0,1,42,91871,0xffffffff]) for (const scenario of edgeCases(seed)) {
    const prepared = prepareScenario(scenario);
    runTrial(baseline,prepared); runTrial(candidate,prepared);
  }
});

test('model generators have deterministic replay and correct results', () => {
  for (const kind of ['bridge','tower','lattice']) {
    const a = makeScenario(kind,1234,true), b = makeScenario(kind,1234,true);
    assert.deepEqual(a,b);
    const p = prepareScenario(a); runTrial(candidate,p);
    assert.ok(p.frames.some(f=>f.expected.length>100));
  }
});

test('checker accepts arbitrary order and rejects duplicate, wrong type, extra and missing IDs', () => {
  assert.equal(checkResult(new Uint32Array([9,2]),new Uint32Array([2,9]),10).ok,true);
  assert.throws(()=>checkResult(new Uint32Array([2,2]),new Uint32Array([2]),10),/Duplicate/);
  assert.throws(()=>checkResult([2],new Uint32Array([2]),10),/Uint32Array/);
  assert.throws(()=>checkResult(new Uint32Array([10]),new Uint32Array(),10),/Out-of-range/);
  assert.deepEqual(checkResult(new Uint32Array([1,3]),new Uint32Array([1,2]),10),{ok:false,extra:[3],missing:[2]});
});

test('mutating owned inputs does not contaminate later trials or oracle', () => {
  const scenario = prepareScenario(makeScenario('bridge',42,true));
  const copy = cloneWorld(scenario.world);
  const mutating = input => { const solver=baseline(input); input.anchors.fill(0); input.solid.fill(0); return solver; };
  runTrial(mutating,scenario); runTrial(candidate,scenario);
  assert.deepEqual(scenario.world,copy);
});

test('timing boundaries include factory and steps, exclude validation', () => {
  const scenario = prepareScenario({id:'tiny',world:makeWorld(1,2,1,()=>true),events:[{removed:new Uint32Array([0])},{removed:new Uint32Array()}]});
  let t=0;
  const r=runTrial(candidate,scenario,()=>++t);
  assert.equal(r.buildMs,1);assert.equal(r.queryMs,2);assert.equal(r.totalMs,3);
});

test('wrong solver receives invalid status and no score', async () => {
  const report=await benchmark(()=>({step:()=>new Uint32Array()}),{repeats:3});
  assert.equal(report.status,'invalid');assert.equal(report.score,null);assert.equal(report.speedup,null);
});

test('large irregular random deletion sequences stay correct', () => {
  const rnd=random(76311);
  const world=makeWorld(17,13,19,()=>rnd()<.75,()=>rnd()<.003);
  const solver=candidate(cloneWorld(world));
  for(let i=0;i<80;i++) {
    const removed=Uint32Array.from({length:10},()=>Math.floor(rnd()*world.solid.length));
    const expected=referenceStep(world,removed);
    assert.equal(checkResult(solver.step(removed),expected,world.solid.length).ok,true);
  }
});
