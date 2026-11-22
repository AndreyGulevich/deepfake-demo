import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
const python = process.env.FTCN_PYTHON || join(homedir(), '.cache', 'deepfake-demo', 'ftcn-venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const result = spawnSync(python, ['-B', 'integrations/ftcn/server.py'], {stdio:'inherit'});
if (result.error) console.error('FTCN: ' + result.error.message + ' · см. integrations/ftcn/README.md');
process.exitCode = result.status ?? 1;
