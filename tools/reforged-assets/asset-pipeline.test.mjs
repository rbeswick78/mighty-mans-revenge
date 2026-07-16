import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  PipelineError,
  buildAtlas,
  decodePng,
  encodePngRgba,
  inspectAssetManifest,
  validateAssetManifest,
} from './asset-pipeline.mjs';

const FIXTURE_MANIFEST = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'manifest.valid.json',
);

const ICON_PIXELS = Uint8Array.from([
  255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
]);
const PANEL_PIXELS = Uint8Array.from([
  16, 24, 32, 255, 32, 48, 64, 255, 255, 128, 32, 255, 255, 192, 64, 255, 24, 36, 48, 255, 48, 72,
  96, 255, 192, 64, 32, 255, 224, 96, 48, 255,
]);

function cloneFixtureManifest() {
  return JSON.parse(readFileSync(FIXTURE_MANIFEST, 'utf8'));
}

function createFixture(manifest = cloneFixtureManifest()) {
  const root = mkdtempSync(join(tmpdir(), 'mmr-reforged-assets-'));
  const manifestPath = join(root, 'manifest.json');
  const sources = join(root, 'sources');
  mkdirSync(sources, { recursive: true });
  writeFileSync(join(sources, 'icon-marker.png'), encodePngRgba(2, 2, ICON_PIXELS));
  writeFileSync(join(sources, 'panel-state.png'), encodePngRgba(4, 2, PANEL_PIXELS));
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, manifestPath };
}

function expectPipelineError(action, code) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof PipelineError);
    assert.equal(error.code, code);
    return true;
  });
}

