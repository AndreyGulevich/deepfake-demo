import test from 'node:test';
import assert from 'node:assert/strict';
import {preprocess,size} from '../src/detectors/classifier/model.mjs';
test('normalizes RGB in channel-first order and rejects incomplete frames',()=>{
  const count = size * size;
  const frame = new Uint8ClampedArray(count * 4);
  frame.set([255,128,0,255]);
  const input = preprocess(frame);
  assert.equal(input.length,count*3);
  assert.equal(input[0],1);
  assert.ok(Math.abs(input[count]-1/255)<1e-7);
  assert.equal(input[2*count],-1);
  assert.throws(()=>preprocess(frame.subarray(4)));
});
