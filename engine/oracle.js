// Independent oracle: union-find over present voxels, rebuilt after each edit.
// It deliberately does not share the baseline's traversal implementation.
export function referenceStep(world, removed) {
  const { nx, ny, nz, solid, anchors } = world;
  const plane = nx * nz, n = plane * ny;
  for (const id of removed) solid[id] = 0;
  const parent = new Int32Array(n).fill(-1);
  const size = new Uint32Array(n);
  function root(a) {
    while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
    return a;
  }
  function join(a, b) {
    a = root(a); b = root(b);
    if (a === b) return;
    if (size[a] < size[b]) [a, b] = [b, a];
    parent[b] = a; size[a] += size[b];
  }
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const i = x + nx * (z + nz * y);
    if (!solid[i]) continue;
    parent[i] = i; size[i] = 1;
    if (x && solid[i - 1]) join(i, i - 1);
    if (z && solid[i - nx]) join(i, i - nx);
    if (y && solid[i - plane]) join(i, i - plane);
  }
  const supported = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (solid[i] && anchors[i]) supported[root(i)] = 1;
  const result = [];
  for (let i = 0; i < n; i++) if (solid[i] && !supported[root(i)]) result.push(i);
  for (const id of result) solid[id] = 0;
  return Uint32Array.from(result);
}

export function cloneWorld(w) {
  return { nx: w.nx, ny: w.ny, nz: w.nz, solid: w.solid.slice(), anchors: w.anchors.slice() };
}

export function prepareScenario(scenario) {
  const world = cloneWorld(scenario.world);
  const frames = scenario.events.map(event => ({
    removed: event.removed.slice(),
    label: event.label,
    expected: referenceStep(world, event.removed)
  }));
  return { ...scenario, frames };
}

export function checkResult(result, expected, count) {
  if (!(result instanceof Uint32Array)) throw new Error('step() must return a Uint32Array');
  if (result.length > count) throw new Error('Result is larger than the world');
  const actual = result.slice().sort();
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] >= count) throw new Error(`Out-of-range voxel: ${actual[i]}`);
    if (i && actual[i] === actual[i - 1]) throw new Error(`Duplicate voxel: ${actual[i]}`);
  }
  let a = 0, b = 0;
  const extra = [], missing = [];
  while (a < actual.length || b < expected.length) {
    if (a < actual.length && b < expected.length && actual[a] === expected[b]) { a++; b++; }
    else if (b >= expected.length || (a < actual.length && actual[a] < expected[b])) extra.push(actual[a++]);
    else missing.push(expected[b++]);
  }
  return { ok: !extra.length && !missing.length, extra, missing };
}