test('validates exact dimensions and frame grids before packing', () => {
  const fixture = createFixture();
  try {
    const inspection = inspectAssetManifest(fixture.manifestPath);
    assert.equal(inspection.assets.length, 2);
    assert.equal(inspection.pack.placements.length, 3);
    assert.deepEqual(
      inspection.pack.placements.map((frame) => frame.name),
      ['fixture.icon.marker/000', 'fixture.panel.state/000', 'fixture.panel.state/001'],
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('builds byte-identical atlases, metadata, and provenance reports', () => {
  const fixture = createFixture();
  try {
    const first = buildAtlas({
      manifestPath: fixture.manifestPath,
      outputDirectory: join(fixture.root, 'out-a'),
      provenancePath: join(fixture.root, 'provenance-a.json'),
    });
    const second = buildAtlas({
      manifestPath: fixture.manifestPath,
      outputDirectory: join(fixture.root, 'out-b'),
      provenancePath: join(fixture.root, 'provenance-b.json'),
    });
    assert.equal(first.textureSha256, second.textureSha256);
    assert.deepEqual(readFileSync(first.texturePath), readFileSync(second.texturePath));
    assert.deepEqual(readFileSync(first.metadataPath), readFileSync(second.metadataPath));
    assert.deepEqual(readFileSync(first.provenancePath), readFileSync(second.provenancePath));
    const texture = decodePng(readFileSync(first.texturePath), 'fixture atlas');
    assert.equal(texture.width, first.width);
    assert.equal(texture.height, first.height);
    assert.equal(first.frameCount, 3);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('emits runtime import metadata without source paths or license text', () => {
  const fixture = createFixture();
  try {
    const result = buildAtlas({
      manifestPath: fixture.manifestPath,
      outputDirectory: join(fixture.root, 'out'),
      provenancePath: join(fixture.root, 'provenance.json'),
    });
    const metadataText = readFileSync(result.metadataPath, 'utf8');
    const metadata = JSON.parse(metadataText);
    assert.equal(metadata.schemaVersion, 1);
    assert.equal(metadata.atlas.format, 'RGBA8888');
    assert.equal(metadata.assets['fixture.panel.state'].frameCount, 2);
    assert.equal(metadata.frames['fixture.panel.state/001'].rotated, false);
    assert.doesNotMatch(metadataText, /source|license|attribution|provenance/i);

    const provenance = JSON.parse(readFileSync(result.provenancePath, 'utf8'));
    assert.equal(provenance.assets.length, 2);
    assert.equal(provenance.assets[0].provenance.license, 'LicenseRef-MMR-Project-Owned');
    assert.match(provenance.assets[0].sourceSha256, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('reports naming and frame failures together with stable error codes', () => {
  const manifest = cloneFixtureManifest();
  manifest.assets[0].id = 'Bad Name';
  manifest.assets[1].frames.count = 3;
  expectPipelineError(
    () => validateAssetManifest(manifest, 'fixture.json'),
    'MANIFEST_VALIDATION_FAILED',
  );
  try {
    validateAssetManifest(manifest, 'fixture.json');
  } catch (error) {
    assert.ok(error instanceof PipelineError);
    assert.ok(error.issues.some((issue) => issue.startsWith('[ASSET_NAME]')));
    assert.ok(error.issues.some((issue) => issue.startsWith('[FRAME_GRID]')));
    assert.equal(error.issues.join('\n'), [...error.issues].sort().join('\n'));
  }
});

test('rejects missing AI and third-party provenance fields', () => {
  const manifest = cloneFixtureManifest();
  manifest.assets[0].provenance = {
    origin: 'ai-assisted',
    creator: "Mighty Man's Revenge",
    license: 'LicenseRef-MMR-Project-Owned',
    attribution: 'OpenAI assisted',
    sourceReference: 'fixture',
  };
  manifest.assets[1].provenance = {
    origin: 'third-party',
    creator: 'Fixture artist',
    license: 'LicenseRef-Fixture',
    attribution: 'Fixture artist',
    sourceReference: 'fixture',
  };
  try {
    validateAssetManifest(manifest, 'fixture.json');
    assert.fail('expected provenance validation to fail');
  } catch (error) {
    assert.ok(error instanceof PipelineError);
    assert.ok(error.issues.some((issue) => issue.startsWith('[PROVENANCE_AI]')));
    assert.ok(error.issues.some((issue) => issue.startsWith('[PROVENANCE_THIRD_PARTY]')));
  }
});

test('rejects source path traversal and non-PNG source archives', () => {
  const manifest = cloneFixtureManifest();
  manifest.assets[0].source = '../source-archive.zip';
  try {
    validateAssetManifest(manifest, 'fixture.json');
    assert.fail('expected source path validation to fail');
  } catch (error) {
    assert.ok(error instanceof PipelineError);
    assert.ok(error.issues.some((issue) => issue.startsWith('[SOURCE_PATH]')));
  }
});

test('enforces source dimensions and compressed atlas size boundaries', () => {
  const dimensionFixture = createFixture();
  try {
    writeFileSync(
      join(dimensionFixture.root, 'sources', 'icon-marker.png'),
      encodePngRgba(1, 1, Uint8Array.from([255, 255, 255, 255])),
    );
    expectPipelineError(
      () => inspectAssetManifest(dimensionFixture.manifestPath),
      'SOURCE_DIMENSION_MISMATCH',
    );
  } finally {
    rmSync(dimensionFixture.root, { recursive: true, force: true });
  }

  const decodedManifest = cloneFixtureManifest();
  decodedManifest.atlas.limits.maxDecodedBytes = 15;
  const decodedFixture = createFixture(decodedManifest);
  try {
    expectPipelineError(() => inspectAssetManifest(decodedFixture.manifestPath), 'DECODED_SIZE');
  } finally {
    rmSync(decodedFixture.root, { recursive: true, force: true });
  }

  const manifest = cloneFixtureManifest();
  manifest.atlas.limits.maxAtlasBytes = 1;
  const compressionFixture = createFixture(manifest);
  try {
    expectPipelineError(
      () =>
        buildAtlas({
          manifestPath: compressionFixture.manifestPath,
          outputDirectory: join(compressionFixture.root, 'out'),
          provenancePath: join(compressionFixture.root, 'provenance.json'),
        }),
      'ATLAS_COMPRESSED_SIZE',
    );
  } finally {
    rmSync(compressionFixture.root, { recursive: true, force: true });
  }
});

test('refuses to write provenance into the runtime public tree', () => {
  const fixture = createFixture();
  try {
    expectPipelineError(
      () =>
        buildAtlas({
          manifestPath: fixture.manifestPath,
          outputDirectory: join(fixture.root, 'out'),
          provenancePath: join(process.cwd(), 'client', 'public', 'fixture-provenance.json'),
        }),
      'PROVENANCE_RUNTIME_PATH',
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
