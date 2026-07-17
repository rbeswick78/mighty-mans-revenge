import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { decodePng } from './asset-pipeline.mjs';

const manifest = resolve('art/reforged/sources/fighter-art-ii/manifest.json');
const sourceRoot = resolve('art/reforged/sources/fighter-art-ii');
const committedRuntime = resolve('client/public/assets/reforged/fighter-art-ii');
const committedProvenance = resolve(
  'art/reforged/provenance/fighter-art-ii/fighter-art-ii.core.json',
);
const sources = Object.freeze([
  { id: 'bubba', file: 'bubba-states.png', frames: 88, width: 256, height: 1408 },
  {
    id: 'jack-axe-absent',
    file: 'jack-axe-absent-states.png',
    frames: 88,
    width: 256,
    height: 1408,
  },
  {
    id: 'jack-axe-present',
    file: 'jack-axe-present-states.png',
    frames: 76,
    width: 256,
    height: 1216,
  },
  {
    id: 'rook-body',
    file: 'rook-body-states.png',
    frames: 76,
    width: 256,
    height: 1216,
  },
  {
    id: 'rook-helmet',
    file: 'rook-helmet-states.png',
    frames: 76,
    width: 256,
    height: 1216,
  },
]);

function frameStats(decoded, frame) {
  const column = frame % 4;
  const row = Math.floor(frame / 4);
  let minX = 64;
  let maxX = -1;
  let minY = 64;
  let maxY = -1;
  let opaquePixels = 0;
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const alpha = decoded.pixels[((row * 64 + y) * decoded.width + column * 64 + x) * 4 + 3];
      if (alpha === 0) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      opaquePixels += 1;
    }
  }
  return { minX, maxX, minY, maxY, opaquePixels };
}

function hasRgb(decoded, rgb, startFrame = 0, endFrame = Number.MAX_SAFE_INTEGER) {
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
      ) {
        return true;
      }
    }
  }
  return false;
}

function frameHasRgb(decoded, frame, rgb) {
  const column = frame % 4;
  const row = Math.floor(frame / 4);
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const offset = ((row * 64 + y) * decoded.width + column * 64 + x) * 4;
      if (
        decoded.pixels[offset] === rgb[0] &&
        decoded.pixels[offset + 1] === rgb[1] &&
        decoded.pixels[offset + 2] === rgb[2] &&
        decoded.pixels[offset + 3] > 0
      ) {
        return true;
      }
    }
  }
  return false;
}

function rookHelmetExpectedCenterX(frame) {
  if (frame >= 64) {
    const direction = frame < 70 ? 'side' : 'side-left';
    const progress = ((frame - 64) % 6) / 5;
    const facing = direction === 'side' ? 1 : -1;
    return progress < 0.45 ? 32 - facing : 32 - facing * (12 + progress * 3);
  }
  const stateRanges = [
    { start: 0, count: 2, state: 'idle' },
    { start: 8, count: 4, state: 'move' },
    { start: 24, count: 4, state: 'attack' },
    { start: 40, count: 4, state: 'ability' },
    { start: 56, count: 2, state: 'damage' },
  ];
  const range = stateRanges.find(({ start, count }) => frame >= start && frame < start + count * 4);
  const directionIndex = Math.floor((frame - range.start) / range.count);
  const direction = ['down', 'up', 'side', 'side-left'][directionIndex];
  if (range.state !== 'damage') return 32;
  const stateFrame = (frame - range.start) % range.count;
  const recoil = stateFrame === 0 ? -2 : -1;
  return direction === 'side' ? 32 + recoil : direction === 'side-left' ? 32 - recoil : 32;
}

test('fighter art II generator and manifest rebuild byte-identical committed output', () => {
  const originalSources = new Map(
    sources.map(({ file }) => [file, readFileSync(join(sourceRoot, file))]),
  );
  execFileSync(process.execPath, ['tools/reforged-assets/create-fighter-art-ii-sources.mjs'], {
    cwd: resolve('.'),
    stdio: 'pipe',
  });
  for (const { file } of sources) {
    assert.deepEqual(readFileSync(join(sourceRoot, file)), originalSources.get(file));
  }

  const root = mkdtempSync(join(tmpdir(), 'mmr-fighter-art-ii-'));
  const out = join(root, 'runtime');
  const provenance = join(root, 'fighter-art-ii.core.json');
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
    for (const file of ['fighter-art-ii.core.png', 'fighter-art-ii.core.json']) {
      assert.deepEqual(readFileSync(join(out, file)), readFileSync(join(committedRuntime, file)));
    }
    assert.deepEqual(readFileSync(provenance), readFileSync(committedProvenance));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fighter art II metadata is exact, sorted, and runtime-safe', () => {
  const metadataText = readFileSync(join(committedRuntime, 'fighter-art-ii.core.json'), 'utf8');
  const metadata = JSON.parse(metadataText);
  assert.equal(metadata.atlas.id, 'fighter-art-ii.core');
  assert.equal(metadata.atlas.width, 2048);
  assert.equal(metadata.atlas.height, 2048);
  assert.equal(metadata.atlas.format, 'RGBA8888');
  assert.equal(metadata.atlas.padding, 3);
  assert.equal(metadata.atlas.extrude, 2);
  assert.deepEqual(
    Object.entries(metadata.assets).map(([id, asset]) => [id, asset.frameCount]),
    [
      ['fighter.bubba.core', 88],
      ['fighter.jack.axe-absent', 88],
      ['fighter.jack.axe-present', 76],
      ['fighter.rook.body', 76],
      ['fighter.rook.helmet', 76],
    ],
  );
  assert.equal(Object.keys(metadata.frames).length, 404);
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
  assert.equal(provenance.atlasId, 'fighter-art-ii.core');
  assert.equal(provenance.textureSha256, metadata.integrity.textureSha256);
  assert.deepEqual(
    provenance.assets.map((asset) => asset.id),
    [
      'fighter.bubba.core',
      'fighter.jack.axe-absent',
      'fighter.jack.axe-present',
      'fighter.rook.body',
      'fighter.rook.helmet',
    ],
  );
});

