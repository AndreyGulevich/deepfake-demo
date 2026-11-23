import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';

const python = process.env.HIFIFACE_PYTHON || join(homedir(), '.cache','deepfake-demo','Deep-Live-Cam','venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const run = spawnSync(python, ['integrations/hififace/serve.py'], {stdio:'inherit'});
if (run.error) console.error(run.error.message, 'См. integrations/hififace/README.md');
process.exitCode = run.status ?? 1;
