import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { decodePng } from './asset-pipeline.mjs';

const manifest = resolve('art/reforged/sources/fighter-art-i/manifest.json');
const sourceRoot = resolve('art/reforged/sources/fighter-art-i');
const committedRuntime = resolve('client/public/assets/reforged/fighter-art-i');
const committedProvenance = resolve(
  'art/reforged/provenance/fighter-art-i/fighter-art-i.core.json',
);
const sources = Object.freeze([
  { id: 'bruce', file: 'bruce-states.png', frames: 88, width: 256, height: 1408 },
  {
    id: 'frost-wizard',
    file: 'frost-wizard-states.png',
    frames: 100,
    width: 256,
    height: 1600,
  },
  {
    id: 'mighty-man',
    file: 'mighty-man-states.png',
    frames: 100,
    width: 256,
    height: 1600,
  },
]);

test('fighter art I generator and manifest rebuild byte-identical committed output', () => {
  const originalSources = new Map(
    sources.map(({ file }) => [file, readFileSync(join(sourceRoot, file))]),
  );
  execFileSync(process.execPath, ['tools/reforged-assets/create-fighter-art-i-sources.mjs'], {
    cwd: resolve('.'),
    stdio: 'pipe',
  });
  for (const { file } of sources) {
    assert.deepEqual(readFileSync(join(sourceRoot, file)), originalSources.get(file));
  }

  const root = mkdtempSync(join(tmpdir(), 'mmr-fighter-art-i-'));
  const out = join(root, 'runtime');
  const provenance = join(root, 'fighter-art-i.core.json');
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
    for (const file of ['fighter-art-i.core.png', 'fighter-art-i.core.json']) {
      assert.deepEqual(readFileSync(join(out, file)), readFileSync(join(committedRuntime, file)));
    }
    assert.deepEqual(readFileSync(provenance), readFileSync(committedProvenance));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fighter art I metadata is exact, sorted, and runtime-safe', () => {
  const metadataText = readFileSync(join(committedRuntime, 'fighter-art-i.core.json'), 'utf8');
  const metadata = JSON.parse(metadataText);
  assert.equal(metadata.atlas.id, 'fighter-art-i.core');
  assert.equal(metadata.atlas.width, 2048);
  assert.equal(metadata.atlas.height, 1024);
  assert.equal(metadata.atlas.format, 'RGBA8888');
  assert.equal(metadata.atlas.padding, 3);
  assert.equal(metadata.atlas.extrude, 2);
  assert.deepEqual(
    Object.entries(metadata.assets).map(([id, asset]) => [id, asset.frameCount]),
    [
      ['fighter.bruce.core', 88],
      ['fighter.frost-wizard.core', 100],
      ['fighter.mighty-man.core', 100],
    ],
  );
  assert.equal(Object.keys(metadata.frames).length, 288);
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
  assert.equal(provenance.atlasId, 'fighter-art-i.core');
  assert.equal(provenance.textureSha256, metadata.integrity.textureSha256);
  assert.deepEqual(
    provenance.assets.map((asset) => asset.id),
    ['fighter.bruce.core', 'fighter.frost-wizard.core', 'fighter.mighty-man.core'],
  );
});

test('source frames preserve grid, registration, mass, negative space, and identity cues', () => {
  const decodedById = new Map();
  for (const source of sources) {
    const decoded = decodePng(readFileSync(join(sourceRoot, source.file)), source.file);
    decodedById.set(source.id, decoded);
    assert.equal(decoded.width, source.width);
    assert.equal(decoded.height, source.height);
    assert.equal((decoded.width / 64) * (decoded.height / 64), source.frames);

    for (let frame = 0; frame < 64; frame += 1) {
      const column = frame % 4;
      const row = Math.floor(frame / 4);
      let minX = 64;
      let maxX = -1;
      let maxY = -1;
      let opaquePixels = 0;
      for (let y = 0; y < 64; y += 1) {
        for (let x = 0; x < 64; x += 1) {
          const alpha = decoded.pixels[((row * 64 + y) * decoded.width + column * 64 + x) * 4 + 3];
          if (alpha === 0) continue;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          opaquePixels += 1;
        }
      }
      assert.ok(maxY >= 57 && maxY <= 63, `${source.id} frame ${frame} feet drifted`);
      assert.ok(opaquePixels >= 650, `${source.id} frame ${frame} lost its dominant mass`);
      assert.ok(maxX - minX < 64, `${source.id} frame ${frame} lost transparent negative space`);
    }
  }

  const hasRgb = (decoded, rgb, startFrame = 0, endFrame = Number.MAX_SAFE_INTEGER) => {
    const startRow = Math.floor(startFrame / 4) * 64;
    const endRow = Math.min(decoded.height, Math.ceil((endFrame + 1) / 4) * 64);
    for (let y = startRow; y < endRow; y += 1) {
      for (let x = 0; x < decoded.width; x += 1) {
        const offset = (y * decoded.width + x) * 4;
        if (
          decoded.pixels[offset] === rgb[0] &&
          decoded.pixels[offset + 1] === rgb[1] &&
          decoded.pixels[offset + 2] === rgb[2] &&
          decoded.pixels[offset + 3] > 0
        )
          return true;
      }
    }
    return false;
  };
  assert.equal(hasRgb(decodedById.get('mighty-man'), [220, 117, 36]), true);
  assert.equal(hasRgb(decodedById.get('mighty-man'), [93, 222, 231], 40, 55), true);
  assert.equal(hasRgb(decodedById.get('mighty-man'), [111, 126, 138]), true);
  assert.equal(hasRgb(decodedById.get('bruce'), [242, 91, 35], 40, 55), true);
  assert.equal(hasRgb(decodedById.get('bruce'), [111, 126, 138]), false);
  assert.equal(hasRgb(decodedById.get('frost-wizard'), [52, 57, 107]), true);
  assert.equal(hasRgb(decodedById.get('frost-wizard'), [93, 222, 231], 40, 55), true);
  assert.equal(hasRgb(decodedById.get('frost-wizard'), [220, 117, 36]), false);
});
