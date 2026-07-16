import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ASSET_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const ATLAS_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const PATH_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ORIGINS = new Set(['original', 'ai-assisted', 'third-party']);
const PIPELINE_VERSION = 1;
const MAX_SOURCE_DIMENSION = 4096;

export class PipelineError extends Error {
  constructor(code, message, issues = []) {
    super(`[${code}] ${message}`);
    this.name = 'PipelineError';
    this.code = code;
    this.issues = Object.freeze([...issues]);
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((a, b) => a.localeCompare(b))
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isPowerOfTwo(value) {
  return isPositiveInteger(value) && (value & (value - 1)) === 0;
}

function nextPowerOfTwo(value) {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function pathIsInside(parent, child) {
  const delta = relative(resolve(parent), resolve(child));
  return delta === '' || (!delta.startsWith(`..${sep}`) && delta !== '..' && !isAbsolute(delta));
}

function validateSourcePath(value, path, issues) {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push(`[SOURCE_PATH] ${path} must be a non-empty relative PNG path`);
    return;
  }
  if (isAbsolute(value) || value.includes('\\') || value.split('/').includes('..')) {
    issues.push(`[SOURCE_PATH] ${path} must stay relative to the manifest directory`);
    return;
  }
  const parts = value.split('/');
  const file = parts.pop();
  if (!file?.endsWith('.png')) {
    issues.push(`[SOURCE_PATH] ${path} must end in .png`);
    return;
  }
  const stem = file.slice(0, -4);
  if (!PATH_SEGMENT.test(stem) || parts.some((part) => !PATH_SEGMENT.test(part))) {
    issues.push(`[SOURCE_PATH] ${path} must use lower-kebab-case path segments`);
  }
}

function validateProvenance(value, path, issues) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`[PROVENANCE_REQUIRED] ${path} must be an object`);
    return;
  }
  if (!ORIGINS.has(value.origin)) {
    issues.push(`[PROVENANCE_ORIGIN] ${path}.origin must be original, ai-assisted, or third-party`);
  }
  for (const field of ['creator', 'license', 'attribution', 'sourceReference']) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      issues.push(`[PROVENANCE_FIELD] ${path}.${field} must be a non-empty string`);
    }
  }
  if (value.origin === 'ai-assisted') {
    const generation = value.generation;
    for (const field of ['provider', 'id', 'promptDocument']) {
      if (
        !generation ||
        typeof generation[field] !== 'string' ||
        generation[field].trim().length === 0
      ) {
        issues.push(`[PROVENANCE_AI] ${path}.generation.${field} must be a non-empty string`);
      }
    }
  }
  if (value.origin === 'third-party') {
    if (typeof value.sourceUrl !== 'string' || !/^https?:\/\//.test(value.sourceUrl)) {
      issues.push(`[PROVENANCE_THIRD_PARTY] ${path}.sourceUrl must be an http(s) URL`);
    }
    if (value.redistribution !== 'curated-runtime-output-only') {
      issues.push(
        `[PROVENANCE_THIRD_PARTY] ${path}.redistribution must be curated-runtime-output-only`,
      );
    }
  }
}

