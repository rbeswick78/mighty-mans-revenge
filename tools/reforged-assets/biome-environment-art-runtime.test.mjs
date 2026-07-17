import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { decodePng } from './asset-pipeline.mjs';

const sourceRoot = resolve('art/reforged/sources/biome-environment-art');
const manifest = join(sourceRoot, 'manifest.json');
const runtime = resolve('client/public/assets/reforged/biome-environment-art');
const provenance = resolve(
  'art/reforged/provenance/biome-environment-art/biome-environment-art.core.json',
);
const families = ['wasteland', 'overgrown', 'industrial', 'irradiated'];
const files = families.map((family) => `${family}-environment.png`);

function framePixel(decoded, frame, x, y) {
  const column = frame % 5;
  const row = Math.floor(frame / 5);
  const offset = ((row * 64 + y) * decoded.width + column * 64 + x) * 4;
  return Array.from(decoded.pixels.subarray(offset, offset + 4));
}

function frameStats(decoded, frame) {
  let minX = 64;
  let maxX = -1;
  let minY = 64;
  let maxY = -1;
  let opaque = 0;
  let luminance = 0;
  let totalAlpha = 0;
  let alphaWeightedX = 0;
  let alphaWeightedY = 0;
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const [r, g, b, a] = framePixel(decoded, frame, x, y);
      if (a === 0) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      opaque += 1;
      luminance += r * 0.2126 + g * 0.7152 + b * 0.0722;
      totalAlpha += a;
      alphaWeightedX += x * a;
      alphaWeightedY += y * a;
    }
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    opaque,
    luminance: opaque === 0 ? 0 : luminance / opaque,
    centroidX: alphaWeightedX / totalAlpha,
    centroidY: alphaWeightedY / totalAlpha,
  };
}

