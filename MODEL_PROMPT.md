# Optimize the Demolition Bench solver

You are given a working JavaScript module, `solver.js`, which maintains a voxel structure after destructive edits. Improve its runtime performance while preserving exact correctness.

Only submit a replacement for **`solver.js`**. The evaluator, reference implementation, inputs, scoring, and 3D viewer are fixed. You may rewrite the entire module and choose any internal algorithm, data representation, and synchronous optimization. No particular solution method is required.

## Strict one-shot protocol — exactly one attempt

**You have ONE submission attempt. Your first final answer is the final, irrevocable submission. There will be no test feedback, debugging round, retry, or opportunity to correct an error.** A syntax error, incorrect result, or incompatible API will invalidate the submission even if the intended optimization is promising.

- Use only this prompt and the supplied starter `solver.js` as task materials. Reading those supplied materials is allowed.
- **Do not open or use a browser**, including the 3D viewer, developer tools, browser automation, or a headless browser.
- **Do not search the internet**, fetch external documentation, access repositories, or retrieve additional examples or solutions.
- **Do not execute or test code.** Do not run the starter or your replacement, use a JavaScript console or interpreter, compile or lint the code, or run tests, benchmarks, profilers, or validation tools.
- Do not delegate the task to another agent or model.
- Do not submit a draft, partial implementation, multiple alternatives, or a request for clarification or evaluation. Do not rely on a later message to complete or repair the file.
- You may reason through the algorithm, trace cases manually, and review your code internally before submitting. Writing the final file, if the delivery environment requires it, is allowed; running it is not.

**Produce one complete, ready-to-run solution in one final response.** Choose optimizations whose correctness you can establish from reasoning alone. Independently review syntax, API compatibility, boundary handling, and persistent state before committing your only submission.

## Required API

```js
export function createSolver({ nx, ny, nz, solid, anchors }) {
  return {
    step(removed) {
      return new Uint32Array(/* all newly unsupported voxel IDs */);
    }
  };
}
```

The module must be a self-contained ES module that works in a modern browser Worker and Node.js 20+. Use no external imports, files, network, additional workers, timers, or environment-specific native extensions. Initialization and each step are synchronous. All computation must take place within these calls. Persistent per-instance state is allowed.

## Exact semantics

- The grid dimensions are positive integers. Voxel ID: `x + nx * (z + nz * y)`. Y is the vertical axis.
- `solid` and `anchors` are `Uint8Array`s of length `nx * ny * nz`, containing 0 or 1. `solid[id] === 1` means occupied. `anchors[id] === 1` marks a fixed support, initially occupied. Supports may appear anywhere in the grid.
- These input arrays are private to the solver instance; you may mutate them or create your own copies.
- `step(removed)` receives a `Uint32Array` of valid in-range IDs. The batch can contain duplicates, already-empty cells, or no entries.
- First remove all specified voxels simultaneously.
- A remaining voxel is supported if it has a path through occupied voxels to any remaining anchor, using the six face-adjacent neighbors. Edge and corner contacts do not connect voxels. Grid boundaries do not wrap.
- Return **every remaining unsupported voxel**, exactly once, in a `Uint32Array`. Order is arbitrary. Directly removed voxels and previously empty cells must not appear in the result.
- Remove all returned voxels from the solver's state as well; subsequent calls operate on the resulting structure.
- Anchors can be destroyed. An absent anchor provides no support. Initially floating components must be reported even if the first batch is empty.
- Returned buffers may be reused after the caller has consumed the result, before the next call.
- Multiple independent solver instances must work correctly. No future batches are provided to an instance.

This task concerns exact connectivity under deletions. Rendering and the visual animation of falling debris are handled by the evaluator.

## Evaluation

Correctness is mandatory on all inputs. Tests include boundary conditions, irregular dimensions, multiple or absent supports, alternative support paths, repeated/empty removals, random structures, and sequences of local and large-scale damage. Correct answers must be computed from the supplied inputs, including unfamiliar seeds and shapes.

Performance includes `createSolver` plus all calls to `step`. The evaluator excludes input preparation, oracle computation, checking, rendering, and UI. Both baseline and candidate receive identical scenarios, with warmup and alternating run order. Any invalid answer disqualifies that run from scoring.

For each performance scenario, compare the median baseline and candidate total time. The geometric mean speedup across scenarios determines the score:

`score = 100 * log2(speedup)`

Equal speed gives 0, twice as fast gives +100, twice as slow gives -100. Avoid shifting work outside the measured API or using knowledge of the test generator instead of solving the supplied problem.

Return only the complete replacement `solver.js` in one JavaScript code block. This single response is your only submission and will be evaluated as delivered, without revisions.
