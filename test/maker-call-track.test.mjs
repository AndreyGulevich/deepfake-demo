import assert from 'node:assert/strict';
import test from 'node:test';
import maker from '../src/makers/deeplivecam/index.js';

test('square preview and camera-sized SIP output have separate lifetimes', async t => {
  const fakeTrack = () => Object.assign(new EventTarget(), {readyState:'live', stop(){this.readyState='ended';}});
  const camera = fakeTrack(), streams = [];
  const ctx = {fillRect(){},drawImage(){},putImageData(){},getImageData(){return {data:new Uint8ClampedArray(256*256*4)};}};
  t.mock.method(globalThis,'fetch',async url => {
    if(url.endsWith('/health')) return Response.json({engine:'Deep-Live-Cam',ready:true});
    if(url.endsWith('/frame')) return new Response(new Uint8Array(256*256*4));
    return Response.json({id:'test'});
  });
  const hosts = {
    window:Object.assign(new EventTarget(),{isSecureContext:true}), MediaStream:class {}, ImageData:class {},
    document:{createElement(tag){
      if(tag==='video')return {videoWidth:640,videoHeight:480,play:async()=>{},pause(){}};
      return {getContext:()=>ctx,captureStream(){const track=fakeTrack(); streams.push([this.width,this.height,track]);return {getVideoTracks:()=>[track]};}};
    }},
  };
  for(const [k,v] of Object.entries(hosts)){
    const saved=Object.getOwnPropertyDescriptor(globalThis,k);globalThis[k]=v;
    t.after(()=>{if(saved)Object.defineProperty(globalThis,k,saved);else delete globalThis[k];});
  }
  const run=await maker.start({stream:{getVideoTracks:()=>[camera]}});
  try {
    assert.equal(streams.length,1);
    const call=run.getCallTrack();
    assert.equal(run.getCallTrack(),call);
    assert.deepEqual(streams.map(s=>s.slice(0,2)),[[256,256],[640,480]]);
    run.releaseCallTrack();
    assert.equal(call.readyState,'ended');assert.equal(run.track.readyState,'live');
    const second=run.getCallTrack();assert.notEqual(second,call);
    run.stop();assert.equal(second.readyState,'ended');assert.equal(camera.readyState,'live');
  } finally {run.stop();}
});
