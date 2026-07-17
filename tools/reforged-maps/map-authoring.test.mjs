import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..', '..');
const TOOL = resolve(import.meta.dirname, 'map-authoring.mjs');
const CURRENT_MAPS = resolve(ROOT, 'shared', 'maps');

function run(...args) {
  return spawnSync(process.execPath, [TOOL, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

test('compatible profile validates six legacy maps and four successors in stable path order', () => {
  const execution = run('validate', '--profile', 'compatible', CURRENT_MAPS);
  assert.equal(execution.status, 0, execution.stderr);
  const lines = execution.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 10);
  assert.deepEqual(
    lines,
    [...lines].sort((left, right) => left.localeCompare(right)),
  );
  assert.ok(lines.every((line) => line.endsWith('OK (compatible)')));
  assert.deepEqual(
    lines.filter((line) => line.includes('.standard-40x24.json:')),
    [
      `${resolve(CURRENT_MAPS, 'collapsed-overpass.standard-40x24.json')}: OK (compatible)`,
      `${resolve(CURRENT_MAPS, 'overgrown-suburb.standard-40x24.json')}: OK (compatible)`,
      `${resolve(CURRENT_MAPS, 'scrapyard.standard-40x24.json')}: OK (compatible)`,
      `${resolve(CURRENT_MAPS, 'wasteland-outpost.standard-40x24.json')}: OK (compatible)`,
    ],
  );
});

test('standard profile rejects a legacy map with stable actionable codes', () => {
  const map = resolve(CURRENT_MAPS, 'wasteland-outpost.json');
  const execution = run('validate', '--profile', 'standard-40x24', map);
  assert.equal(execution.status, 1);
  assert.match(execution.stderr, /\[ARENA_DIMENSIONS\]/);
  assert.match(execution.stderr, /\[AUTHORING_REQUIRED\]/);
});

test('invalid JSON fails before schema validation', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'mmr-map-authoring-'));
  const file = resolve(directory, 'invalid.json');
  await writeFile(file, '{"name":', 'utf8');
  const execution = run('validate', file);
  assert.equal(execution.status, 1);
  assert.equal(execution.stderr, `${file}: [MAP_JSON_PARSE] $: invalid JSON document\n`);
});
