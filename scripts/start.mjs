import {createServer} from 'vite';
import {spawn} from 'node:child_process';
import electron from 'electron';
const server = await createServer();
await server.listen();
const child = spawn(electron, ['.'], {stdio:'inherit',env:{...process.env, STUDIO_DEV:'1'}});
let closing = false;
async function close(code) {
  if (closing) return;
  closing = true;
  child.kill();
  await server.close();
  process.exit(code);
}
child.on('error', err => { console.error(err); close(1); });
child.on('exit', code => close(code ?? 0));
process.on('SIGINT', () => close(0));
process.on('SIGTERM', () => close(0));
server.printUrls();
