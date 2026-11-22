import assert from 'node:assert/strict';
import test from 'node:test';
import adapter from '../src/makers/deepfacelive/index.js';

test('DeepFaceLive requires a responding, ready LIA service and canvas capture', async t => {
  const canvas = {getContext:()=>({}), captureStream(){}};
  globalThis.window = {isSecureContext:true};
  globalThis.document = {createElement:()=>canvas};
  t.after(()=>{delete globalThis.window; delete globalThis.document;});
  let health = {engine:'DeepFaceLive/LIA', ready:false, reason:'Нет файла модели'};
  const probe = t.mock.method(globalThis,'fetch',async (url,options)=>{
    assert.equal(url,'http://127.0.0.1:8765/health');
    assert.equal(options.redirect,'error');
    return Response.json(health);
  });
  assert.deepEqual(await adapter.check(),{available:false,reason:'Нет файла модели'});
  health = {engine:'Other',ready:true};
  assert.equal((await adapter.check()).available,false);
  health = {engine:'DeepFaceLive/LIA',ready:true};
  assert.equal((await adapter.check()).available,true);
  probe.mock.mockImplementation(async()=>{throw new Error('Offline');});
  assert.equal((await adapter.check()).available,false);
  delete canvas.captureStream;
  assert.equal((await adapter.check()).available,false);
});