export function validateAssetManifest(raw, manifestPath = 'asset-manifest.json') {
  const issues = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PipelineError('MANIFEST_INVALID', 'manifest root must be an object');
  }
  if (raw.schemaVersion !== PIPELINE_VERSION) {
    issues.push(`[SCHEMA_VERSION] schemaVersion must be ${PIPELINE_VERSION}`);
  }

  const atlas = raw.atlas;
  if (!atlas || typeof atlas !== 'object' || Array.isArray(atlas)) {
    issues.push('[ATLAS_REQUIRED] atlas must be an object');
  } else {
    if (typeof atlas.id !== 'string' || !ATLAS_ID.test(atlas.id)) {
      issues.push('[ATLAS_NAME] atlas.id must use lower-kebab-case dot segments');
    }
    for (const field of ['maxWidth', 'maxHeight']) {
      if (!isPowerOfTwo(atlas[field]) || atlas[field] < 16 || atlas[field] > 4096) {
        issues.push(`[ATLAS_DIMENSION] atlas.${field} must be a power of two from 16 through 4096`);
      }
    }
    if (!Number.isInteger(atlas.padding) || atlas.padding < 1 || atlas.padding > 8) {
      issues.push('[ATLAS_PADDING] atlas.padding must be an integer from 1 through 8');
    }
    if (!Number.isInteger(atlas.extrude) || atlas.extrude < 1 || atlas.extrude > 4) {
      issues.push('[ATLAS_EXTRUDE] atlas.extrude must be an integer from 1 through 4');
    }
    const limits = atlas.limits;
    for (const field of ['maxSourceBytes', 'maxDecodedBytes', 'maxAtlasBytes']) {
      if (!limits || !isPositiveInteger(limits[field])) {
        issues.push(`[COMPRESSION_LIMIT] atlas.limits.${field} must be a positive integer`);
      }
    }
  }

  if (!Array.isArray(raw.assets) || raw.assets.length === 0) {
    issues.push('[ASSETS_REQUIRED] assets must contain at least one entry');
  } else {
    const ids = new Set();
    const sources = new Set();
    raw.assets.forEach((asset, index) => {
      const path = `assets[${index}]`;
      if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
        issues.push(`[ASSET_INVALID] ${path} must be an object`);
        return;
      }
      if (typeof asset.id !== 'string' || !ASSET_ID.test(asset.id)) {
        issues.push(`[ASSET_NAME] ${path}.id must use lower-kebab-case dot segments`);
      } else if (ids.has(asset.id)) {
        issues.push(`[ASSET_DUPLICATE] ${path}.id duplicates ${asset.id}`);
      } else {
        ids.add(asset.id);
      }
      validateSourcePath(asset.source, `${path}.source`, issues);
      if (typeof asset.source === 'string') {
        if (sources.has(asset.source)) {
          issues.push(`[SOURCE_DUPLICATE] ${path}.source duplicates ${asset.source}`);
        }
        sources.add(asset.source);
      }
      for (const field of ['width', 'height']) {
        if (!isPositiveInteger(asset[field]) || asset[field] > MAX_SOURCE_DIMENSION) {
          issues.push(
            `[SOURCE_DIMENSION] ${path}.${field} must be an integer from 1 through ${MAX_SOURCE_DIMENSION}`,
          );
        }
      }
      const frames = asset.frames;
      if (!frames || typeof frames !== 'object' || Array.isArray(frames)) {
        issues.push(`[FRAMES_REQUIRED] ${path}.frames must be an object`);
      } else {
        for (const field of ['width', 'height', 'count', 'columns']) {
          if (!isPositiveInteger(frames[field])) {
            issues.push(`[FRAME_VALUE] ${path}.frames.${field} must be a positive integer`);
          }
        }
        if (
          isPositiveInteger(frames.count) &&
          isPositiveInteger(frames.columns) &&
          frames.count % frames.columns !== 0
        ) {
          issues.push(`[FRAME_GRID] ${path}.frames.count must be divisible by columns`);
        }
        if (
          isPositiveInteger(asset.width) &&
          isPositiveInteger(frames.width) &&
          isPositiveInteger(frames.columns) &&
          asset.width !== frames.width * frames.columns
        ) {
          issues.push(`[FRAME_WIDTH] ${path} source width must equal frame width times columns`);
        }
        if (
          isPositiveInteger(asset.height) &&
          isPositiveInteger(frames.height) &&
          isPositiveInteger(frames.count) &&
          isPositiveInteger(frames.columns) &&
          frames.count % frames.columns === 0 &&
          asset.height !== frames.height * (frames.count / frames.columns)
        ) {
          issues.push(
            `[FRAME_HEIGHT] ${path} source height must equal the complete frame grid height`,
          );
        }
      }
      validateProvenance(asset.provenance, `${path}.provenance`, issues);
    });
  }

  if (issues.length > 0) {
    const sorted = issues.sort((a, b) => a.localeCompare(b));
    throw new PipelineError(
      'MANIFEST_VALIDATION_FAILED',
      `${manifestPath} has ${sorted.length} validation issue${sorted.length === 1 ? '' : 's'}:\n${sorted.join('\n')}`,
      sorted,
    );
  }
  return stableValue(raw);
}

let crcTable;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
  return crcTable;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  const table = getCrcTable();
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return result;
}

