import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

test('static build contains working browser assets and verified hashes only', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await promisify(execFile)(process.execPath, ['tools/build.mjs'], { cwd: root, windowsHide: true });
  const output = new URL('../dist/', import.meta.url);
  const files = await readdir(output);
  for (const name of ['index.html', 'app.js', 'render.js', 'worker.js', 'solver.js', 'style.css', 'manifest.json', 'engine', 'README.md', 'MODEL_PROMPT.md', 'DEPLOY.md', '.nojekyll']) assert.ok(files.includes(name), `Missing ${name}`);
  for (const name of ['node_modules', 'artifacts', 'server.mjs', 'cli.mjs', 'integrity.mjs', 'tests']) assert.ok(!files.includes(name), `Unexpected ${name}`);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', output), 'utf8'));
  for (const [name, expected] of Object.entries(manifest.files)) {
    const data = await readFile(new URL(name, output));
    assert.equal(createHash('sha256').update(data).digest('hex'), expected);
  }
  assert.equal(await readFile(new URL('solver.js', output), 'utf8'), await readFile(new URL('../engine/baseline.js', import.meta.url), 'utf8'));
});
