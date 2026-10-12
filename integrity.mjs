import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function verifyIntegrity() {
  const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
  for (const [file, expected] of Object.entries(manifest.files)) {
    const data = await readFile(new URL(file, import.meta.url));
    if (createHash('sha256').update(data).digest('hex') !== expected) throw new Error(`Fixed harness changed: ${file}. Use a clean evaluator copy.`);
  }
}