export function encodePngRgba(width, height, pixels) {
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    throw new PipelineError('PNG_DIMENSION', 'PNG dimensions must be positive integers');
  }
  if (!(pixels instanceof Uint8Array) || pixels.length !== width * height * 4) {
    throw new PipelineError('PNG_PIXELS', `expected ${width * height * 4} RGBA bytes`);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (1 + width * 4);
    scanlines[rowOffset] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4).copy(
      scanlines,
      rowOffset + 1,
    );
  }
  const compressed = deflateSync(scanlines, { level: 9 });
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function paethPredictor(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

export function decodePng(buffer, label = 'PNG', maxDecodedBytes = Number.MAX_SAFE_INTEGER) {
  if (!Buffer.isBuffer(buffer) || buffer.length < PNG_SIGNATURE.length) {
    throw new PipelineError('PNG_INVALID', `${label} is not a PNG buffer`);
  }
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new PipelineError('PNG_SIGNATURE', `${label} has an invalid PNG signature`);
  }
  let offset = PNG_SIGNATURE.length;
  let header;
  const idat = [];
  let sawEnd = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      throw new PipelineError('PNG_TRUNCATED', `${label} has a truncated ${type} chunk`);
    }
    const typeAndData = buffer.subarray(offset + 4, dataEnd);
    const expectedCrc = buffer.readUInt32BE(dataEnd);
    if (crc32(typeAndData) !== expectedCrc) {
      throw new PipelineError('PNG_CRC', `${label} has an invalid ${type} checksum`);
    }
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      if (header || length !== 13) throw new PipelineError('PNG_IHDR', `${label} has invalid IHDR`);
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      sawEnd = true;
      break;
    }
    offset = dataEnd + 4;
  }
  if (!header || idat.length === 0 || !sawEnd) {
    throw new PipelineError('PNG_STRUCTURE', `${label} must contain IHDR, IDAT, and IEND`);
  }
  if (
    header.bitDepth !== 8 ||
    ![2, 6].includes(header.colorType) ||
    header.compression !== 0 ||
    header.filter !== 0 ||
    header.interlace !== 0
  ) {
    throw new PipelineError('PNG_FORMAT', `${label} must be non-interlaced 8-bit RGB or RGBA PNG`);
  }
  if (
    !isPositiveInteger(header.width) ||
    !isPositiveInteger(header.height) ||
    header.width > MAX_SOURCE_DIMENSION ||
    header.height > MAX_SOURCE_DIMENSION
  ) {
    throw new PipelineError(
      'PNG_DIMENSION',
      `${label} dimensions must be from 1 through ${MAX_SOURCE_DIMENSION}`,
    );
  }
  const rgbaBytes = header.width * header.height * 4;
  if (rgbaBytes > maxDecodedBytes) {
    throw new PipelineError(
      'DECODED_SIZE',
      `${label} requires ${rgbaBytes} decoded bytes; remaining limit is ${maxDecodedBytes}`,
    );
  }
  const bytesPerPixel = header.colorType === 6 ? 4 : 3;
  const rowBytes = header.width * bytesPerPixel;
  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(idat));
  } catch (error) {
    throw new PipelineError('PNG_DEFLATE', `${label} cannot be decompressed: ${error.message}`);
  }
  if (inflated.length !== header.height * (rowBytes + 1)) {
    throw new PipelineError('PNG_SCANLINES', `${label} has an unexpected decompressed size`);
  }
  const decoded = Buffer.alloc(header.width * header.height * bytesPerPixel);
  for (let y = 0; y < header.height; y += 1) {
    const inputOffset = y * (rowBytes + 1);
    const filter = inflated[inputOffset];
    if (filter > 4) throw new PipelineError('PNG_FILTER', `${label} uses unknown filter ${filter}`);
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = inflated[inputOffset + 1 + x];
      const outputOffset = y * rowBytes + x;
      const left = x >= bytesPerPixel ? decoded[outputOffset - bytesPerPixel] : 0;
      const up = y > 0 ? decoded[outputOffset - rowBytes] : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel ? decoded[outputOffset - rowBytes - bytesPerPixel] : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? Math.floor((left + up) / 2)
                : paethPredictor(left, up, upperLeft);
      decoded[outputOffset] = (raw + predictor) & 0xff;
    }
  }
  const rgba = Buffer.alloc(header.width * header.height * 4);
  for (let pixel = 0; pixel < header.width * header.height; pixel += 1) {
    const sourceOffset = pixel * bytesPerPixel;
    const outputOffset = pixel * 4;
    rgba[outputOffset] = decoded[sourceOffset];
    rgba[outputOffset + 1] = decoded[sourceOffset + 1];
    rgba[outputOffset + 2] = decoded[sourceOffset + 2];
    rgba[outputOffset + 3] = bytesPerPixel === 4 ? decoded[sourceOffset + 3] : 255;
  }
  return Object.freeze({ width: header.width, height: header.height, pixels: rgba });
}

