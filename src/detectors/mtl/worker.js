import {classify} from './model.mjs';

let ort, session;
self.onmessage = async ({data}) => {
  try {
    if (data.directory) {
      const runtime = new URL('ort.wasm.min.mjs', data.directory).href;
      ort = await import(/* @vite-ignore */ runtime);
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = data.directory;
      session = await ort.InferenceSession.create(new URL('model.onnx', data.directory).href, {executionProviders:['wasm']});
      if (!session.outputNames.includes('deepfake_logit')) throw new Error('Несовместимый граф MTL Face Auth');
      self.postMessage({ready:true});
    } else {
      self.postMessage({version:data.version, score:await classify(ort, session, data.frames)});
    }
  } catch (error) { self.postMessage({error:String(error?.message || error)}); }
};
