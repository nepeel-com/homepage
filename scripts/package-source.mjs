import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.qa', 'nepeel-sns-source');
const folders = ['src', 'public', 'mobile', 'shared', 'server', 'api', 'netlify', 'supabase', 'tests', 'docs', 'scripts'];
const roots = ['package.json','package-lock.json','index.html','vite.config.ts','vercel.json','netlify.toml','tsconfig.json','tsconfig.server.json','.gitignore','.nvmrc','.env.example','README.md','DESIGN.md','design-contract.md','implementation-handoff.md'];
const skip = new Set(['node_modules','.expo','.netlify','dist','android','ios','.git','.vercel','.gradle','.kotlin','build','.attestation-runtime']);
let count = 0;
async function copy(relative) {
  const base = path.basename(relative);
  if (skip.has(base) || base.startsWith('.env') && base !== '.env.example' || base.endsWith('.tsbuildinfo')) return;
  const source = path.join(root, relative);
  if ((await stat(source)).isDirectory()) {
    for (const item of await readdir(source)) await copy(path.join(relative, item));
  } else {
    const target = path.join(output, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target); count++;
  }
}
await mkdir(output, { recursive: true });
for (const item of [...folders, ...roots]) await copy(item);
console.log(`Prepared ${count} source files at ${output}. Environment secrets and installed dependencies excluded.`);