test('biome generator and isolated atlas rebuild byte-identical output', () => {
  const before = new Map(files.map((file) => [file, readFileSync(join(sourceRoot, file))]));
  execFileSync(
    process.execPath,
    ['tools/reforged-assets/create-biome-environment-art-sources.mjs'],
    {
      cwd: resolve('.'),
      stdio: 'pipe',
    },
  );
  for (const file of files)
    assert.deepEqual(readFileSync(join(sourceRoot, file)), before.get(file));
  const root = mkdtempSync(join(tmpdir(), 'mmr-biome-environment-'));
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
    for (const file of ['biome-environment-art.core.png', 'biome-environment-art.core.json']) {
      assert.deepEqual(readFileSync(join(out, file)), readFileSync(join(runtime, file)));
    }
    assert.deepEqual(readFileSync(proof), readFileSync(provenance));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('metadata is exact, sorted, runtime-safe, and lineage-complete', () => {
  const text = readFileSync(join(runtime, 'biome-environment-art.core.json'), 'utf8');
  const metadata = JSON.parse(text);
  assert.deepEqual(
    [metadata.atlas.width, metadata.atlas.height, metadata.atlas.padding, metadata.atlas.extrude],
    [1024, 512, 3, 2],
  );
  assert.equal(Object.keys(metadata.frames).length, 80);
  assert.deepEqual(
    Object.keys(metadata.assets),
    families
      .slice()
      .sort()
      .map((family) => `environment.${family}.core`),
  );
  for (const forbidden of ['license', 'attribution', 'creator', 'generation', 'sourceReference']) {
    assert.equal(text.includes(forbidden), false);
  }
  const lineage = JSON.parse(readFileSync(provenance, 'utf8'));
  assert.equal(lineage.assets.length, 4);
  assert.ok(
    lineage.assets.every(
      (asset) => asset.provenance.generation.id === 'exec-bad498a8-bd8f-4c89-a4c7-266d172a9fe3',
    ),
  );
});

test('terrain tiles preserve seam edges and family transition compatibility', () => {
  const decoded = new Map(
    families.map((family) => [
      family,
      decodePng(readFileSync(join(sourceRoot, `${family}-environment.png`)), family),
    ]),
  );
  const next = {
    wasteland: 'overgrown',
    overgrown: 'industrial',
    industrial: 'irradiated',
    irradiated: 'wasteland',
  };
  for (const family of families) {
    const sheet = decoded.get(family);
    assert.deepEqual([sheet.width, sheet.height], [320, 256]);
    const base = framePixel(sheet, 0, 0, 0);
    for (const frame of [0, 1, 2]) {
      for (let cell = 0; cell < 64; cell += 1) {
        assert.deepEqual(framePixel(sheet, frame, cell, 0), base);
        assert.deepEqual(framePixel(sheet, frame, cell, 63), base);
        assert.deepEqual(framePixel(sheet, frame, 0, cell), base);
        assert.deepEqual(framePixel(sheet, frame, 63, cell), base);
      }
    }
    const targetBase = framePixel(decoded.get(next[family]), 0, 0, 0);
    for (let cell = 0; cell < 64; cell += 1) {
      assert.deepEqual(framePixel(sheet, 3, 0, cell), base);
      assert.deepEqual(framePixel(sheet, 3, 63, cell), targetBase);
      assert.deepEqual(framePixel(sheet, 4, cell, 0), base);
      assert.deepEqual(framePixel(sheet, 4, cell, 63), targetBase);
    }
  }
});

test('collision silhouettes, damage pairs, footprints, landmarks, and southeast shadows remain registered', () => {
  for (const family of families) {
    const sheet = decodePng(readFileSync(join(sourceRoot, `${family}-environment.png`)), family);
    const wall = frameStats(sheet, 6);
    const damagedWall = frameStats(sheet, 7);
    const cover = frameStats(sheet, 8);
    const damagedCover = frameStats(sheet, 9);
    assert.ok(wall.height > cover.height);
    assert.ok(wall.opaque > cover.opaque);
    assert.ok(wall.luminance < cover.luminance);
    assert.equal(wall.maxY, damagedWall.maxY);
    assert.equal(cover.maxY, damagedCover.maxY);
    assert.notEqual(wall.opaque, damagedWall.opaque);
    assert.notEqual(cover.opaque, damagedCover.opaque);
    for (const [intact, damaged] of [
      [10, 11],
      [12, 13],
      [14, 15],
    ]) {
      const a = frameStats(sheet, intact);
      const b = frameStats(sheet, damaged);
      assert.ok(Math.abs(a.width - b.width) <= 10);
      assert.ok(Math.abs(a.maxY - b.maxY) <= 4);
      assert.notEqual(a.opaque, b.opaque);
    }
    let landmarkOpening = 0;
    for (let y = 30; y <= 51; y += 1) {
      for (let x = 27; x <= 37; x += 1)
        if (framePixel(sheet, 14, x, y)[3] === 0) landmarkOpening += 1;
    }
    assert.ok(landmarkOpening > 80);
    const wallShadow = frameStats(sheet, 16);
    const coverShadow = frameStats(sheet, 17);
    const propShadow = frameStats(sheet, 18);
    assert.equal(wallShadow.maxX, 63);
    assert.equal(wallShadow.maxY, 57);
    assert.ok(wallShadow.centroidX > 32 && wallShadow.centroidY > 35);
    assert.ok(coverShadow.centroidX > 32 && coverShadow.centroidY > 40);
    assert.ok(propShadow.centroidX > 32 && propShadow.centroidY > 38);
  }
});

test('four palettes and grayscale-readable role values remain distinct', () => {
  const bases = [];
  const anchorValues = [];
  for (const family of families) {
    const sheet = decodePng(readFileSync(join(sourceRoot, `${family}-environment.png`)), family);
    bases.push(framePixel(sheet, 0, 0, 0).slice(0, 3).join(','));
    const wall = frameStats(sheet, 6);
    const cover = frameStats(sheet, 8);
    const anchor = frameStats(sheet, 19);
    assert.ok(wall.luminance < cover.luminance);
    assert.ok(anchor.luminance > wall.luminance);
    anchorValues.push(Math.round(anchor.luminance));
  }
  assert.equal(new Set(bases).size, 4);
  assert.ok(new Set(anchorValues).size >= 3);
});
