import test from 'node:test';
import assert from 'node:assert/strict';
import dlc from '../src/makers/deeplivecam/index.js';
test('Deep-Live-Cam does not enable for LIA, missing weights or an offline service',async t=>{
  globalThis.window={isSecureContext:true};
  globalThis.document={createElement:()=>({getContext:()=>({}),captureStream(){}})};
  t.after(()=>{delete globalThis.window;delete globalThis.document;});
  let health={engine:'DeepFaceLive/LIA',ready:true};
  const probe=t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(url,'http://127.0.0.1:8766/health');
    return Response.json(health);
  });
  assert.equal((await dlc.check()).available,false);
  health={engine:'Deep-Live-Cam',ready:false,reason:'Нет локальных весов'};
  assert.equal((await dlc.check()).reason,health.reason);
  health.ready=true;
  assert.equal((await dlc.check()).available,true);
  probe.mock.mockImplementation(async()=>{throw Error('Offline');});
  assert.equal((await dlc.check()).available,false);
});
