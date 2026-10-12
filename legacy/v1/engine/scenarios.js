export const SUITE_VERSION = 'demolition-1.0.0';

export function random(seed) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function makeWorld(nx, ny, nz, predicate, anchorPredicate = (x, y) => y === 0) {
  const solid = new Uint8Array(nx * ny * nz), anchors = new Uint8Array(solid.length);
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const id = x + nx * (z + nz * y);
    if (predicate(x, y, z)) { solid[id] = 1; anchors[id] = +!!anchorPredicate(x, y, z); }
  }
  return { nx, ny, nz, solid, anchors };
}

export function select(world, predicate) {
  const ids = [];
  for (let y = 0; y < world.ny; y++) for (let z = 0; z < world.nz; z++) for (let x = 0; x < world.nx; x++) {
    if (predicate(x, y, z)) ids.push(x + world.nx * (z + world.nz * y));
  }
  return Uint32Array.from(ids);
}

export function makeScenario(kind, seed = 314159, compact = false) {
  const rnd = random(seed);
  let world;
  if (kind === 'bridge') {
    const nx = compact ? 56 : 96, ny = compact ? 30 : 44, nz = compact ? 24 : 40;
    const deck = Math.floor(ny * .58), z0 = Math.floor(nz * .28), z1 = nz - z0;
    world = makeWorld(nx, ny, nz, (x, y, z) => {
      const pier = x % 18 >= 6 && x % 18 <= 9 && z >= z0 + 2 && z <= z1 - 2;
      const rail = (z === z0 || z === z1) && y > deck && y < deck + 8;
      return (pier && y <= deck) || (y >= deck && y <= deck + 2 && z >= z0 && z <= z1)
        || (rail && (y === deck + 7 || x % 9 === 0 || y - deck === x % 8));
    });
  } else if (kind === 'tower') {
    const nx = compact ? 30 : 56, ny = compact ? 44 : 80, nz = nx;
    world = makeWorld(nx, ny, nz, (x, y, z) => {
      const outer = x >= 3 && x < nx - 3 && z >= 3 && z < nz - 3;
      const wall = x < 5 || x >= nx - 5 || z < 5 || z >= nz - 5;
      const window = y % 9 > 3 && y % 9 < 7 && ((x % 7 > 1 && x % 7 < 5) || (z % 7 > 1 && z % 7 < 5));
      const pillars = (x % 12 < 2 && z % 12 < 2);
      return outer && ((wall && !window) || y % 9 < 2 || pillars);
    });
  } else {
    const nx = compact ? 34 : 64, ny = compact ? 34 : 56, nz = nx;
    world = makeWorld(nx, ny, nz, (x, y, z) => {
      const px = x % 8 < 2, pz = z % 8 < 2, py = y % 8 < 2;
      return (px && pz) || (py && (px || pz));
    });
  }
  const events = [{ label: 'Проверка исходной конструкции', removed: new Uint32Array() }];
  const { nx, ny, nz } = world;
  const rounds = compact ? 8 : 28;
  for (let j = 0; j < rounds; j++) {
    const cx = rnd() * nx, cy = ny * (.15 + rnd() * .72), cz = rnd() * nz;
    const r = compact ? 2.5 : 2 + rnd() * 3;
    events.push({ label: `Локальное повреждение ${j + 1}`, removed: select(world, (x, y, z) => (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 <= r * r) });
  }
  // Successive support cuts leave alternate routes until the final cut.
  const bands = compact ? 5 : 8;
  for (let b = 0; b < bands; b++) {
    events.push({ label: `Подрыв опор · сектор ${b + 1}/${bands}`, removed: select(world, (x, y) => y >= 1 && y <= 2 && x >= nx * b / bands && x < nx * (b + 1) / bands) });
  }
  events.push({ label: 'Повторное повреждение пустой области', removed: events.at(-1).removed.slice() });
  events.push({ label: 'Проверка установившегося состояния', removed: new Uint32Array() });
  return { id: kind, title: { bridge: 'Виадук', tower: 'Высотная башня', lattice: 'Пространственная ферма' }[kind], world, events };
}

export function edgeCases(seed) {
  const cases = [];
  const add = (id, world, batches) => cases.push({ id, title: id, world, events: batches.map(removed => ({ label: id, removed: Uint32Array.from(removed) })) });
  add('empty', makeWorld(3, 3, 3, () => false), [[], [0, 0], []]);
  add('single-root', makeWorld(1, 1, 1, () => true), [[], [0, 0], []]);
  add('floating', makeWorld(4, 4, 4, (x, y) => y === 2), [[], []]);
  add('chain', makeWorld(1, 9, 1, () => true), [[], [3], [3, 5], [0]]);
  add('side-anchor', makeWorld(7, 1, 1, () => true, x => x === 6), [[], [3], [6]]);
  add('diagonal-is-not-contact', makeWorld(3, 3, 3, (x, y, z) => x === y && y === z), [[], []]);
  add('two-supports', makeWorld(7, 6, 1, (x, y) => x === 0 || x === 6 || y === 5), [[7], [13], []]);
  add('row-boundary', makeWorld(3, 2, 2, (x, y, z) => (x === 2 && z === 0 && y === 0) || (x === 0 && z === 1)), [[], []]);
  const rnd = random(seed);
  for (let k = 0; k < 16; k++) {
    const nx = 2 + (rnd() * 9 | 0), ny = 2 + (rnd() * 9 | 0), nz = 2 + (rnd() * 9 | 0);
    const w = makeWorld(nx, ny, nz, () => rnd() < .57, () => rnd() < .08);
    const batches = [[]];
    for (let i = 0; i < 12; i++) batches.push(Array.from({ length: 1 + (rnd() * 15 | 0) }, () => rnd() * w.solid.length | 0));
    add(`random-${k}`, w, batches);
  }
  return cases;
}
