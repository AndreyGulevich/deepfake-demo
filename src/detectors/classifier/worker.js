import { classify } from './model.mjs';

let session;
let ort;
self.onmessage = async ({ data }) => {
  try {
    if (data.directory) {
      const runtime = new URL('ort.wasm.min.mjs', data.directory).href;
      ort = await import(/* @vite-ignore */ runtime);
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = data.directory;
      session = await ort.InferenceSession.create(new URL('model.onnx', data.directory).href, {
        executionProviders: ['wasm'],
      });
      self.postMessage({ ready: true });
    } else {
      self.postMessage({ score: await classify(ort, session, data.frame) });
    }
  } catch (error) {
    self.postMessage({ error: String(error?.message || error) });
  }
};
