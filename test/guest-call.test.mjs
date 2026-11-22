import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const {tools} = createRequire(import.meta.url)('sip-connector');
import {guestConnection,guestOffer} from '../src/guestCall.js';

test('guest call uses discovered SIP realm, independent WebSocket host and SDK guest headers', async t => {
  const descriptor = {ip:'192.0.2.1',remoteAddress:'192.0.2.2',unified:true,iceServers:[]};
  const fetch = t.mock.method(globalThis,'fetch',async()=>Response.json(descriptor));
  const config = await guestConnection('msk.vinteo.com',{name:'Chrome',version:'123'},tools);
  assert.equal(fetch.mock.calls[0].arguments[0],'/sip-config/address');
  assert.equal(config.sipServerIp,descriptor.ip);
  assert.equal(config.sipServerUrl,'msk.vinteo.com');
  assert.equal(config.register,false);
  assert.match(config.userAgent,/Deepfake Demo/);
  const offer = guestOffer(' 1111 ',{getAudioTracks:()=>[],getVideoTracks:()=>[{enabled:true,readyState:'live'}]},config,tools);
  assert.equal(offer.number,'1111');
  for (const header of ['X-Vinteo-Purgatory-Call: yes','X-Vinteo-Remote: 192.0.2.2','X-Vinteo-Mic-State: 0','X-Vinteo-MainCam-State: 1'])
    assert.ok(offer.extraHeaders.includes(header));
});

test('custom server uses its own descriptor and rejects a missing SIP realm',async t=>{
  const fetch=t.mock.method(globalThis,'fetch',async()=>Response.json({}));
  await assert.rejects(guestConnection('other.example:8443',{},tools),/SIP-адрес/);
  assert.equal(fetch.mock.calls[0].arguments[0],'https://other.example:8443/api/v1/address');
});
