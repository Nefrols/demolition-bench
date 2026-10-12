# Optimize the Demolition Bench solver

You are given a working JavaScript module, `solver.js`, which maintains a voxel structure under transactional destruction, rebuilding, and changes of supports. Improve its runtime performance while preserving exact correctness.

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

## Required API (V2)

```js
export const apiVersion = 2;
export function createSolver({ nx, ny, nz, solid, anchors }) {
  return {
    step({ remove, add, anchorOff, anchorOn }) {
      return { detached: new Uint32Array(), components: new Uint32Array() };
    }
  };
}
```

Use a self-contained ES module for a modern browser Worker and Node.js 20+. No imports, files, network, additional workers, timers, native extensions, GPU or asynchronous work. Initialization and steps are synchronous. All input-dependent computation must occur inside these measured calls. Persistent per-instance state is allowed; caches shared between instances, precomputed answers, recognizing benchmark seeds/shapes, and modifying the evaluation environment are forbidden. Ordinary module-level constants and function declarations are allowed. Choose any correct algorithm and data representation.

## Exact state and transaction semantics

- Dimensions are integers in [1,64], with `nx*ny*nz <= 32768`. ID is `x + nx * (z + nz * y)`. Coordinates start at zero; Y is vertical.
- `solid` and `anchors` are `Uint8Array`s of grid size containing 0 or 1. Anchors initially mark occupied cells and may occur anywhere, not just at ground level. Initial floating components are allowed.
- Input arrays are private mutable copies. Each instance is independent. Future transactions are not provided.
- All four transaction fields are `Uint32Array`s of valid in-range IDs, and always present. They may be empty, contain duplicates, or refer to empty cells. Transaction arrays are also private copies, so you may mutate them.
- Apply the following phases in exactly this order, without evaluating connectivity between phases:
  1. `remove`: erase cells and their anchor flags.
  2. `add`: occupy absent cells, initially unanchored. Adding an already occupied cell changes nothing, including its anchor flag.
  3. `anchorOff`: clear anchor flags.
  4. `anchorOn`: set anchor flags for occupied cells only. Anchoring air has no effect and is not remembered for future additions.
- After all four phases, an occupied cell is supported iff a path of occupied cells connects it to any anchor through the six face-adjacent neighbors. Edge/corner contacts do not connect. Boundaries never wrap.
- Identify every unsupported connected component. Return all its IDs exactly once in `detached`; order is arbitrary. Directly removed cells and empty cells are excluded.
- Return a record for each unsupported component in `components`, defined below. Then erase all detached cells and anchor flags from persistent state before the next step. Detached cells can be explicitly rebuilt in future transactions.
- Even an empty first transaction must report initially floating cells. After detachment, an empty transaction returns empty arrays.
- Output arrays must be `Uint32Array`s with exact lengths; backing buffers may be reused after consumption, before the next API call. No asynchronous modification or delayed computation.

## Exact fragment reductions

`components` is a packed flat array of 12 unsigned integers per detached component, in this field order:

| Offset | Field | Meaning |
|---|---|---|
| 0 | minId | Smallest voxel ID in this component; its unique identifier |
| 1 | count | Number of cells in the component |
| 2,3,4 | sumX, sumY, sumZ | Exact integer sums of the coordinates of all component cells |
| 5 | surfaceFaces | Number of unit faces adjacent to air or outside the grid, including enclosed cavities |
| 6,7,8 | minX, minY, minZ | Inclusive minimum coordinates |
| 9,10,11 | maxX, maxY, maxZ | Inclusive maximum coordinates |

Compute these values **after the transaction but before removing detached cells**. Record order is arbitrary; field order is fixed. One record per component, no duplicates. Every sum fits in uint32 under the stated bounds. No floating-point approximation or hashes as substitutes. Supported components must not appear in either output.

Example: in a 3x1x1 world with cells 1 and 2 occupied and no anchors, an empty transaction returns `detached = [1,2]` and one record `[1,2,3,0,0,10,1,0,0,2,0,0]`. Two adjacent cubes have ten exposed faces. The next empty step returns two empty arrays.

This is discrete dynamic connectivity and component reduction, not a structural mechanics solver. The fixed viewer animates the answer; you do not implement graphics or debris collisions.

## Evaluation and workload

Correctness is mandatory for any valid input, including unseen seeds, shapes, dimensions, and transaction sequences. Validation covers all returned IDs and every field of every component. Tests include cavities, thin paths, many independent fragments, alternative supports, absent supports, row boundaries, duplicate edits, overlapping phases, and initial floating structures. One wrong answer invalidates the run; there is no score for a fast but incorrect result.

The browser benchmark uses one fixed, compact construction with 18,432 grid cells and 24 online transactions. It mixes cavities, alternative support paths, thin bridges, local damage and repair, anchor transfers, cuts, reconnection, collapse and reconstruction. There are no growing sizes or selectable workloads. Correctness checks use additional small shapes and mixed transactions. Compute answers from the inputs; do not identify or hard-code the fixed scenario.

Measured cost includes `createSolver` plus all synchronous `step` calls, including allocations. Input copies, oracle computation, validation, rendering, UI and module import are excluded. All input-dependent work must stay inside the measured API. Both implementations receive identical inputs, warm up, and run five series of four fresh instances each, alternating order. This count is fixed for all solutions and devices; slow candidates do not trigger extra work. The median average total time per instance determines the result.

`speedup = baseline time / candidate time`
`score = 100 * log2(speedup)`

Equal speed gives 0; twice as fast +100; four times as fast +200; twice as slow -100. There is no score cap. The complete browser run, including validation, has a 120-second wall-clock limit; timeout is unscored. Complexity comes from correct online updates and reductions, not a growing volume of input. Any correct synchronous algorithm is allowed. Efficient initialization, local updates, traversals, and memory access all matter.

Return only the complete replacement `solver.js` in one JavaScript code block. This single response is your only submission and will be evaluated as delivered, without revisions.
