import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createTracker } from './tracker.mjs';

test('the bundled cascade locates the astronaut and rejects a blank frame', async () => {
  const bytes = await readFile(new URL('./vendor/facefinder.bin', import.meta.url));
  const frame = await readFile(new URL('./fixtures/astronaut.gray', import.meta.url));
  const locate = createTracker(bytes);
  const face = locate(frame, 192, 192);
  assert.ok(face, 'the reference face was missed');
  assert.ok(Math.abs(face.x - 84) < 9 && Math.abs(face.y - 43) < 9, JSON.stringify(face));
  assert.ok(face.size > 25 && face.size < 60);
  assert.equal(locate(new Uint8Array(frame.length), 192, 192), null);
});
