import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';

const python = process.env.LIVEPORTRAIT_PYTHON || join(homedir(), '.cache','deepfake-demo','liveportrait','venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const run = spawnSync(python, ['integrations/liveportrait/server_live.py'], {stdio:'inherit', env:{...process.env, PYTORCH_ENABLE_MPS_FALLBACK:'1'}});
if (run.error) console.error(run.error.message, 'См. README.md');
process.exitCode = run.status ?? 1;
