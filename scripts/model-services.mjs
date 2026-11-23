import {setTimeout as delay} from 'node:timers/promises';

async function probe({engine, port}) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2000), redirect: 'error',
    });
    const health = await response.json();
    if (health.engine !== engine) return {reason: `порт ${port} занят другим сервисом`};
    return response.ok && health.ready === true
      ? {ready: true} : {reason: health.reason || 'служба сообщила о неготовности'};
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return {missing: true};
    if (error.name === 'TimeoutError') return {pending: true};
    return {reason: `порт ${port}: ${error.message}`};
  }
}

export async function ensureService(service, launch, signal, timeout = 180000) {
  const deadline = Date.now() + timeout;
  let child;
  let spawnError;
  while (!signal.aborted) {
    const status = await probe(service);
    if (signal.aborted) break;
    if (status.ready) return child ? 'запущен' : 'уже работает';
    if (status.reason) throw new Error(status.reason);
    if (child && (spawnError || child.exitCode !== null || child.signalCode !== null)) {
      throw spawnError || new Error(`процесс завершился: ${child.signalCode ?? child.exitCode}`);
    }
    if (status.missing && !child) {
      child = launch(service.id);
      child.once('error', error => { spawnError = error; });
    }
    if (Date.now() >= deadline) throw new Error('истекло время ожидания готовности');
    await delay(500, undefined, {signal});
  }
  signal.throwIfAborted();
}
