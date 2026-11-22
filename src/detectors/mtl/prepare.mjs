import {createHash, randomUUID} from 'node:crypto';
import {copyFile, mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {modelUrl, sha256} from './model.mjs';

const directory = fileURLToPath(new URL('../../../public/models/mtl/', import.meta.url));
const model = join(directory, 'model.onnx');
const temporary = join(directory, randomUUID());
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(directory, {recursive:true});
try {
  if (await readFile(model).then(digest).catch(() => '') !== sha256) {
    if (process.argv[2]) {
      await copyFile(process.argv[2], temporary);
    } else {
      const response = await fetch(modelUrl, {signal:AbortSignal.timeout(600000)});
      if (!response.ok) throw new Error('MTL download: HTTP ' + response.status);
      await writeFile(temporary, new Uint8Array(await response.arrayBuffer()), {flag:'wx'});
    }
    if (digest(await readFile(temporary)) !== sha256) throw new Error('MTL model SHA-256 mismatch');
    await rename(temporary, model);
  }
  const runtime = dirname(createRequire(import.meta.url).resolve('onnxruntime-web/wasm'));
  for (const name of ['ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])
    await copyFile(join(runtime, name), join(directory, name));
  for (const name of ['ONNX-Runtime-LICENSE.txt','ONNX-Runtime-ThirdPartyNotices.txt'])
    await copyFile(new URL('../classifier/' + name, import.meta.url), join(directory, name));
  await copyFile(new URL('MODEL.md', import.meta.url), join(directory, 'MODEL.md'));
  await writeFile(join(directory, 'ready.json'), JSON.stringify({sha256}));
  console.log('MTL Face Auth: ' + sha256);
} finally { await rm(temporary, {force:true}); }
