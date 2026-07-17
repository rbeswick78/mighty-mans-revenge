import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { decodePng } from './asset-pipeline.mjs';

const sourceRoot = resolve('art/reforged/sources/weapon-pickup-art');
const manifest = join(sourceRoot, 'manifest.json');
const runtime = resolve('client/public/assets/reforged/weapon-pickup-art');
const provenance = resolve('art/reforged/provenance/weapon-pickup-art/weapon-pickup-art.core.json');
const guns = ['rifle', 'pistol', 'shotgun', 'smg', 'sniper-rifle', 'launcher'];
const files = [
  ...guns.map((id) => `${id}-states.png`),
  'sustain-pickups.png',
  'rarity-language.png',
];

function frameStats(decoded, frame, columns = 4) {
  const column = frame % columns;
  const row = Math.floor(frame / columns);
  let minX = 64;
  let maxX = -1;
  let minY = 64;
  let maxY = -1;
  let opaque = 0;
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const offset = ((row * 64 + y) * decoded.width + column * 64 + x) * 4;
      if (decoded.pixels[offset + 3] === 0) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      opaque += 1;
    }
  }
  return { width: maxX - minX + 1, height: maxY - minY + 1, opaque };
}

test('weapon/pickup generator and atlas rebuild byte-identical output', () => {
  const before = new Map(files.map((file) => [file, readFileSync(join(sourceRoot, file))]));
  execFileSync(process.execPath, ['tools/reforged-assets/create-weapon-pickup-art-sources.mjs'], {
    cwd: resolve('.'),
    stdio: 'pipe',
  });
  for (const file of files)
    assert.deepEqual(readFileSync(join(sourceRoot, file)), before.get(file));
  const root = mkdtempSync(join(tmpdir(), 'mmr-weapon-pickup-'));
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
    for (const file of ['weapon-pickup-art.core.png', 'weapon-pickup-art.core.json']) {
      assert.deepEqual(readFileSync(join(out, file)), readFileSync(join(runtime, file)));
    }
    assert.deepEqual(readFileSync(proof), readFileSync(provenance));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('metadata is exact, sorted, runtime-safe, and provenance-complete', () => {
  const text = readFileSync(join(runtime, 'weapon-pickup-art.core.json'), 'utf8');
  const metadata = JSON.parse(text);
  assert.deepEqual(
    [metadata.atlas.width, metadata.atlas.height, metadata.atlas.padding, metadata.atlas.extrude],
    [1024, 1024, 3, 2],
  );
  assert.equal(Object.keys(metadata.frames).length, 158);
  assert.deepEqual(Object.keys(metadata.assets), [
    'pickup.sustain.core',
    'rarity.presentation.core',
    'weapon.launcher.core',
    'weapon.pistol.core',
    'weapon.rifle.core',
    'weapon.shotgun.core',
    'weapon.smg.core',
    'weapon.sniper-rifle.core',
  ]);
  for (const forbidden of ['license', 'attribution', 'creator', 'generation', 'sourceReference']) {
    assert.equal(text.includes(forbidden), false);
  }
  const lineage = JSON.parse(readFileSync(provenance, 'utf8'));
  assert.equal(lineage.assets.length, 8);
  assert.ok(lineage.assets.every((asset) => asset.provenance.generation.id));
});

test('six silhouettes, presentation states, pickups, and rarity shapes stay distinct', () => {
  const stats = new Map();
  for (const id of guns) {
    const decoded = decodePng(readFileSync(join(sourceRoot, `${id}-states.png`)), id);
    assert.deepEqual([decoded.width, decoded.height], [256, 384]);
    for (let frame = 0; frame < 24; frame += 1) assert.ok(frameStats(decoded, frame).opaque > 20);
    stats.set(id, frameStats(decoded, 20));
  }
  assert.ok(stats.get('pistol').width < stats.get('rifle').width);
  assert.ok(stats.get('rifle').width < stats.get('sniper-rifle').width);
  assert.ok(stats.get('launcher').height >= stats.get('shotgun').height);
  assert.ok(stats.get('smg').height > stats.get('pistol').height);
  const pickups = decodePng(readFileSync(join(sourceRoot, 'sustain-pickups.png')), 'pickups');
  assert.deepEqual([pickups.width, pickups.height], [256, 128]);
  assert.equal(
    new Set(Array.from({ length: 8 }, (_, frame) => frameStats(pickups, frame).opaque)).size >= 5,
    true,
  );
  const rarity = decodePng(readFileSync(join(sourceRoot, 'rarity-language.png')), 'rarity');
  const marks = Array.from({ length: 6 }, (_, frame) => frameStats(rarity, frame, 3));
  assert.ok(marks[0].opaque < marks[1].opaque);
  assert.equal(new Set(marks.map((mark) => `${mark.width}x${mark.height}:${mark.opaque}`)).size, 6);
});
