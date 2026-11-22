import test from 'node:test';
import assert from 'node:assert/strict';
import {preprocess, classify, framesPerClip, size} from '../src/detectors/mtl/model.mjs';

test('MTL arranges eight ImageNet-normalized RGB crops in temporal NCHW order', () => {
  const frames = Array.from({length:framesPerClip}, () => new Uint8Array(size*size*4));
  frames[3].set([255, 128, 64, 255]);
  const data = preprocess(frames);
  for (const [i,value] of [ (1-0.485)/0.229, (128/255-0.456)/0.224, (64/255-0.406)/0.225 ].entries())
    assert.ok(Math.abs(data[(3*3+i)*size*size] - value) < 1e-5);
  assert.throws(() => preprocess(frames.slice(1)));
});

test('MTL reports the sigmoid of the deepfake head and releases tensors', async () => {
  let disposed = 0;
  class Tensor { dispose() { disposed++; } }
  const frames = Array(8).fill(new Uint8Array(size*size*4));
  const session = {async run(feeds, outputs) {
    assert.ok(feeds.frames instanceof Tensor);
    assert.deepEqual(outputs, ['deepfake_logit']);
    return {deepfake_logit:{data:[Math.log(3)], dispose() { disposed++; }}};
  }};
  assert.ok(Math.abs(await classify({Tensor}, session, frames) - 0.75) < 1e-6);
  assert.equal(disposed, 2);
});