function readManifest(manifestPath) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new PipelineError('MANIFEST_READ', `${manifestPath}: ${error.message}`);
  }
  return validateAssetManifest(raw, manifestPath);
}

function loadAssets(manifest, manifestPath) {
  const manifestDirectory = dirname(resolve(manifestPath));
  let decodedBytes = 0;
  return manifest.assets
    .map((asset) => {
      const sourcePath = resolve(manifestDirectory, asset.source);
      if (!pathIsInside(manifestDirectory, sourcePath)) {
        throw new PipelineError('SOURCE_ESCAPE', `${asset.id} escapes the manifest directory`);
      }
      let source;
      try {
        source = readFileSync(sourcePath);
      } catch (error) {
        throw new PipelineError('SOURCE_READ', `${asset.id}: ${error.message}`);
      }
      if (source.length > manifest.atlas.limits.maxSourceBytes) {
        throw new PipelineError(
          'SOURCE_COMPRESSED_SIZE',
          `${asset.id} is ${source.length} bytes; limit is ${manifest.atlas.limits.maxSourceBytes}`,
        );
      }
      const image = decodePng(
        source,
        asset.id,
        manifest.atlas.limits.maxDecodedBytes - decodedBytes,
      );
      if (image.width !== asset.width || image.height !== asset.height) {
        throw new PipelineError(
          'SOURCE_DIMENSION_MISMATCH',
          `${asset.id} is ${image.width}x${image.height}; manifest requires ${asset.width}x${asset.height}`,
        );
      }
      decodedBytes += image.pixels.length;
      return Object.freeze({ ...asset, sourceBytes: source, image });
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function splitFrames(assets) {
  const frames = [];
  for (const asset of assets) {
    const rows = asset.frames.count / asset.frames.columns;
    for (let index = 0; index < asset.frames.count; index += 1) {
      const column = index % asset.frames.columns;
      const row = Math.floor(index / asset.frames.columns);
      if (row >= rows)
        throw new PipelineError('FRAME_GRID', `${asset.id} has an invalid frame grid`);
      const pixels = Buffer.alloc(asset.frames.width * asset.frames.height * 4);
      for (let y = 0; y < asset.frames.height; y += 1) {
        const sourceOffset =
          ((row * asset.frames.height + y) * asset.width + column * asset.frames.width) * 4;
        asset.image.pixels.copy(
          pixels,
          y * asset.frames.width * 4,
          sourceOffset,
          sourceOffset + asset.frames.width * 4,
        );
      }
      frames.push(
        Object.freeze({
          assetId: asset.id,
          index,
          name: `${asset.id}/${String(index).padStart(3, '0')}`,
          width: asset.frames.width,
          height: asset.frames.height,
          pixels,
        }),
      );
    }
  }
  return frames;
}

function packFrames(frames, atlas) {
  const placements = [];
  let cursorX = atlas.padding;
  let cursorY = atlas.padding;
  let rowHeight = 0;
  let usedWidth = 0;
  let usedHeight = 0;
  for (const frame of frames) {
    const outerWidth = frame.width + atlas.extrude * 2;
    const outerHeight = frame.height + atlas.extrude * 2;
    if (outerWidth + atlas.padding * 2 > atlas.maxWidth) {
      throw new PipelineError('ATLAS_FRAME_WIDTH', `${frame.name} cannot fit atlas.maxWidth`);
    }
    if (cursorX + outerWidth + atlas.padding > atlas.maxWidth) {
      cursorX = atlas.padding;
      cursorY += rowHeight + atlas.padding;
      rowHeight = 0;
    }
    if (cursorY + outerHeight + atlas.padding > atlas.maxHeight) {
      throw new PipelineError('ATLAS_OVERFLOW', `${frame.name} exceeds atlas.maxHeight`);
    }
    const placement = Object.freeze({
      ...frame,
      x: cursorX + atlas.extrude,
      y: cursorY + atlas.extrude,
    });
    placements.push(placement);
    cursorX += outerWidth + atlas.padding;
    rowHeight = Math.max(rowHeight, outerHeight);
    usedWidth = Math.max(usedWidth, cursorX);
    usedHeight = Math.max(usedHeight, cursorY + outerHeight + atlas.padding);
  }
  return Object.freeze({
    width: nextPowerOfTwo(Math.max(1, usedWidth)),
    height: nextPowerOfTwo(Math.max(1, usedHeight)),
    placements,
  });
}

function blitPixel(target, targetWidth, x, y, source, sourceWidth, sourceX, sourceY) {
  const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
  const targetOffset = (y * targetWidth + x) * 4;
  source.copy(target, targetOffset, sourceOffset, sourceOffset + 4);
}

function renderAtlas(pack, atlas) {
  const pixels = Buffer.alloc(pack.width * pack.height * 4);
  for (const frame of pack.placements) {
    for (let y = -atlas.extrude; y < frame.height + atlas.extrude; y += 1) {
      for (let x = -atlas.extrude; x < frame.width + atlas.extrude; x += 1) {
        const sourceX = Math.max(0, Math.min(frame.width - 1, x));
        const sourceY = Math.max(0, Math.min(frame.height - 1, y));
        blitPixel(
          pixels,
          pack.width,
          frame.x + x,
          frame.y + y,
          frame.pixels,
          frame.width,
          sourceX,
          sourceY,
        );
      }
    }
  }
  return encodePngRgba(pack.width, pack.height, pixels);
}

function buildMetadata(manifest, pack, textureHash) {
  const frames = {};
  const assets = {};
  for (const placement of pack.placements) {
    frames[placement.name] = {
      assetId: placement.assetId,
      frameIndex: placement.index,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      rotated: false,
      trimmed: false,
    };
  }
  for (const asset of manifest.assets.slice().sort((a, b) => a.id.localeCompare(b.id))) {
    assets[asset.id] = {
      sheetWidth: asset.width,
      sheetHeight: asset.height,
      frameWidth: asset.frames.width,
      frameHeight: asset.frames.height,
      frameCount: asset.frames.count,
      columns: asset.frames.columns,
      frames: Array.from(
        { length: asset.frames.count },
        (_, index) => `${asset.id}/${String(index).padStart(3, '0')}`,
      ),
    };
  }
  return {
    schemaVersion: PIPELINE_VERSION,
    atlas: {
      id: manifest.atlas.id,
      image: `${manifest.atlas.id}.png`,
      width: pack.width,
      height: pack.height,
      format: 'RGBA8888',
      padding: manifest.atlas.padding,
      extrude: manifest.atlas.extrude,
      premultipliedAlpha: false,
    },
    assets,
    frames,
    integrity: { textureSha256: textureHash },
  };
}

function buildProvenance(manifest, manifestBuffer, assets, textureHash) {
  return {
    schemaVersion: PIPELINE_VERSION,
    atlasId: manifest.atlas.id,
    manifestSha256: sha256(manifestBuffer),
    textureSha256: textureHash,
    assets: assets.map((asset) => ({
      id: asset.id,
      sourceSha256: sha256(asset.sourceBytes),
      provenance: asset.provenance,
    })),
  };
}

function writeAtomically(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, contents);
  rmSync(path, { force: true });
  renameSync(temporary, path);
}

export function inspectAssetManifest(manifestPath) {
  const resolvedManifest = resolve(manifestPath);
  const manifest = readManifest(resolvedManifest);
  const assets = loadAssets(manifest, resolvedManifest);
  const decodedBytes = assets.reduce((sum, asset) => sum + asset.image.pixels.length, 0);
  if (decodedBytes > manifest.atlas.limits.maxDecodedBytes) {
    throw new PipelineError(
      'DECODED_SIZE',
      `decoded sources require ${decodedBytes} bytes; limit is ${manifest.atlas.limits.maxDecodedBytes}`,
    );
  }
  const pack = packFrames(splitFrames(assets), manifest.atlas);
  return Object.freeze({ manifest, assets, pack, manifestPath: resolvedManifest });
}

export function buildAtlas({ manifestPath, outputDirectory, provenancePath }) {
  if (!manifestPath || !outputDirectory || !provenancePath) {
    throw new PipelineError(
      'BUILD_ARGUMENTS',
      'build requires manifestPath, outputDirectory, and provenancePath',
    );
  }
  const resolvedOutput = resolve(outputDirectory);
  const resolvedProvenance = resolve(provenancePath);
  const runtimeRoot = resolve('client/public');
  if (pathIsInside(runtimeRoot, resolvedProvenance)) {
    throw new PipelineError(
      'PROVENANCE_RUNTIME_PATH',
      'provenance reports must stay outside client/public runtime redistribution',
    );
  }
  const inspection = inspectAssetManifest(manifestPath);
  const texture = renderAtlas(inspection.pack, inspection.manifest.atlas);
  if (texture.length > inspection.manifest.atlas.limits.maxAtlasBytes) {
    throw new PipelineError(
      'ATLAS_COMPRESSED_SIZE',
      `atlas is ${texture.length} bytes; limit is ${inspection.manifest.atlas.limits.maxAtlasBytes}`,
    );
  }
  const textureHash = sha256(texture);
  const metadata = stableJson(buildMetadata(inspection.manifest, inspection.pack, textureHash));
  const manifestBuffer = readFileSync(inspection.manifestPath);
  const provenance = stableJson(
    buildProvenance(inspection.manifest, manifestBuffer, inspection.assets, textureHash),
  );
  const texturePath = join(resolvedOutput, `${inspection.manifest.atlas.id}.png`);
  const metadataPath = join(resolvedOutput, `${inspection.manifest.atlas.id}.json`);
  try {
    writeAtomically(texturePath, texture);
    writeAtomically(metadataPath, metadata);
    writeAtomically(resolvedProvenance, provenance);
  } catch (error) {
    rmSync(`${texturePath}.tmp`, { force: true });
    rmSync(`${metadataPath}.tmp`, { force: true });
    rmSync(`${resolvedProvenance}.tmp`, { force: true });
    throw new PipelineError('OUTPUT_WRITE', error.message);
  }
  return Object.freeze({
    texturePath,
    metadataPath,
    provenancePath: resolvedProvenance,
    width: inspection.pack.width,
    height: inspection.pack.height,
    frameCount: inspection.pack.placements.length,
    textureBytes: texture.length,
    textureSha256: textureHash,
  });
}

function parseCli(argv) {
  const [command, ...rawTokens] = argv;
  const tokens = rawTokens.filter((token) => token !== '--');
  const options = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const token = tokens[index];
    const value = tokens[index + 1];
    if (!token?.startsWith('--') || value === undefined) {
      throw new PipelineError(
        'CLI_ARGUMENT',
        `expected --name value, received ${token ?? '<end>'}`,
      );
    }
    options[token.slice(2)] = value;
  }
  return { command, options };
}

function runCli() {
  const { command, options } = parseCli(process.argv.slice(2));
  if (command === 'validate') {
    if (!options.manifest) throw new PipelineError('CLI_ARGUMENT', 'validate requires --manifest');
    const result = inspectAssetManifest(options.manifest);
    process.stdout.write(
      `Validated ${result.manifest.atlas.id}: ${result.assets.length} assets, ${result.pack.placements.length} frames, ${result.pack.width}x${result.pack.height}\n`,
    );
    return;
  }
  if (command === 'build') {
    if (!options.manifest || !options.out || !options.provenance) {
      throw new PipelineError('CLI_ARGUMENT', 'build requires --manifest, --out, and --provenance');
    }
    const result = buildAtlas({
      manifestPath: options.manifest,
      outputDirectory: options.out,
      provenancePath: options.provenance,
    });
    process.stdout.write(
      `Built ${result.frameCount} frames at ${result.width}x${result.height}: ${result.textureSha256}\n`,
    );
    return;
  }
  throw new PipelineError('CLI_COMMAND', 'use validate or build');
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
