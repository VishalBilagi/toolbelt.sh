import { execFile, spawn } from 'node:child_process';
import { access, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { calculateReleaseVersion } from './calc-release-version.mjs';

const execFileAsync = promisify(execFile);

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

const getShortCommitHash = async () => {
  const envCommitSha = [
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
    process.env.CI_COMMIT_SHA
  ]
    .map((value) => `${value ?? ''}`.trim())
    .find(Boolean);

  if (envCommitSha) return envCommitSha.slice(0, 7);

  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: projectRoot
    });

    return stdout.trim();
  } catch {
    return '';
  }
};

const withCommitHashSuffix = async (version) => {
  if (!version) return version;
  if (/-[0-9a-f]{7,40}$/i.test(version)) return version;

  const shortHash = await getShortCommitHash();
  if (!shortHash) return version;

  return `${version}-${shortHash}`;
};

const resolveBuildVersion = async () => {
  const existingVersion = `${process.env.PUBLIC_APP_VERSION ?? ''}`.trim();
  if (existingVersion) {
    return {
      publicVersion: existingVersion,
      releaseVersion: `${process.env.RELEASE_VERSION ?? ''}`.trim()
    };
  }

  const releaseVersion = `${process.env.RELEASE_VERSION ?? process.env.NEXT_RELEASE_VERSION ?? ''}`.trim();
  if (releaseVersion) {
    return {
      publicVersion: await withCommitHashSuffix(releaseVersion),
      releaseVersion
    };
  }

  const isCi = `${process.env.CI ?? ''}`.trim() === 'true' || Boolean(process.env.VERCEL);
  if (!isCi) {
    return {
      publicVersion: '',
      releaseVersion: ''
    };
  }

  const calculatedReleaseVersion = await calculateReleaseVersion();
  return {
    publicVersion: await withCommitHashSuffix(calculatedReleaseVersion),
    releaseVersion: calculatedReleaseVersion
  };
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

  const { publicVersion, releaseVersion } = await resolveBuildVersion();
  if (publicVersion) {
    process.env.PUBLIC_APP_VERSION = publicVersion;
    if (releaseVersion && !process.env.RELEASE_VERSION) {
      process.env.RELEASE_VERSION = releaseVersion;
    }
    console.log(`[build-prod] Using PUBLIC_APP_VERSION=${publicVersion}`);
  }

  await runAstroBuild();
} finally {
  if (moved && (await exists(hiddenComponentLibPage))) {
    await rename(hiddenComponentLibPage, componentLibPage);
  }
}
