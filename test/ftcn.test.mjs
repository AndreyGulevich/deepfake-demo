import test from 'node:test';
import assert from 'node:assert/strict';
import ftcn from '../src/detectors/ftcn/index.js';

test('FTCN requires a ready service identifying the actual engine', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(health));
  t.after(() => { delete globalThis.HTMLVideoElement; });
  globalThis.HTMLVideoElement = class {requestVideoFrameCallback() {}};
  let health = {engine:'other', ready:true};
  assert.equal((await ftcn.check()).available, false);
  health = {engine:'FTCN+TT', ready:false, reason:'missing checkpoint'};
  assert.deepEqual(await ftcn.check(), {available:false, reason:'missing checkpoint'});
  health.ready = true;
  assert.equal((await ftcn.check()).available, true);
});

test('captures distinct frames from one track and drops an aborted clip result', async t => {
  const results = [], requests = [];
  let callback, resolveClip;
  const video = {videoWidth:320,videoHeight:320,pause(){},play:async()=>{},
    requestVideoFrameCallback(fn){callback=fn; return 1;},cancelVideoFrameCallback(){callback=null;}};
  const ctx = {fillRect(){},drawImage(){},getImageData:()=>({data:new Uint8Array(4)})};
  globalThis.document = {createElement:tag=>tag==='video' ? video : {getContext:()=>ctx}};
  globalThis.MediaStream = class {};
  t.after(() => { delete globalThis.document; delete globalThis.MediaStream; });
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    requests.push(options);
    return new Promise(resolve=>{resolveClip=resolve;});
  });
  const track = () => Object.assign(new EventTarget(), {readyState:'live', enabled:true});
  const run = await ftcn.start({stream:{getVideoTracks:()=>[track()]}, onResult:v=>results.push(v)});
  const frame = time => callback(0, {mediaTime:time});
  for (let i=0; i<31; i++) await frame(i/30);
  const oldRequest = frame(31/30);
  const oldResponse = resolveClip;
  // The next batch starts from scratch when a maker replaces its track.
  run.setTrack(track());
  oldResponse(Response.json({status:'ok',score:0.9}));
  await oldRequest;
  await Promise.resolve();
  for (let i=0; i<31; i++) {
    await frame(i/30);
    await frame(i/30);
  }
  const pending = frame(31/30);
  assert.equal(requests.length, 2);
  run.stop();
  assert.equal(requests.at(-1).signal.aborted, true);
  resolveClip(Response.json({status:'ok',score:0.8}));
  await pending;
  assert.ok(results.every(result=>!result.includes('%')));
});
