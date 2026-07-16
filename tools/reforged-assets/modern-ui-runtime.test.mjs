import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const manifest = resolve('art/reforged/sources/modern-ui/manifest.json');
const committedRuntime = resolve('client/public/assets/reforged/modern-ui');
const committedProvenance = resolve('art/reforged/provenance/modern-ui/modern-ui.core.json');

test('modern UI manifest rebuilds byte-identical runtime and provenance output', () => {
  const root = mkdtempSync(join(tmpdir(), 'mmr-modern-ui-'));
  const out = join(root, 'runtime');
  const provenance = join(root, 'modern-ui.core.json');
  try {
    execFileSync(
      process.execPath,
      [
        'tools/reforged-assets/asset-pipeline.mjs',
        'build',
        '--manifest',
        manifest,
        '--out',
        out,
        '--provenance',
        provenance,
      ],
      { cwd: resolve('.'), stdio: 'pipe' },
    );

    assert.deepEqual(
      readFileSync(join(out, 'modern-ui.core.png')),
      readFileSync(join(committedRuntime, 'modern-ui.core.png')),
    );
    assert.deepEqual(
      readFileSync(join(out, 'modern-ui.core.json')),
      readFileSync(join(committedRuntime, 'modern-ui.core.json')),
    );
    assert.deepEqual(readFileSync(provenance), readFileSync(committedProvenance));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('modern UI runtime metadata is complete and excludes provenance-only fields', () => {
  const metadataText = readFileSync(join(committedRuntime, 'modern-ui.core.json'), 'utf8');
  const metadata = JSON.parse(metadataText);
  assert.equal(metadata.atlas.id, 'modern-ui.core');
  assert.equal(metadata.atlas.format, 'RGBA8888');
  assert.equal(metadata.assets['ui.chrome.states'].frameCount, 32);
  assert.equal(metadata.assets['ui.icon.language'].frameCount, 16);
  assert.equal(Object.keys(metadata.frames).length, 48);
  assert.match(metadata.integrity.textureSha256, /^[a-f0-9]{64}$/);
  for (const forbidden of [
    'license',
    'attribution',
    'sourceReference',
    'creator',
    'generationId',
    'sourceUrl',
  ]) {
    assert.equal(metadataText.includes(forbidden), false);
  }

  const provenance = JSON.parse(readFileSync(committedProvenance, 'utf8'));
  assert.equal(provenance.atlasId, 'modern-ui.core');
  assert.equal(provenance.assets.length, 2);
  assert.equal(provenance.textureSha256, metadata.integrity.textureSha256);
  assert.deepEqual(
    provenance.assets.map((asset) => asset.id),
    ['ui.chrome.states', 'ui.icon.language'],
  );
});
