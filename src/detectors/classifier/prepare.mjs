import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { modelUrl, sha256 } from './model.mjs';

const directory = fileURLToPath(new URL('../../../public/models/classifier/', import.meta.url));
const model = join(directory, 'model.onnx');
const temporary = join(directory, randomUUID());
async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
await mkdir(directory, { recursive: true });
try {
  if (await digest(model).catch(() => '') !== sha256) {
    if (process.argv[2]) {
      await copyFile(process.argv[2], temporary);
    } else {
      const response = await fetch(modelUrl, { signal: AbortSignal.timeout(1_200_000) });
      if (!response.ok) throw new Error(`Model download returned HTTP ${response.status}`);
      await pipeline(response.body, createWriteStream(temporary, { flags: 'wx' }));
    }
    if (await digest(temporary) !== sha256) throw new Error('Model SHA-256 mismatch');
    await rename(temporary, model);
  }
  const dist = dirname(createRequire(import.meta.url).resolve('onnxruntime-web/wasm'));
  for (const file of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
    await copyFile(join(dist, file), join(directory, file));
  }
  for (const file of ['Apache-2.0.txt', 'NOTICE.txt', 'ONNX-Runtime-LICENSE.txt', 'ONNX-Runtime-ThirdPartyNotices.txt']) {
    await copyFile(new URL(file, import.meta.url), join(directory, file));
  }
  await writeFile(join(directory, 'ready.json'), JSON.stringify({ sha256 }));
  console.log(`Classifier installed and verified (${sha256})`);
} finally {
  await rm(temporary, { force: true });
}
