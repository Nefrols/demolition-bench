import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { benchmark } from './engine/benchmark.js';
import { verifyIntegrity } from './integrity.mjs';

if (!isMainThread) {
  try {
    const { createSolver, apiVersion } = await import(`data:text/javascript;base64,${Buffer.from(workerData.source).toString('base64')}`);
    if (apiVersion !== 2) throw new Error('Expected apiVersion = 2; V1 solvers use the V1 evaluator.');
    if (typeof createSolver !== 'function') throw new Error('Missing export createSolver');
    const result = await benchmark(createSolver, workerData, p => parentPort.postMessage({ type: 'progress', text: p.text }));
    parentPort.postMessage({ type: 'result', result });
  } catch (e) { parentPort.postMessage({ type: 'error', message: e.message }); }
} else {
  const args = process.argv.slice(2);
  const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
  if (args.includes('--help')) {
    console.log('node cli.mjs --candidate solver.js --profile quick|standard|stress --seed 314159 --repeats 5 --out result.json --timeout 600');
  } else {
    const seed = Number(option('--seed', '314159'));
    const timeout = Number(option('--timeout', '600'));
    const profile = option('--profile', 'standard');
    const repeats = Number(option('--repeats', '5'));
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isFinite(timeout) || timeout <= 0 || !Number.isInteger(repeats) || repeats < 3 || repeats > 15) throw new Error('Invalid seed, timeout or repeat count');
    await verifyIntegrity();
    const candidatePath = resolve(option('--candidate', 'solver.js'));
    const source = await readFile(candidatePath, 'utf8');
    const worker = new Worker(new URL(import.meta.url), { workerData: { source, seed, repeats, profile } });
    const timer = setTimeout(() => { console.error('TIMEOUT: candidate exceeded time limit; no score'); worker.terminate(); process.exitCode = 2; }, timeout * 1000);
    worker.on('error', e => { clearTimeout(timer); console.error(e); process.exitCode = 2; });
    worker.on('message', async message => {
      if (message.type === 'progress') { console.log(message.text); return; }
      clearTimeout(timer);
      if (message.type === 'error') { console.error(message.message); process.exitCode = 2; }
      else {
        const report = { ...message.result, candidate: candidatePath, candidateSHA256: createHash('sha256').update(source).digest('hex'), environment: { runtime: process.version, platform: process.platform, arch: process.arch }, integrity: 'verified' };
        console.table(report.cases.map(c => ({ scene: c.id, baseline_ms: c.baseline.totalMs.toFixed(2), candidate_ms: c.candidate.totalMs.toFixed(2), speedup: c.speedup.toFixed(3) })));
        console.log(report.status === 'valid' ? `Score: ${report.score.toFixed(1)}; speedup: ${report.speedup.toFixed(3)}x` : `INVALID: ${JSON.stringify(report.error)}`);
        await writeFile(resolve(option('--out', 'result.json')), JSON.stringify(report, null, 2));
        if (report.status !== 'valid') process.exitCode = 1;
      }
      await worker.terminate();
    });
  }
}
