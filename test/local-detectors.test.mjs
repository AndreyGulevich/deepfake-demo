import assert from 'node:assert/strict';
import test from 'node:test';
import alt from '../src/detectors/altfreezing/index.js';
import sbi from '../src/detectors/sbi/index.js';

test('server detectors only enable for their matching, ready local process', async t => {
  globalThis.HTMLVideoElement = class {requestVideoFrameCallback() {}};
  t.after(() => { delete globalThis.HTMLVideoElement; });
  let health;
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(health));
  for (const [adapter, name, port] of [[alt,'AltFreezing',8769],[sbi,'SBI',8770]]) {
    health = {engine:'FTCN+TT', ready:true};
    assert.equal((await adapter.check()).available, false);
    health = {engine:name, ready:false, reason:'Нет весов'};
    assert.deepEqual(await adapter.check(), {available:false, reason:'Нет весов'});
    health.ready = true;
    assert.equal((await adapter.check()).available, true);
    assert.equal(fetch.mock.calls.at(-1).arguments[0], 'http://127.0.0.1:' + port + '/health');
    assert.equal(adapter.location, 'server');
  }
});
