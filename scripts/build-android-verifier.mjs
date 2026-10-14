import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyAndroidRuntime } from './verify-android-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.join(root, 'server/android-attestation');
const pins = JSON.parse(await readFile(path.join(project, 'dependencies.json'), 'utf8'));
const cache = path.join(root, 'node_modules/.cache/nepeel-attestation');
const runtime = path.join(root, '.attestation-runtime');
await mkdir(cache, { recursive: true });
await mkdir(runtime, { recursive: true });

async function digest(file) {
  const hash = createHash('sha256');
  for await (const data of createReadStream(file)) hash.update(data);
  return hash.digest('hex');
}
async function run(command, args, env = process.env) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true, shell: false });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Build command failed (${code})`)));
  });
}
async function archive(pin) {
  const file = path.join(cache, `${pin.sha256}.tar.gz`);
  let present = false;
  try { await stat(file); present = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!present) {
    console.log(`Downloading pinned dependency: ${new URL(pin.url).hostname}`);
    const response = await fetch(pin.url, { signal: AbortSignal.timeout(240_000) });
    if (!response.ok || !response.body) throw new Error('Dependency download failed');
    let received = 0;
    const bound = new Transform({ transform(data, _encoding, callback) {
      received += data.length;
      callback(received > pin.bytes ? new Error('Dependency exceeds pinned size') : null, data);
    } });
    const temporary = path.join(await mkdtemp(path.join(cache, 'download-')), 'archive.tar.gz');
    await pipeline(Readable.fromWeb(response.body), bound, createWriteStream(temporary, { flags: 'wx' }));
    if (received !== pin.bytes || await digest(temporary) !== pin.sha256) throw new Error('Dependency checksum mismatch');
    await rename(temporary, file);
  }
  if ((await stat(file)).size !== pin.bytes || await digest(file) !== pin.sha256) throw new Error('Cached dependency checksum mismatch');
  return file;
}
async function extract(pin, suffix) {
  const file = await archive(pin);
  const destination = path.join(cache, `${pin.sha256}-${suffix}`);
  try { if ((await readFile(path.join(destination, '.nepeel-verified'), 'utf8')) === pin.sha256) return destination; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = await mkdtemp(path.join(cache, 'extract-'));
  await run('tar', ['-xzf', file, '--strip-components=1', '-C', temporary]);
  await writeFile(path.join(temporary, '.nepeel-verified'), pin.sha256);
  await rename(temporary, destination);
  return destination;
}

const upstream = await extract(pins.googleVerifier, 'source');
const wrapperProperties = path.join(upstream, 'gradle/wrapper/gradle-wrapper.properties');
let properties = await readFile(wrapperProperties, 'utf8');
if (!properties.includes('distributionSha256Sum=')) {
  properties += `\ndistributionSha256Sum=${pins.gradleSha256}\n`;
  await writeFile(wrapperProperties, properties);
} else if (!properties.includes(`distributionSha256Sum=${pins.gradleSha256}`)) throw new Error('Gradle checksum mismatch');

const linux = process.platform === 'linux';
if (linux && process.arch !== 'x64') throw new Error('Pinned server runtime requires Linux x64');
const javaHome = linux ? await extract(pins.linuxJdk, 'jdk') : process.env.JAVA_HOME;
if (!javaHome) throw new Error('Set JAVA_HOME to a JDK 21 installation for local verification');
const java = path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
await run(java, ['-cp', path.join(upstream, 'gradle/wrapper/gradle-wrapper.jar'),
  'org.gradle.wrapper.GradleWrapperMain', '-p', project, 'test', 'installDist', '--no-daemon', '--max-workers=1',
  '-Dorg.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=768m', '--console=plain'],
  { ...process.env, JAVA_HOME: javaHome, NEPEEL_KEY_ATTESTATION_SOURCE: upstream });

// A versioned directory + explicit classpath avoids loading leftover JARs from a previous build.
const librarySource = path.join(project, 'build/install/nepeel-android-verifier/lib');
const names = (await readdir(librarySource)).filter(name => name.endsWith('.jar')).sort();
if (!names.includes('nepeel-android-verifier.jar')) throw new Error('Missing verifier executable');
const jars = await Promise.all(names.map(async name => ({ name, sha256: await digest(path.join(librarySource, name)) })));
const fingerprint = createHash('sha256').update(JSON.stringify(jars)).digest('hex');
const libraryDestination = path.join(runtime, 'lib', fingerprint);
await mkdir(libraryDestination, { recursive: true });
for (const { name } of jars) await cp(path.join(librarySource, name), path.join(libraryDestination, name));
if (linux) await cp(await extract(pins.linuxJre, 'jre'), path.join(runtime, 'java'), { recursive: true, dereference: true });
await writeFile(path.join(runtime, 'classpath.json'), JSON.stringify({
  java: linux ? 'java/bin/java' : java,
  jars: jars.map(({ name }) => `lib/${fingerprint}/${name}`),
  source: pins.googleVerifier.revision,
}, null, 2));
// The upstream source license is outside its generated JAR; retain it in the shipped runtime.
await cp(path.join(upstream, 'LICENSE'), path.join(runtime, 'GOOGLE-VERIFIER-LICENSE'));
await verifyAndroidRuntime();
console.log(`Verified Android attestation runtime: ${jars.length} JARs; ${linux ? 'Linux runtime included' : 'local JDK only'}`);