test('source frames preserve registration, relative mass, negative space, and identity cues', () => {
  const decodedById = new Map();
  const meanMass = new Map();
  for (const source of sources) {
    const decoded = decodePng(readFileSync(join(sourceRoot, source.file)), source.file);
    decodedById.set(source.id, decoded);
    assert.equal(decoded.width, source.width);
    assert.equal(decoded.height, source.height);
    assert.equal((decoded.width / 64) * (decoded.height / 64), source.frames);
    const livingStats = Array.from({ length: 64 }, (_, frame) => frameStats(decoded, frame));
    if (source.id === 'rook-helmet') {
      for (const [frame, stats] of livingStats.entries()) {
        assert.ok(stats.opaquePixels >= 120, `rook helmet frame ${frame} lost its mass`);
        assert.ok(stats.minY >= 7 && stats.maxY <= 36, `rook helmet frame ${frame} drifted`);
      }
    } else {
      for (const [frame, stats] of livingStats.entries()) {
        assert.ok(stats.maxY >= 57 && stats.maxY <= 63, `${source.id} frame ${frame} feet drifted`);
        assert.ok(stats.opaquePixels >= 520, `${source.id} frame ${frame} lost its dominant mass`);
        assert.ok(stats.maxX - stats.minX < 63, `${source.id} frame ${frame} lost negative space`);
      }
      meanMass.set(
        source.id,
        livingStats.reduce((total, stats) => total + stats.opaquePixels, 0) / livingStats.length,
      );
    }
  }

  assert.ok(meanMass.get('bubba') > meanMass.get('jack-axe-present'));
  assert.ok(meanMass.get('bubba') > meanMass.get('rook-body'));
  assert.equal(hasRgb(decodedById.get('bubba'), [77, 155, 214], 40, 55), true);
  assert.equal(hasRgb(decodedById.get('bubba'), [151, 58, 42]), false);
  assert.equal(hasRgb(decodedById.get('jack-axe-present'), [91, 112, 132]), true);
  assert.equal(hasRgb(decodedById.get('jack-axe-absent'), [91, 112, 132]), false);
  assert.equal(hasRgb(decodedById.get('jack-axe-absent'), [151, 58, 42]), true);
  assert.equal(hasRgb(decodedById.get('jack-axe-absent'), [224, 93, 65], 40, 55), true);
  assert.equal(hasRgb(decodedById.get('rook-body'), [91, 112, 132]), true);
  assert.equal(hasRgb(decodedById.get('rook-body'), [62, 162, 157], 40, 55), true);
  assert.equal(hasRgb(decodedById.get('rook-helmet'), [72, 92, 68]), true);
  assert.equal(hasRgb(decodedById.get('rook-helmet'), [116, 214, 204]), true);
});

test('Jack body truth and Rook body/helmet grids remain synchronized in every state', () => {
  const present = decodePng(
    readFileSync(join(sourceRoot, 'jack-axe-present-states.png')),
    'jack-axe-present-states.png',
  );
  const absent = decodePng(
    readFileSync(join(sourceRoot, 'jack-axe-absent-states.png')),
    'jack-axe-absent-states.png',
  );
  for (let frame = 0; frame < 64; frame += 1) {
    assert.equal(
      frameHasRgb(present, frame, [91, 112, 132]),
      true,
      `Jack frame ${frame} lost its axe head`,
    );
    assert.equal(
      frameHasRgb(absent, frame, [91, 112, 132]),
      false,
      `Jack frame ${frame} leaked axe steel into the axe-absent body`,
    );
  }

  const body = decodePng(
    readFileSync(join(sourceRoot, 'rook-body-states.png')),
    'rook-body-states.png',
  );
  const helmet = decodePng(
    readFileSync(join(sourceRoot, 'rook-helmet-states.png')),
    'rook-helmet-states.png',
  );
  assert.equal(body.width, helmet.width);
  assert.equal(body.height, helmet.height);
  for (let frame = 0; frame < 76; frame += 1) {
    const helmetStats = frameStats(helmet, frame);
    assert.ok(helmetStats.opaquePixels > 0, `rook helmet frame ${frame} is empty`);
    const helmetCenter = (helmetStats.minX + helmetStats.maxX) / 2;
    assert.ok(
      Math.abs(rookHelmetExpectedCenterX(frame) - helmetCenter) <= 1.5,
      `rook frame ${frame} lost registration`,
    );
  }
});
