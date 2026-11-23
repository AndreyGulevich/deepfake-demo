import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'vite';
import {ensureService} from './model-services.mjs';
import lia from '../src/makers/deepfacelive/index.js';
import inswapper from '../src/makers/deeplivecam/index.js';
import ghost from '../src/makers/ghostv2/index.js';
import hifi from '../src/makers/hififace/index.js';
import hyper from '../src/makers/hyperswap/index.js';
import portrait from '../src/makers/liveportrait/index.js';
import ftcn from '../src/detectors/ftcn/index.js';
import alt from '../src/detectors/altfreezing/index.js';
import sbi from '../src/detectors/sbi/index.js';

const services = [lia, inswapper, ghost, hifi, hyper, portrait, ftcn, alt, sbi];
const children = new Set();
const controller = new AbortController();
const windows = process.platform === 'win32';
let server;

function launch(id) {
  const child = spawn(process.execPath, [process.env.npm_execpath, 'run', 'start:' + id], {
    detached: !windows, stdio: 'inherit', windowsHide: true,
  });
  children.add(child);
  child.once('close', () => children.delete(child));
  return child;
}

async function close() {
  if (controller.signal.aborted) return;
  controller.abort();
  for (const child of children) {
    if (!child.pid) continue;
    if (windows) spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {windowsHide:true});
    else {
      try { process.kill(-child.pid, 'SIGTERM'); }
      catch (error) { if (error.code !== 'ESRCH') console.error(error.message); }
    }
  }
  await server?.close();
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
try {
  server = await createServer({server:{open:false}});
  await server.listen();
  server.printUrls();
  const results = await Promise.allSettled(services.map(service =>
    ensureService(service, launch, controller.signal)
  ));
  if (!controller.signal.aborted) {
    for (const [index, result] of results.entries()) {
      console.log(services[index].label, '—', result.status === 'fulfilled' ? result.value : result.reason.message);
    }
    server.openBrowser();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  await close();
}
