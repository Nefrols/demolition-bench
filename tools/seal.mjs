// Maintainer utility. Bump the suite version if changing benchmark semantics.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = ['index.html','style.css','app.js','MODEL_PROMPT.md','render.js','worker.js','server.mjs','cli.mjs','integrity.mjs','engine/baseline.js','engine/oracle.js','engine/scenarios.js','engine/benchmark.js'];
const result = { version: 'demolition-2.1.0', files: {} };
for (const file of files) result.files[file] = createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex');
await writeFile(new URL('../manifest.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
