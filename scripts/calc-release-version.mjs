import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

const readPackageVersion = async () => {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonRaw);

  if (typeof packageJson.version !== 'string') {
    throw new Error('package.json version must be a string.');
  }

  const version = packageJson.version.trim();
  if (!SEMVER_RE.test(version)) {
    throw new Error(`package.json version must be semver (major.minor.patch). Received: ${version}`);
  }

  return version;
};

const getLatestTag = async () => {
  try {
    const { stdout } = await execFileAsync('git', ['describe', '--tags', '--abbrev=0'], {
      cwd: projectRoot
    });

    return stdout.trim();
  } catch {
    return '';
  }
};

const getCommitSubjects = async (range) => {
  const args = ['log', '--format=%s'];
  if (range) args.push(range);

  const { stdout } = await execFileAsync('git', args, { cwd: projectRoot });

  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
};

const parseSemver = (version) => {
  const match = version.match(SEMVER_RE);
  if (!match) throw new Error(`Invalid semver: ${version}`);

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10)
  };
};

const stripVersionPrefix = (tag) => tag.replace(/^v/, '').trim();

const determineBump = (subjects) => {
  let bump = 'none';

  for (const subject of subjects) {
    const isBreaking = /!:/.test(subject) || /\bBREAKING CHANGE\b/i.test(subject);
    if (isBreaking) return 'major';

    if (/^feat(\(|:)/.test(subject)) {
      if (bump !== 'major') bump = 'minor';
      continue;
    }

    if (/^(fix|perf|refactor)(\(|:)/.test(subject)) {
      if (bump === 'none') bump = 'patch';
    }
  }

  return bump;
};

const bumpVersion = (version, bump) => {
  if (bump === 'none') return version;

  const parsed = parseSemver(version);

  if (bump === 'major') return `${parsed.major + 1}.0.0`;
  if (bump === 'minor') return `${parsed.major}.${parsed.minor + 1}.0`;
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
};

export const calculateReleaseVersion = async () => {
  const packageVersion = await readPackageVersion();
  const latestTag = await getLatestTag();

  const tagVersion = latestTag ? stripVersionPrefix(latestTag) : '';
  const baseVersion = SEMVER_RE.test(tagVersion) ? tagVersion : packageVersion;

  const range = latestTag ? `${latestTag}..HEAD` : '';
  const commitSubjects = await getCommitSubjects(range);

  const bump = determineBump(commitSubjects);
  return bumpVersion(baseVersion, bump);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const version = await calculateReleaseVersion();
  process.stdout.write(`${version}\n`);
}
