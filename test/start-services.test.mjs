import assert from 'node:assert/strict';
import {EventEmitter, once} from 'node:events';
import {createServer} from 'node:http';
import test from 'node:test';
import {ensureService} from '../scripts/model-services.mjs';

test('startup launches missing services once, reuses them and leaves foreign ports alone', async t => {
  let engine = 'test-model', ready = true;
  const server = createServer((req, res) => {
    assert.equal(req.url, '/health');
    res.end(JSON.stringify({engine, ready, reason:ready ? undefined : 'weights missing'}));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const service = {id:engine, engine, port:server.address().port};
  await new Promise(resolve => server.close(resolve));
  const signal = new AbortController().signal;
  let launches = 0;
  const launch = id => {
    assert.equal(id, service.id);
    launches++;
    server.listen(service.port, '127.0.0.1');
    return Object.assign(new EventEmitter(), {exitCode:null, signalCode:null});
  };
  t.after(() => { server.closeAllConnections(); server.close(); });
  assert.equal(await ensureService(service, launch, signal), 'запущен');
  assert.equal(await ensureService(service, launch, signal), 'уже работает');
  ready = false;
  await assert.rejects(ensureService(service, launch, signal), /weights missing/);
  engine = 'something-else';
  await assert.rejects(ensureService(service, launch, signal), /другим сервисом/);
  assert.equal(launches, 1);
});
