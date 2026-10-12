import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifyIntegrity } from '../integrity.mjs';

const root = fileURLToPath(new URL('../',import.meta.url));
async function invoke(source,name,args=[]) {
  await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
  const relative=`artifacts/test-${name}.js`;
  await writeFile(new URL('../'+relative,import.meta.url),source);
  return new Promise((resolve,reject)=>{
    const processHandle=spawn(process.execPath,['cli.mjs','--candidate',relative,'--out',`artifacts/test-${name}.json`,...args],{cwd:root,windowsHide:true});
    let output='';
    processHandle.stdout.on('data',x=>output+=x);processHandle.stderr.on('data',x=>output+=x);
    processHandle.on('error',reject);processHandle.on('close',code=>resolve({code,output}));
  });
}
test('frozen evaluator hashes match',async()=>verifyIntegrity());
test('CLI rejects wrong answers and exports unscored failure',async()=>{
  const result=await invoke('export const apiVersion=2; export function createSolver(){return {step(){return {detached:new Uint32Array(),components:new Uint32Array()}}}}','wrong');
  assert.equal(result.code,1);assert.match(result.output,/INVALID/);
  const report=JSON.parse(await readFile(new URL('../artifacts/test-wrong.json',import.meta.url),'utf8'));
  assert.equal(report.score,null);assert.equal(report.status,'invalid');
});
test('CLI terminates infinite candidate',async()=>{
  const result=await invoke('export const apiVersion=2; export function createSolver(){while(true){}}','hang',['--timeout','0.25']);
  assert.equal(result.code,2);assert.match(result.output,/TIMEOUT/);
});
test('CLI reports syntax errors',async()=>{
  const result=await invoke('export function ! invalid','syntax');
  assert.equal(result.code,2);assert.match(result.output,/Unexpected/);
});
