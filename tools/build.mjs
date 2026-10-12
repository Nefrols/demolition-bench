// Static GitHub Pages artifact. No Node.js server is deployed.
import { cp, copyFile, mkdir, writeFile, readFile, lstat, realpath, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyIntegrity } from '../integrity.mjs';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(root, 'dist');
const runtime = ['index.html', 'style.css', 'app.js', 'reports.js', 'render.js', 'worker.js', 'engine/baseline.js', 'engine/oracle.js', 'engine/scenarios.js', 'engine/benchmark.js'];
const downloads = ['MODEL_PROMPT.md', 'README.md', 'DEPLOY.md'];
await verifyIntegrity();

// Only replace this project's own generated dist directory; never follow a link.
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Unexpected build destination');
const previous = await lstat(output).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
if (previous) {
  if (previous.isSymbolicLink() || !previous.isDirectory() || await realpath(output) !== output) throw new Error('Unsafe build destination');
  await rm(output, { recursive: true });
}
await mkdir(path.join(output, 'engine'), { recursive: true });
const sourceManifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const manifest = { version: sourceManifest.version, files: {} };
for (const file of [...runtime, ...downloads]) {
  await copyFile(path.join(root, file), path.join(output, file));
  if (runtime.includes(file) || file === 'MODEL_PROMPT.md') manifest.files[file] = createHash('sha256').update(await readFile(path.join(output, file))).digest('hex');
}
// Public page always starts with the known baseline, regardless of local experiments.
await copyFile(path.join(root, 'engine/baseline.js'), path.join(output, 'solver.js'));
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(output, '.nojekyll'), '');
await cp(path.join(root, 'legacy/v1'), path.join(output, 'v1'), {recursive:true});
console.log(`Static site ready: ${output} (${runtime.length + downloads.length + 3} files)`);
