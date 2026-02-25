import { spawn } from 'node:child_process';
import { access, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateReleaseVersion } from './calc-release-version.mjs';

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


const resolveBuildVersion = async () => {
  const existingVersion = `${process.env.PUBLIC_APP_VERSION ?? ''}`.trim();
  if (existingVersion) return existingVersion;

  const releaseVersion = `${process.env.RELEASE_VERSION ?? process.env.NEXT_RELEASE_VERSION ?? ''}`.trim();
  if (releaseVersion) return releaseVersion;

  const isCi = `${process.env.CI ?? ''}`.trim() === 'true' || Boolean(process.env.VERCEL);
  if (!isCi) return '';

  return calculateReleaseVersion();
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

  const resolvedVersion = await resolveBuildVersion();
  if (resolvedVersion) {
    process.env.PUBLIC_APP_VERSION = resolvedVersion;
    if (!process.env.RELEASE_VERSION) process.env.RELEASE_VERSION = resolvedVersion;
    console.log(`[build-prod] Using PUBLIC_APP_VERSION=${resolvedVersion}`);
  }

  await runAstroBuild();
} finally {
  if (moved && (await exists(hiddenComponentLibPage))) {
    await rename(hiddenComponentLibPage, componentLibPage);
  }
}
