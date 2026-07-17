import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { decodePng } from './asset-pipeline.mjs';

const sourceRoot = resolve('art/reforged/sources/combat-feedback-art');
const sourceFile = join(sourceRoot, 'combat-feedback.png');
const manifest = join(sourceRoot, 'manifest.json');
const runtime = resolve('client/public/assets/reforged/combat-feedback-art');
const provenance = resolve(
  'art/reforged/provenance/combat-feedback-art/combat-feedback-art.core.json',
);

function framePixel(decoded, frame, x, y) {
  const column = frame % 8;
  const row = Math.floor(frame / 8);
  const offset = ((row * 64 + y) * decoded.width + column * 64 + x) * 4;
  return Array.from(decoded.pixels.subarray(offset, offset + 4));
}

function frameStats(decoded, frame) {
  let opaque = 0;
  let luminanceMin = 255;
  let luminanceMax = 0;
  let totalAlpha = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const [r, g, b, a] = framePixel(decoded, frame, x, y);
      if (a === 0) continue;
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
      luminanceMin = Math.min(luminanceMin, luminance);
      luminanceMax = Math.max(luminanceMax, luminance);
      opaque += 1;
      totalAlpha += a;
      weightedX += x * a;
      weightedY += y * a;
    }
  }
  return {
    opaque,
    contrast: luminanceMax - luminanceMin,
    centroidX: weightedX / totalAlpha,
    centroidY: weightedY / totalAlpha,
  };
}

test('combat-feedback generator and isolated atlas rebuild byte-identical output', () => {
  const before = readFileSync(sourceFile);
  execFileSync(process.execPath, ['tools/reforged-assets/create-combat-feedback-art-sources.mjs'], {
    cwd: resolve('.'),
    stdio: 'pipe',
  });
  assert.deepEqual(readFileSync(sourceFile), before);
  const root = mkdtempSync(join(tmpdir(), 'mmr-combat-feedback-'));
  try {
    const out = join(root, 'runtime');
    const proof = join(root, 'provenance.json');
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
        proof,
      ],
      { cwd: resolve('.'), stdio: 'pipe' },
    );
    for (const file of ['combat-feedback-art.core.png', 'combat-feedback-art.core.json']) {
      assert.deepEqual(readFileSync(join(out, file)), readFileSync(join(runtime, file)));
    }
    assert.deepEqual(readFileSync(proof), readFileSync(provenance));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('metadata is exact, sorted, runtime-safe, bounded, and lineage-complete', () => {
  const text = readFileSync(join(runtime, 'combat-feedback-art.core.json'), 'utf8');
  const metadata = JSON.parse(text);
  assert.deepEqual(
    [metadata.atlas.width, metadata.atlas.height, metadata.atlas.padding, metadata.atlas.extrude],
    [1024, 512, 3, 2],
  );
  assert.deepEqual(Object.keys(metadata.assets), ['feedback.presentation.core']);
  assert.equal(Object.keys(metadata.frames).length, 96);
  assert.ok(statSync(sourceFile).size < 1048576);
  assert.ok(statSync(join(runtime, 'combat-feedback-art.core.png')).size < 2097152);
  for (const forbidden of ['license', 'attribution', 'creator', 'generation', 'sourceReference']) {
    assert.equal(text.includes(forbidden), false);
  }
  const lineage = JSON.parse(readFileSync(provenance, 'utf8'));
  assert.equal(lineage.assets.length, 1);
  assert.equal(lineage.assets[0].provenance.origin, 'ai-assisted');
  assert.equal(
    lineage.assets[0].provenance.generation.id,
    'exec-acedef78-2adb-45cf-9953-e6a9a1d2051b',
  );
  const sourceManifest = JSON.parse(readFileSync(manifest, 'utf8'));
  assert.equal(sourceManifest.atlas.id, 'combat-feedback-art.core');
  assert.equal(
    sourceManifest.assets.some((asset) =>
      /modern-ui|fighter-art|weapon-pickup|biome-environment/.test(asset.id),
    ),
    false,
  );
});

test('directional muzzle and separate scenery/player impact grids preserve origin and direction', () => {
  const sheet = decodePng(readFileSync(sourceFile), sourceFile);
  assert.deepEqual([sheet.width, sheet.height], [512, 768]);
  const muzzle = [1, 5, 9, 13].map((frame) => frameStats(sheet, frame));
  assert.ok(muzzle[0].centroidX > 35 && Math.abs(muzzle[0].centroidY - 32) < 3);
  assert.ok(muzzle[1].centroidY > 35 && Math.abs(muzzle[1].centroidX - 32) < 3);
  assert.ok(muzzle[2].centroidX < 29 && Math.abs(muzzle[2].centroidY - 32) < 3);
  assert.ok(muzzle[3].centroidY < 29 && Math.abs(muzzle[3].centroidX - 32) < 3);
  for (const frame of [...Array(40).keys()]) {
    assert.ok(framePixel(sheet, frame, 32, 32)[3] > 0);
  }
  for (let direction = 0; direction < 4; direction += 1) {
    const scenery = frameStats(sheet, 16 + direction * 3 + 1);
    const player = frameStats(sheet, 28 + direction * 3 + 1);
    assert.notEqual(player.opaque, scenery.opaque);
    assert.ok(player.contrast > 130 && scenery.contrast > 90);
  }
});

test('explosion, healing, armor, abilities, rarity, zone, and elimination keep decisive geometry', () => {
  const sheet = decodePng(readFileSync(sourceFile), sourceFile);
  for (let frame = 40; frame < 48; frame += 1) {
    for (const [x, y] of [
      [62, 32],
      [2, 32],
      [32, 62],
      [32, 2],
    ]) {
      assert.ok(framePixel(sheet, frame, x, y)[3] > 0);
    }
    assert.ok(frameStats(sheet, frame).opaque < 1900);
  }
  assert.ok(framePixel(sheet, 50, 32, 32)[3] > 0);
  assert.ok(framePixel(sheet, 54, 32, 32)[3] > 0);
  const abilitySilhouettes = new Set(
    [58, 61, 64, 67, 70, 73].map((frame) => frameStats(sheet, frame).opaque),
  );
  assert.ok(abilitySilhouettes.size >= 5);
  for (let frame = 74; frame < 96; frame += 1) {
    const stats = frameStats(sheet, frame);
    assert.ok(stats.opaque > 80);
    assert.ok(stats.contrast > 100);
  }
});

test('all 96 cells remain mip-safe, bounded, and grayscale-readable at gameplay scale', () => {
  const sheet = decodePng(readFileSync(sourceFile), sourceFile);
  for (let frame = 0; frame < 96; frame += 1) {
    const stats = frameStats(sheet, frame);
    assert.ok(stats.opaque > 25 && stats.opaque < 1900);
    assert.ok(stats.contrast > 75);
    for (let cell = 0; cell < 64; cell += 1) {
      assert.equal(framePixel(sheet, frame, cell, 0)[3], 0);
      assert.equal(framePixel(sheet, frame, cell, 63)[3], 0);
      assert.equal(framePixel(sheet, frame, 0, cell)[3], 0);
      assert.equal(framePixel(sheet, frame, 63, cell)[3], 0);
    }
  }
});
