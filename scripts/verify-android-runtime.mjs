import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function verifyAndroidRuntime() {
  const runtime = path.join(root, '.attestation-runtime');
  const manifest = JSON.parse(await readFile(path.join(runtime, 'classpath.json'), 'utf8'));
  const fixture = await readFile(path.join(root, 'server/android-attestation/build/smoke-request.json'), 'utf8');
  const java = path.resolve(runtime, manifest.java);
  const args = ['-Xms16m', '-Xmx96m', '-XX:MaxMetaspaceSize=64m', '-XX:+UseSerialGC', '-XX:ActiveProcessorCount=1',
    '-cp', manifest.jars.map(jar => path.join(runtime, jar)).join(path.delimiter), 'com.nepeel.attestation.MainKt'];
  for (const [input, reason] of [[fixture, 'verification_failed'], ['{}', 'invalid_input']]) {
    const started = performance.now();
    const output = await new Promise((resolve, reject) => {
      const child = execFile(java, args, { timeout: 15_000, maxBuffer: 4096, windowsHide: true,
        env: { LANG: 'C.UTF-8', ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {}) },
      }, (error, stdout) => error ? reject(error) : resolve(stdout));
      child.stdin.on('error', reject);
      child.stdin.end(input);
    });
    const verdict = JSON.parse(output);
    if (verdict.ok !== false || verdict.reason !== reason) throw new Error('Runtime rejected input for an unexpected reason');
    console.log(`Runtime rejection check: ${reason}, ${Math.round(performance.now() - started)} ms`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await verifyAndroidRuntime();
