import test from 'node:test';
import assert from 'node:assert/strict';
import makers from '../src/makers/index.js';

test('GhostV2 requires its own ready worker and replaces the removed pico option', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, 'http://127.0.0.1:8768/health');
    return Response.json(health);
  });
  globalThis.window = {isSecureContext:true};
  globalThis.document = {createElement:() => ({getContext:() => ({}), captureStream(){}})};
  t.after(() => { delete globalThis.window; delete globalThis.document; });
  const adapter = makers.get('ghostv2');
  assert.throws(() => makers.get('avatar'));
  const health = {engine:'Deep-Live-Cam', ready:true};
  assert.equal((await adapter.check()).available, false);
  Object.assign(health, {engine:'GhostV2/CVLFace', ready:false, reason:'Model missing'});
  assert.equal((await adapter.check()).reason, 'Model missing');
  health.ready = true;
  assert.equal((await adapter.check()).available, true);
});
