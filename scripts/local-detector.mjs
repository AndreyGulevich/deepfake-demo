import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';

const model = process.argv[2];
if (!['altfreezing', 'sbi'].includes(model)) throw new Error('Неизвестный детектор');
const environment = model === 'altfreezing' ? 'ftcn-venv' : 'sbi-venv';
const python = process.env[model.toUpperCase() + '_PYTHON'] || join(
  homedir(), '.cache', 'deepfake-demo', environment, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
);
const run = spawnSync(python, ['-B', 'integrations/serve_detector.py', model], {stdio:'inherit'});
if (run.error) console.error(run.error.message, 'См. integrations/' + model + '/README.md');
process.exitCode = run.status ?? 1;
