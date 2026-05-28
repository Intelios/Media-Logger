#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(rootDir, 'src/data/changelog.json');

function printHelp() {
  console.log(`Sync published GitHub Releases into src/data/changelog.json.

Usage:
  npm run changelog:sync
  npm run changelog:sync -- --repo owner/repo

Options:
  --repo owner/repo  Override the repository detected by gh repo view
  --help            Show this help message

Notes:
  - Requires GitHub CLI: https://cli.github.com/
  - Private repositories require gh auth login
  - Draft releases are always excluded`);
}

function parseArgs(argv) {
  const options = { repo: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--repo') {
      options.repo = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--repo=')) {
      options.repo = arg.slice('--repo='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.repo && !/^[-_.A-Za-z0-9]+\/[-_.A-Za-z0-9]+$/.test(options.repo)) {
    throw new Error(`Invalid repo value: ${options.repo}. Expected owner/repo.`);
  }

  return options;
}

function runGh(args) {
  try {
    return execFileSync('gh', args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('GitHub CLI (gh) is not installed. Install it from https://cli.github.com/ and run gh auth login.');
    }

    const stderr = error.stderr?.toString().trim();
    throw new Error(stderr || error.message || 'gh command failed');
  }
}

function getRepo(explicitRepo) {
  if (explicitRepo) return explicitRepo;

  const repo = runGh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
  if (!repo) {
    throw new Error('Unable to detect repository. Run from a GitHub checkout or pass --repo owner/repo.');
  }

  return repo;
}

function parseReleasePages(output) {
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed)) return [];

  if (parsed.length > 0 && Array.isArray(parsed[0])) {
    return parsed.flat();
  }

  return parsed;
}

function normalizeRelease(release) {
  const publishedAt = release.published_at || release.created_at || '';
  const version = String(release.tag_name || '').trim();
  const title = String(release.name || version || 'Untitled Release').trim();

  return {
    version,
    title,
    date: publishedAt ? publishedAt.slice(0, 10) : '',
    body: typeof release.body === 'string' ? release.body.trim() : '',
    prerelease: Boolean(release.prerelease),
    url: typeof release.html_url === 'string' ? release.html_url : '',
  };
}

function readExistingChangelog() {
  if (!existsSync(outputPath)) return null;

  try {
    return JSON.parse(readFileSync(outputPath, 'utf8'));
  } catch {
    return null;
  }
}

function releasesAreEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  runGh(['auth', 'status']);

  const repo = getRepo(options.repo);
  const releasesOutput = runGh([
    'api',
    `/repos/${repo}/releases`,
    '--paginate',
    '--slurp',
    '-H',
    'Accept: application/vnd.github+json',
  ]);

  const releases = parseReleasePages(releasesOutput)
    .filter((release) => !release.draft && release.published_at)
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))
    .map(normalizeRelease)
    .filter((release) => release.version);

  const existing = readExistingChangelog();
  const next = {
    generatedAt: new Date().toISOString(),
    source: 'github-releases',
    repository: repo,
    releases,
  };

  if (
    existing?.source === next.source &&
    existing?.repository === next.repository &&
    releasesAreEqual(existing?.releases, next.releases)
  ) {
    console.log(`Changelog already up to date (${releases.length} published releases).`);
    return;
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Synced ${releases.length} published releases to src/data/changelog.json.`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
