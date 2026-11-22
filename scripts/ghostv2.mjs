import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';

const kit = process.env.GHOSTV2_KIT || join(homedir(), '.cache', 'deepfake-demo', 'fakeface-test-camera');
const python = process.env.GHOSTV2_PYTHON || join(kit, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const run = spawnSync(python, ['integrations/ghostv2/serve.py', kit], {stdio:'inherit'});
if (run.error) console.error('Не удалось запустить Python для GhostV2:', run.error.message);
process.exitCode = run.status ?? 1;
