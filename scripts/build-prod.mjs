import { spawn } from 'node:child_process';
import { access, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

const componentLibPage = path.join(projectRoot, 'src/pages/component-lib.astro');
const hiddenComponentLibPage = path.join(projectRoot, 'src/pages/.component-lib.dev.astro');
const astroCli = path.join(projectRoot, 'node_modules/astro/bin/astro.mjs');

const exists = async (targetPath) => {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const runAstroBuild = async () =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [astroCli, 'build'], {
      stdio: 'inherit',
      cwd: projectRoot,
      env: process.env
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`astro build exited with code ${code ?? 'unknown'}`));
    });
  });

let moved = false;

try {
  const hasComponentLib = await exists(componentLibPage);
  const hasHiddenCopy = await exists(hiddenComponentLibPage);

  if (hasComponentLib && hasHiddenCopy) {
    throw new Error('Build aborted: both component-lib page and hidden backup exist.');
  }

  if (hasComponentLib) {
    await rename(componentLibPage, hiddenComponentLibPage);
    moved = true;
  }

  await runAstroBuild();
} finally {
  if (moved && (await exists(hiddenComponentLibPage))) {
    await rename(hiddenComponentLibPage, componentLibPage);
  }
}
