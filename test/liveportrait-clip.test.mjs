import assert from 'node:assert/strict';
import test from 'node:test';
import {generatedFrames} from '../src/generatedFrames.js';
import {localClip} from '../src/detectors/localClip.js';

test('completed portrait renders form one clip and stop detaches the renderer', async t => {
  const track = Object.assign(new EventTarget(), {readyState:'live', enabled:true});
  const canvas = {width:256, height:256};
  const rendered = new EventTarget();
  generatedFrames.set(track, {canvas, rendered});
  let read = 0;
  const ctx = {
    drawImage(source) { assert.equal(source, canvas); },
    fillRect() {},
    getImageData() { return {data:Uint8Array.of(++read, 0, 0, 255)}; },
  };
  const video = {pause() {}, cancelVideoFrameCallback() {}};
  globalThis.document = {createElement:tag => tag === 'video' ? video : {getContext:() => ctx}};
  t.after(() => { delete globalThis.document; });
  let body;
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    body = options.body;
    return Response.json({status:'ok', score:.5});
  });
  const results = [];
  const detector = localClip({id:'ftcn', label:'FTCN', engine:'FTCN+TT', port:8767, frameCount:32, side:1});
  const run = await detector.start({
    stream:{getVideoTracks:() => [track]}, onResult:result => results.push(result),
  });
  for (let i = 0; i < 31; i++) rendered.dispatchEvent(new Event('frame'));
  assert.equal(body, undefined);
  rendered.dispatchEvent(new Event('frame'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(body.size, 32 * 4);
  assert.equal(results.at(-1), 'Дипфейк: 50,0%');
  run.stop();
  rendered.dispatchEvent(new Event('frame'));
  assert.equal(read, 32);
});
