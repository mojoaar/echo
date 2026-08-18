import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(root, 'package.json');
const lockPath = join(root, 'package-lock.json');
const changelogPath = join(root, 'CHANGELOG.md');

const bump = process.argv[2] ?? 'patch';

const dirty = execSync('git status --porcelain', { cwd: root, encoding: 'utf8' }).trim();
if (dirty !== '') {
  console.error('refusing to release: working tree is dirty');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
if (!match) {
  console.error('refusing to release: invalid current version ' + pkg.version);
  process.exit(1);
}

const [major, minor, patch] = match.slice(1).map(Number);
let next;
if (bump === 'major') next = `${major + 1}.0.0`;
else if (bump === 'minor') next = `${major}.${minor + 1}.0`;
else next = `${major}.${minor}.${patch + 1}`;

execSync('npm test', { cwd: root, stdio: 'inherit' });
execSync('npm run lint', { cwd: root, stdio: 'inherit' });

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
pkg.version = next;
lock.version = next;
lock.packages[''].version = next;

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');

const changelog = readFileSync(changelogPath, 'utf8');
const marker = '## [Unreleased]';
const idx = changelog.indexOf(marker);
if (idx === -1) {
  console.error('refusing to release: no [Unreleased] section in CHANGELOG.md');
  process.exit(1);
}

const before = changelog.slice(0, idx + marker.length);
const rest = changelog.slice(idx + marker.length);
const nextHeading = rest.search(/\n## /);
const body = (nextHeading === -1 ? rest.slice(1) : rest.slice(1, nextHeading + 1)).replace(/\n+$/, '');
const remainder = nextHeading === -1 ? '' : rest.slice(nextHeading + 1);

const isoDate = new Date().toISOString().slice(0, 10);
const updated =
  before + '\n' +
  '\n## [' + next + '] - ' + isoDate + '\n' +
  (body !== '' ? body + '\n' : '') +
  '\n' +
  remainder;

writeFileSync(changelogPath, updated);

execSync(`git add package.json package-lock.json CHANGELOG.md`, { cwd: root });
execSync(`git commit -m "chore: release v${next}"`, { cwd: root, stdio: 'inherit' });
execSync(`git tag v${next}`, { cwd: root });
console.log(`released v${next}`);