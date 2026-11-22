import test from 'node:test';
import assert from 'node:assert/strict';
import {endpoint} from '../src/endpoint.js';
import {factory,unavailable} from '../src/catalog.js';
test('server supports host, port and Vinteo WebSocket address',()=>{
  assert.equal(endpoint(' wss://example.org:8443/webrtc/wss/ ').sipServerUrl,'example.org:8443');
  assert.equal(endpoint('example.org').sipServerUrl,'example.org');
  for (const s of ['','ws://example.org','https://user@host','host/other','host?secret']) assert.throws(()=>endpoint(s));
});
test('catalog preserves disabled reason and refuses start',async()=>{
  const f=factory([unavailable('local','Local','server','Unavailable')]);
  assert.equal((await f.options({secure:true}))[0].available,false);
  await assert.rejects(f.get('local').start(),/Unavailable/);
  assert.throws(()=>f.get('other'));
});
