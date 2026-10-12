// Frozen baseline: full reachability traversal after every edit.
// This is deliberately a sound implementation, not a deliberately broken one.
export function createSolver({ nx, ny, nz, solid, anchors }) {
  const plane = nx * nz, count = plane * ny;
  const cells = solid.slice();
  const seen = new Uint32Array(count);
  const queue = new Uint32Array(count);
  const detached = new Uint32Array(count);
  const roots = [];
  for (let i = 0; i < count; i++) if (anchors[i] && cells[i]) roots.push(i);
  let epoch = 0;

  return {
    step(removed) {
      for (let i = 0; i < removed.length; i++) cells[removed[i]] = 0;
      epoch = (epoch + 1) >>> 0;
      if (!epoch) { seen.fill(0); epoch = 1; }
      let head = 0, tail = 0;
      for (let i = 0; i < roots.length; i++) {
        const id = roots[i];
        if (cells[id]) { seen[id] = epoch; queue[tail++] = id; }
      }
      while (head < tail) {
        const id = queue[head++];
        const x = id % nx;
        const z = ((id / nx) | 0) % nz;
        let n;
        if (x > 0) {
          n = id - 1;
          if (cells[n] && seen[n] !== epoch) { seen[n] = epoch; queue[tail++] = n; }
        }
        if (x + 1 < nx) {
          n = id + 1;
          if (cells[n] && seen[n] !== epoch) { seen[n] = epoch; queue[tail++] = n; }
        }
        if (z > 0) {
          n = id - nx;
          if (cells[n] && seen[n] !== epoch) { seen[n] = epoch; queue[tail++] = n; }
        }
        if (z + 1 < nz) {
          n = id + nx;
          if (cells[n] && seen[n] !== epoch) { seen[n] = epoch; queue[tail++] = n; }
        }
        if (id >= plane) {
          n = id - plane;
          if (cells[n] && seen[n] !== epoch) { seen[n] = epoch; queue[tail++] = n; }
        }
        if (id + plane < count) {
          n = id + plane;
          if (cells[n] && seen[n] !== epoch) { seen[n] = epoch; queue[tail++] = n; }
        }
      }
      let length = 0;
      for (let i = 0; i < count; i++) {
        if (cells[i] && seen[i] !== epoch) {
          detached[length++] = i;
          cells[i] = 0;
        }
      }
      return detached.subarray(0, length);
    }
  };
}
