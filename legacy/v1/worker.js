import { benchmark, replay } from './engine/benchmark.js';

self.onmessage = async ({ data }) => {
  let url;
  try {
    url = URL.createObjectURL(new Blob([data.source], { type: 'text/javascript' }));
    const module = await import(url);
    if (typeof module.createSolver !== 'function') throw new Error('Модуль должен экспортировать createSolver');
    const result = data.action === 'replay'
      ? replay(module.createSolver, data.kind, data.seed)
      : await benchmark(module.createSolver, data, p => self.postMessage({ type: 'progress', ...p }));
    self.postMessage({ type: 'result', result });
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
  finally { if (url) URL.revokeObjectURL(url); }
};
