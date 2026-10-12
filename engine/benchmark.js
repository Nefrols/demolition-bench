import {createSolver as baseline} from './baseline.js';
import {cloneWorld,cloneEdit,prepareScenario,checkResult} from './oracle.js';
import {edgeCases,makeScenario,SUITE_VERSION,FIXED_SEED,REPEATS,ROUNDS} from './scenarios.js';

export class ValidationError extends Error{constructor(message,detail={}){super(message);this.name='ValidationError';this.detail=detail;}}
export function runTrial(factory,scenario,now=()=>performance.now()){
  const input=cloneWorld(scenario.world);let start=now();const solver=factory(input),buildMs=now()-start;
  if(!solver||typeof solver.step!=='function')throw new ValidationError('createSolver() must return { step(edit) }');
  let queryMs=0,detached=0,components=0;const stepMs=[],phases={};
  for(let step=0;step<scenario.frames.length;step++){
    const frame=scenario.frames[step],transaction=cloneEdit(frame.edit);
    start=now();const result=solver.step(transaction),elapsed=now()-start;
    queryMs+=elapsed;stepMs.push(elapsed);phases[frame.phase]=(phases[frame.phase]||0)+elapsed;
    let diff;
    try{diff=checkResult(result,frame.expected,input.solid.length);}
    catch(e){throw new ValidationError(e.message,{scenario:scenario.id,step});}
    if(!diff.ok)throw new ValidationError(`Wrong result in ${scenario.id}, step ${step}${diff.componentError?': '+diff.componentError:''}`,{scenario:scenario.id,step,missingCount:diff.missing.length,extraCount:diff.extra.length,missing:diff.missing.slice(0,32),extra:diff.extra.slice(0,32)});
    detached+=result.detached.length;components+=result.components.length/12;
  }
  return {buildMs,queryMs,totalMs:buildMs+queryMs,detached,components,stepMs,phases};
}
export function median(values){const s=[...values].sort((a,b)=>a-b);return s.length%2?s[s.length>>1]:(s[s.length/2-1]+s[s.length/2])/2;}
function sample(factory,scenario,rounds){
  const trials=[];for(let i=0;i<rounds;i++)trials.push(runTrial(factory,scenario));
  const mean=k=>trials.reduce((s,t)=>s+t[k],0)/rounds;
  const phases={};for(const t of trials)for(const [p,v] of Object.entries(t.phases))phases[p]=(phases[p]||0)+v/rounds;
  return {totalMs:mean('totalMs'),buildMs:mean('buildMs'),queryMs:mean('queryMs'),stepMs:trials.flatMap(t=>t.stepMs),phases};
}
function summarize(runs){
  const steps=runs.flatMap(r=>r.stepMs).sort((a,b)=>a-b),phases={};
  for(const p of Object.keys(runs[0].phases))phases[p]=median(runs.map(r=>r.phases[p]));
  return {totalMs:median(runs.map(r=>r.totalMs)),buildMs:median(runs.map(r=>r.buildMs)),queryMs:median(runs.map(r=>r.queryMs)),p95StepMs:steps[Math.floor((steps.length-1)*.95)],minMs:Math.min(...runs.map(r=>r.totalMs)),maxMs:Math.max(...runs.map(r=>r.totalMs)),phases,runs:runs.map(({stepMs,...rest})=>rest)};
}
const yieldTask=()=>new Promise(r=>setTimeout(r,0));
export async function benchmark(candidate,options={},progress=()=>{}){
  const report={schema:3,suite:SUITE_VERSION,repeats:REPEATS,status:'running',score:null,speedup:null,cases:[],correctness:{passed:0,total:0}};
  try{
    const checks=edgeCases(FIXED_SEED^0xA53C9E17);report.correctness.total=checks.length;
    for(const s of checks){const ready=prepareScenario(s);runTrial(baseline,ready);runTrial(candidate,ready);report.correctness.passed++;}
    progress({text:'Проверка корректности пройдена. Прогрев…',fraction:.2});await yieldTask();
    const scenario=prepareScenario(makeScenario());
    for(let i=0;i<3;i++){runTrial(baseline,scenario);runTrial(candidate,scenario);}
    const b=[],c=[];
    for(let r=0;r<REPEATS;r++){
      progress({text:`Измеряем код · ${r+1}/${REPEATS}`,fraction:.2+.7*r/REPEATS});await yieldTask();
      if(r%2){c.push(sample(candidate,scenario,ROUNDS));b.push(sample(baseline,scenario,ROUNDS));}
      else{b.push(sample(baseline,scenario,ROUNDS));c.push(sample(candidate,scenario,ROUNDS));}
    }
    const base=summarize(b),cand=summarize(c);
    report.cases.push({id:scenario.id,title:scenario.title,cells:scenario.world.solid.length,steps:scenario.frames.length,rounds:ROUNDS,baseline:base,candidate:cand,speedup:base.totalMs/Math.max(cand.totalMs,.0001)});
    report.speedup=report.cases[0].speedup;
    report.score=100*Math.log2(report.speedup);report.status='valid';
    report.noisy=[base,cand].some(t=>(t.maxMs-t.minMs)/Math.max(t.totalMs,.001)>.25);
  }catch(e){report.status='invalid';report.error={message:e.message,...e.detail};}
  return report;
}
export function replay(candidate){
  const s=prepareScenario(makeScenario()),solver=candidate(cloneWorld(s.world));
  if(!solver||typeof solver.step!=='function')throw new Error('createSolver() must return { step(edit) }');
  const frames=[];let valid=true,error=null;
  for(const f of s.frames){
    let actual={detached:new Uint32Array(),components:new Uint32Array()},diff={ok:false,extra:[],missing:[],componentError:''};
    try{const result=solver.step(cloneEdit(f.edit));diff=checkResult(result,f.expected,s.world.solid.length);actual={detached:result.detached.slice(),components:result.components.slice()};}
    catch(e){error=e.message;}
    frames.push({...f,actual,missing:diff.missing,extra:diff.extra,componentError:diff.componentError});
    if(!diff.ok){valid=false;error||=`Шаг ${frames.length-1}: ${diff.componentError||'неверный состав фрагментов'}`;break;}
  }
  return {id:s.id,title:s.title,world:s.world,frames,valid,error};
}
