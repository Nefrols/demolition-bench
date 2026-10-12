import { createSolver as baseline } from './baseline.js';
import { cloneWorld, prepareScenario, checkResult } from './oracle.js';
import { edgeCases, makeScenario, SUITE_VERSION } from './scenarios.js';

export class ValidationError extends Error {
  constructor(message, detail = {}) { super(message); this.name = 'ValidationError'; this.detail = detail; }
}

export function runTrial(factory, scenario, now = () => performance.now()) {
  // Input preparation, reference computation and result checks are outside timers.
  const input = cloneWorld(scenario.world);
  let start = now();
  const solver = factory(input);
  const buildMs = now() - start;
  if (!solver || typeof solver.step !== 'function') throw new ValidationError('createSolver() must return { step(removed) }');
  let queryMs = 0, detached = 0;
  for (let step = 0; step < scenario.frames.length; step++) {
    const frame = scenario.frames[step], batch = frame.removed.slice();
    start = now();
    const result = solver.step(batch);
    queryMs += now() - start;
    let diff;
    try { diff = checkResult(result, frame.expected, input.solid.length); }
    catch (error) { throw new ValidationError(error.message, { scenario: scenario.id, step }); }
    if (!diff.ok) throw new ValidationError(`Wrong detached set in ${scenario.id}, step ${step}`, { scenario: scenario.id, step, ...diff });
    detached += result.length;
  }
  return { buildMs, queryMs, totalMs: buildMs + queryMs, detached };
}

const median = values => { const s = [...values].sort((a, b) => a - b); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));

export async function benchmark(candidate, options = {}, progress = () => {}) {
  const seed = (options.seed ?? 314159) >>> 0;
  const repeats = Math.max(3, Math.min(15, Math.floor(options.repeats || 5)));
  const report = { schema: 1, suite: SUITE_VERSION, seed, repeats, status: 'running', score: null, speedup: null, cases: [], correctness: { passed: 0, total: 0 }, createdAt: new Date().toISOString() };
  try {
    const checks = edgeCases(seed ^ 0xA53C9E17);
    report.correctness.total = checks.length;
    for (const s of checks) {
      const ready = prepareScenario(s);
      runTrial(baseline, ready);
      runTrial(candidate, ready);
      report.correctness.passed++;
    }
    progress({ stage: 'correctness', text: `Граничные тесты: ${checks.length}/${checks.length}` });
    await yieldTask();
    const kinds = ['bridge', 'tower', 'lattice'];
    for (const kind of kinds) {
      progress({ stage: 'prepare', text: `Эталон и прогрев: ${kind}` });
      await yieldTask();
      const scenario = prepareScenario(makeScenario(kind, seed));
      runTrial(baseline, scenario);
      runTrial(candidate, scenario);
      const b = [], c = [];
      for (let r = 0; r < repeats; r++) {
        progress({ stage: 'measure', text: `${scenario.title}: серия ${r + 1}/${repeats}` });
        await yieldTask();
        // Alternate order to limit warm-cache and thermal bias.
        if (r % 2) { c.push(runTrial(candidate, scenario)); b.push(runTrial(baseline, scenario)); }
        else { b.push(runTrial(baseline, scenario)); c.push(runTrial(candidate, scenario)); }
      }
      const summarize = runs => ({
        totalMs: median(runs.map(r => r.totalMs)), buildMs: median(runs.map(r => r.buildMs)), queryMs: median(runs.map(r => r.queryMs)),
        minMs: Math.min(...runs.map(r => r.totalMs)), maxMs: Math.max(...runs.map(r => r.totalMs)), runs
      });
      const base = summarize(b), cand = summarize(c);
      const speedup = base.totalMs / Math.max(cand.totalMs, .0001);
      report.cases.push({ id: kind, title: scenario.title, cells: scenario.world.solid.length, occupied: scenario.world.solid.reduce((a, v) => a + v, 0), steps: scenario.frames.length, baseline: base, candidate: cand, speedup });
    }
    report.speedup = Math.exp(report.cases.reduce((sum, s) => sum + Math.log(s.speedup), 0) / report.cases.length);
    report.score = 100 * Math.log2(report.speedup);
    report.status = 'valid';
  } catch (error) {
    report.status = 'invalid';
    report.error = { message: error.message, ...error.detail };
  }
  return report;
}

export function replay(candidate, kind, seed) {
  const scenario = prepareScenario(makeScenario(kind, seed, true));
  const solver = candidate(cloneWorld(scenario.world));
  if (!solver || typeof solver.step !== 'function') throw new Error('createSolver() must return { step(removed) }');
  const frames = [];
  let valid = true, error = null;
  for (const frame of scenario.frames) {
    let actual = new Uint32Array(), diff = { ok: false, missing: [], extra: [] };
    try {
      const result = solver.step(frame.removed.slice());
      diff = checkResult(result, frame.expected, scenario.world.solid.length);
      actual = result.slice();
    } catch (e) { error = e.message; }
    frames.push({ ...frame, actual, missing: diff.missing, extra: diff.extra });
    if (!diff.ok) { valid = false; error ||= `Расхождение на шаге ${frames.length - 1}`; break; }
  }
  return { id: scenario.id, title: scenario.title, world: scenario.world, frames, valid, error };
}
