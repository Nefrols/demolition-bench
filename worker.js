import { benchmark, replay } from './engine/benchmark.js';
import { createSolver as baseline } from './engine/baseline.js';

self.onmessage = async ({ data }) => {
  let url;
  try {
    if(data.action==='preview'){
      self.postMessage({type:'result',result:{replay:replay(baseline)}});
      return;
    }
    url = URL.createObjectURL(new Blob([data.source], { type: 'text/javascript' }));
    const module = await import(url);
    if (module.apiVersion !== 2) throw new Error('Нужен solver API V2: export const apiVersion = 2.');
    if (typeof module.createSolver !== 'function') throw new Error('Модуль должен экспортировать createSolver');
    const report=await benchmark(module.createSolver, {}, p=>self.postMessage({type:'progress',...p}));
    const result={report,replay:report.status==='valid'?replay(module.createSolver):null};
    self.postMessage({ type: 'result', result });
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
  finally { if (url) URL.revokeObjectURL(url); }
};
