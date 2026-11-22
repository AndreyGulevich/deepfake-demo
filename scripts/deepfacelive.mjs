import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const windows = process.platform === 'win32';
const directory = 'integrations/deepfacelive';
const apple = process.platform === 'darwin' && process.arch === 'arm64';
const setup = process.argv[2] === 'setup';
const accelerated = '.venv-deepfacelive-coreml';
const venv = apple && (setup || existsSync(join(accelerated, 'bin/python'))) ? accelerated : '.venv-deepfacelive';
const python = join(venv, windows ? 'Scripts/python.exe' : 'bin/python');
function run(command, args) {
  const result = spawnSync(command, args, {stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (setup) {
  if (!existsSync(python)) {
    const interpreter = process.env.DEMO_PYTHON || (windows ? 'py' : 'python3');
    run(interpreter, [...(windows && interpreter === 'py' ? ['-3.11'] : []), '-m','venv',venv]);
  }
  run(python, ['-m','pip','install','-r',join(directory,'requirements.txt')]);
  run(python, [join(directory,'prepare.py')]);
} else if (existsSync(python)) {
  run(python, [join(directory,'server.py')]);
} else {
  console.error('Сначала выполните yarn setup:deepfacelive');
  process.exitCode = 1;
}
