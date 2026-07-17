import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const OUT_DIR = resolve('art/reforged/sources/fighter-art-ii');
const FRAME_SIZE = 64;
const COLUMNS = 4;
const SUPERSAMPLE = 2;
const DIRECTIONS = ['down', 'up', 'side', 'side-left'];

const COLORS = Object.freeze({
  ink: [8, 12, 18, 255],
  shadow: [5, 8, 13, 86],
  navy: [24, 35, 49, 255],
  navyLight: [48, 68, 88, 255],
  steel: [91, 112, 132, 255],
  steelBlue: [77, 155, 214, 255],
  steelBlueHot: [175, 225, 255, 255],
  undead: [102, 107, 93, 255],
  undeadLight: [148, 151, 127, 255],
  rust: [151, 58, 42, 255],
  rustLight: [205, 84, 55, 255],
  rustTrail: [224, 93, 65, 190],
  green: [72, 92, 68, 255],
  greenLight: [112, 133, 91, 255],
  olive: [88, 91, 67, 255],
  bone: [228, 220, 193, 255],
  lens: [116, 214, 204, 255],
  lensHot: [210, 255, 244, 255],
  teal: [62, 162, 157, 255],
  tealHot: [133, 231, 217, 255],
  red: [232, 59, 59, 255],
});

const ASSETS = Object.freeze([
  { id: 'bubba', file: 'bubba-states.png', deathVariants: 2, frameCount: 88 },
  {
    id: 'jack-axe-absent',
    file: 'jack-axe-absent-states.png',
    deathVariants: 2,
    frameCount: 88,
  },
  {
    id: 'jack-axe-present',
    file: 'jack-axe-present-states.png',
    deathVariants: 1,
    frameCount: 76,
  },
  { id: 'rook-body', file: 'rook-body-states.png', deathVariants: 1, frameCount: 76 },
  { id: 'rook-helmet', file: 'rook-helmet-states.png', deathVariants: 1, frameCount: 76 },
]);

function surface(width, height) {
  return { width, height, pixels: Buffer.alloc(width * height * 4) };
}

function put(target, x, y, color) {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return;
  const offset = (y * target.width + x) * 4;
  const sourceAlpha = color[3] / 255;
  const destAlpha = target.pixels[offset + 3] / 255;
  const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
  if (outAlpha <= 0) return;
  for (let channel = 0; channel < 3; channel += 1) {
    target.pixels[offset + channel] = Math.round(
      (color[channel] * sourceAlpha +
        target.pixels[offset + channel] * destAlpha * (1 - sourceAlpha)) /
        outAlpha,
    );
  }
  target.pixels[offset + 3] = Math.round(outAlpha * 255);
}

function fillRect(target, x, y, width, height, color) {
  for (let py = Math.floor(y); py < Math.ceil(y + height); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + width); px += 1) put(target, px, py, color);
  }
}

function fillEllipse(target, cx, cy, radiusX, radiusY, color) {
  for (let y = Math.floor(cy - radiusY); y <= Math.ceil(cy + radiusY); y += 1) {
    for (let x = Math.floor(cx - radiusX); x <= Math.ceil(cx + radiusX); x += 1) {
      const nx = (x - cx) / radiusX;
      const ny = (y - cy) / radiusY;
      if (nx * nx + ny * ny <= 1) put(target, x, y, color);
    }
  }
}

function fillPolygon(target, points, color) {
  const minY = Math.floor(Math.min(...points.map((point) => point[1])));
  const maxY = Math.ceil(Math.max(...points.map((point) => point[1])));
  for (let y = minY; y <= maxY; y += 1) {
    const intersections = [];
    for (let index = 0; index < points.length; index += 1) {
      const [x1, y1] = points[index];
      const [x2, y2] = points[(index + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        intersections.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let index = 0; index < intersections.length; index += 2) {
      for (
        let x = Math.ceil(intersections[index]);
        x <= Math.floor(intersections[index + 1] ?? intersections[index]);
        x += 1
      ) {
        put(target, x, y, color);
      }
    }
  }
}

function line(target, x0, y0, x1, y1, color, thickness = 1) {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const endX = Math.round(x1);
  const endY = Math.round(y1);
  const dx = Math.abs(endX - x);
  const sx = x < endX ? 1 : -1;
  const dy = -Math.abs(endY - y);
  const sy = y < endY ? 1 : -1;
  let error = dx + dy;
  while (true) {
    const half = Math.floor(thickness / 2);
    fillRect(target, x - half, y - half, thickness, thickness, color);
    if (x === endX && y === endY) break;
    const e2 = error * 2;
    if (e2 >= dy) {
      error += dy;
      x += sx;
    }
    if (e2 <= dx) {
      error += dx;
      y += sy;
    }
  }
}

function scaledFrame() {
  return surface(FRAME_SIZE * SUPERSAMPLE, FRAME_SIZE * SUPERSAMPLE);
}

const S = (value) => value * SUPERSAMPLE;
const ellipse = (target, cx, cy, rx, ry, color) =>
  fillEllipse(target, S(cx), S(cy), S(rx), S(ry), color);
const polygon = (target, points, color) =>
  fillPolygon(
    target,
    points.map(([x, y]) => [S(x), S(y)]),
    color,
  );
const stroke = (target, x0, y0, x1, y1, color, thickness = 1) =>
  line(target, S(x0), S(y0), S(x1), S(y1), color, S(thickness));

function downsample(source) {
  const target = surface(FRAME_SIZE, FRAME_SIZE);
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    for (let x = 0; x < FRAME_SIZE; x += 1) {
      const sums = [0, 0, 0, 0];
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const offset = ((y * SUPERSAMPLE + sy) * source.width + x * SUPERSAMPLE + sx) * 4;
          for (let channel = 0; channel < 4; channel += 1)
            sums[channel] += source.pixels[offset + channel];
        }
      }
      const dest = (y * FRAME_SIZE + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        target.pixels[dest + channel] = Math.round(sums[channel] / SUPERSAMPLE ** 2);
      }
    }
  }
  return target;
}

function directionVector(direction) {
  if (direction === 'up') return { x: 0, y: -1 };
  if (direction === 'side') return { x: 1, y: 0 };
  if (direction === 'side-left') return { x: -1, y: 0 };
  return { x: 0, y: 1 };
}

const perpendicular = (vector) => ({ x: -vector.y, y: vector.x });

function phaseOffset(state, frame) {
  if (state === 'move') return [-2, 0, 2, 0][frame] ?? 0;
  if (state === 'idle') return frame === 1 ? 0.5 : 0;
  if (state === 'attack' || state === 'ability') return [0, -1, 1, 0][frame] ?? 0;
  return 0;
}

function drawImpact(target, cx, cy, direction, frame, color) {
  const v = directionVector(direction);
  const p = perpendicular(v);
  const hit = { x: cx - v.x * 11 + p.x * 5, y: cy - v.y * 11 + p.y * 5 };
  const reach = frame === 0 ? 7 : 4;
  for (const spread of [-1, 0, 1]) {
    stroke(
      target,
      hit.x,
      hit.y,
      hit.x - v.x * reach + p.x * spread * 3,
      hit.y - v.y * reach + p.y * spread * 3,
      color,
      1.5,
    );
  }
}

function drawBubba(target, direction, state, frame) {
  const v = directionVector(direction);
  const p = perpendicular(v);
  const stride = phaseOffset(state, frame) * 0.65;
  const recoil = state === 'damage' ? (frame === 0 ? -2 : -1) : 0;
  const cx = 32 + v.x * recoil;
  const cy = 34 + v.y * recoil;
  ellipse(target, cx, 56, 20, 5, COLORS.shadow);
  stroke(target, cx - 9 - p.x * stride, 43, cx - 12 + p.x * stride, 58, COLORS.ink, 11);
  stroke(target, cx + 9 + p.x * stride, 43, cx + 12 - p.x * stride, 58, COLORS.ink, 11);
  stroke(target, cx - 9 - p.x * stride, 43, cx - 12 + p.x * stride, 58, COLORS.navyLight, 5.5);
  stroke(target, cx + 9 + p.x * stride, 43, cx + 12 - p.x * stride, 58, COLORS.navyLight, 5.5);
  ellipse(target, cx, 36, 20, 18, COLORS.ink);
  polygon(
    target,
    [
      [cx - 15, 26],
      [cx + 15, 26],
      [cx + 17, 43],
      [cx + 9, 51],
      [cx - 9, 51],
      [cx - 17, 43],
    ],
    COLORS.navy,
  );
  stroke(target, cx - 8, 28, cx - 7, 49, COLORS.steel, 3);
  stroke(target, cx + 8, 28, cx + 7, 49, COLORS.steel, 3);
  const swing = state === 'attack' ? ([0, 2, 3, 1][frame] ?? 0) : 0;
  stroke(target, cx - 15, 29, cx - 22 - p.x * swing, 48 - v.y * swing, COLORS.ink, 12);
  stroke(target, cx + 15, 29, cx + 22 + p.x * swing, 48 + v.y * swing, COLORS.ink, 12);
  stroke(target, cx - 15, 29, cx - 22 - p.x * swing, 48 - v.y * swing, COLORS.undead, 6);
  stroke(target, cx + 15, 29, cx + 22 + p.x * swing, 48 + v.y * swing, COLORS.undead, 6);
  ellipse(target, cx - 22 - p.x * swing, 48 - v.y * swing, 5, 5, COLORS.ink);
  ellipse(target, cx + 22 + p.x * swing, 48 + v.y * swing, 5, 5, COLORS.ink);
  ellipse(target, cx, 19, 10, 9, COLORS.ink);
  ellipse(target, cx, 19.5, 7.3, 6.3, COLORS.undeadLight);
  stroke(target, cx - 5, 19, cx - 1, 19, COLORS.bone, 1.5);
  stroke(target, cx + 1, 19, cx + 5, 19, COLORS.bone, 1.5);
  for (const side of [-1, 1]) {
    polygon(
      target,
      [
        [cx + side * 11, 27],
        [cx + side * 20, 31],
        [cx + side * 18, 39],
        [cx + side * 10, 36],
      ],
      state === 'ability' ? COLORS.steelBlue : COLORS.steel,
    );
  }
  if (state === 'ability') {
    const pulse = [0.35, 0.7, 1, 0.55][frame] ?? 0.5;
    polygon(
      target,
      [
        [cx - 16, 29],
        [cx, 25],
        [cx + 16, 29],
        [cx + 14, 47],
        [cx, 52],
        [cx - 14, 47],
      ],
      [77, 155, 214, Math.round(90 * pulse)],
    );
    stroke(target, cx - 13, 33, cx + 13, 33, COLORS.steelBlueHot, 2);
  }
  if (state === 'damage') drawImpact(target, cx, cy, direction, frame, COLORS.steelBlueHot);
}

function drawJack(target, direction, state, frame, axeless) {
  const v = directionVector(direction);
  const p = perpendicular(v);
  const stride = phaseOffset(state, frame) * 1.25;
  const recoil = state === 'damage' ? (frame === 0 ? -2 : -1) : 0;
  const cx = 32 + v.x * recoil;
  const cy = 35 + v.y * recoil;
  ellipse(target, cx, 55, 13, 4, COLORS.shadow);
  stroke(target, cx - 5 - p.x * stride, 42, cx - 8 + p.x * stride, 56, COLORS.ink, 6);
  stroke(target, cx + 5 + p.x * stride, 42, cx + 8 - p.x * stride, 56, COLORS.ink, 6);
  stroke(target, cx - 5 - p.x * stride, 42, cx - 8 + p.x * stride, 56, COLORS.navyLight, 2.6);
  stroke(target, cx + 5 + p.x * stride, 42, cx + 8 - p.x * stride, 56, COLORS.navyLight, 2.6);
  polygon(
    target,
    [
      [cx - 9, 27],
      [cx + 8, 29],
      [cx + 6, 48],
      [cx + 1, 44],
      [cx - 4, 51],
      [cx - 8, 42],
    ],
    COLORS.ink,
  );
  polygon(
    target,
    [
      [cx - 6, 29],
      [cx + 5, 31],
      [cx + 4, 44],
      [cx, 42],
      [cx - 3, 47],
      [cx - 5, 40],
    ],
    COLORS.rust,
  );
  stroke(target, cx - 7, 31, cx - 12, 43, COLORS.ink, 5);
  stroke(target, cx + 7, 32, cx + 12, 41, COLORS.ink, 5);
  stroke(target, cx - 7, 31, cx - 12, 43, COLORS.undead, 2.2);
  stroke(target, cx + 7, 32, cx + 12, 41, COLORS.undead, 2.2);
  ellipse(target, cx, 23, 7, 8, COLORS.ink);
  ellipse(target, cx - 1, 23, 4.8, 5.8, COLORS.undeadLight);
  polygon(
    target,
    [
      [cx - 6, 18],
      [cx + 5, 16],
      [cx + 3, 21],
    ],
    COLORS.navy,
  );
  stroke(target, cx - 4, 23, cx + 2, 23, COLORS.ink, 1.5);
  const action = state === 'attack' ? ([0, 2, 4, 1][frame] ?? 0) : 0;
  if (!axeless) {
    const hand = { x: cx + p.x * 7 - v.x * 2, y: cy + p.y * 7 - v.y * 2 };
    const tip = {
      x: hand.x + v.x * (17 + action) - p.x * 5,
      y: hand.y + v.y * (17 + action) - p.y * 5,
    };
    stroke(target, hand.x, hand.y, tip.x, tip.y, COLORS.ink, 4.5);
    stroke(target, hand.x, hand.y, tip.x, tip.y, COLORS.bone, 1.8);
    polygon(
      target,
      [
        [tip.x + v.x * 3 - p.x * 7, tip.y + v.y * 3 - p.y * 7],
        [tip.x + v.x * 7, tip.y + v.y * 7],
        [tip.x + v.x * 3 + p.x * 7, tip.y + v.y * 3 + p.y * 7],
      ],
      COLORS.steel,
    );
  } else {
    ellipse(target, cx + p.x * 12, 41 + p.y * 4, 3.5, 3.5, COLORS.undeadLight);
  }
  if (state === 'ability') {
    const reach = [8, 17, 25, 14][frame] ?? 12;
    const start = { x: cx + v.x * 8, y: cy + v.y * 8 };
    stroke(
      target,
      start.x,
      start.y,
      start.x + v.x * reach,
      start.y + v.y * reach,
      COLORS.rustTrail,
      2 + frame * 0.3,
    );
    for (const offset of [-4, 4]) {
      stroke(
        target,
        start.x + v.x * reach - p.x * offset,
        start.y + v.y * reach - p.y * offset,
        start.x + v.x * (reach + 5),
        start.y + v.y * (reach + 5),
        COLORS.rustLight,
        1.5,
      );
    }
  }
  if (state === 'damage') drawImpact(target, cx, cy, direction, frame, COLORS.rustLight);
}

function rookPose(direction, state, frame) {
  const v = directionVector(direction);
  const p = perpendicular(v);
  const stride = phaseOffset(state, frame) * 1.15;
  const recoil = state === 'damage' ? (frame === 0 ? -2 : -1) : 0;
  return { v, p, stride, cx: 32 + v.x * recoil, cy: 35 + v.y * recoil };
}

function drawRookBody(target, direction, state, frame) {
  const { v, p, stride, cx, cy } = rookPose(direction, state, frame);
  ellipse(target, cx - v.x * 2, 55, 13, 4, COLORS.shadow);
  stroke(target, cx - 5 - p.x * stride, 42, cx - 7 + p.x * stride - v.x * 2, 56, COLORS.ink, 6.5);
  stroke(target, cx + 5 + p.x * stride, 42, cx + 7 - p.x * stride - v.x * 2, 56, COLORS.ink, 6.5);
  stroke(target, cx - 5 - p.x * stride, 42, cx - 7 + p.x * stride - v.x * 2, 56, COLORS.olive, 3);
  stroke(target, cx + 5 + p.x * stride, 42, cx + 7 - p.x * stride - v.x * 2, 56, COLORS.olive, 3);
  polygon(
    target,
    [
      [cx - 9, 28],
      [cx + 9, 28],
      [cx + 8, 44],
      [cx + 2, 49],
      [cx - 8, 44],
    ],
    COLORS.ink,
  );
  polygon(
    target,
    [
      [cx - 6, 30],
      [cx + 6, 30],
      [cx + 5, 42],
      [cx + 1, 46],
      [cx - 5, 42],
    ],
    COLORS.navyLight,
  );
  stroke(target, cx - 8, 31, cx - 12, 41, COLORS.ink, 5);
  stroke(target, cx + 8, 31, cx + 12, 41, COLORS.ink, 5);
  const action = state === 'attack' ? ([0, 2, -2, 0][frame] ?? 0) : 0;
  const weaponStart = { x: cx - p.x * 4 - v.x * 3, y: cy - p.y * 4 - v.y * 3 };
  const weaponEnd = {
    x: cx - p.x * 4 + v.x * (19 + action),
    y: cy - p.y * 4 + v.y * (19 + action),
  };
  stroke(target, weaponStart.x, weaponStart.y, weaponEnd.x, weaponEnd.y, COLORS.ink, 5);
  stroke(target, weaponStart.x, weaponStart.y, weaponEnd.x, weaponEnd.y, COLORS.steel, 2.2);
  if (state === 'attack' && frame === 1) {
    polygon(
      target,
      [
        [weaponEnd.x + v.x * 2 - p.x * 3, weaponEnd.y + v.y * 2 - p.y * 3],
        [weaponEnd.x + v.x * 8, weaponEnd.y + v.y * 8],
        [weaponEnd.x + v.x * 2 + p.x * 3, weaponEnd.y + v.y * 2 + p.y * 3],
      ],
      COLORS.bone,
    );
  }
  if (state === 'ability') {
    const reach = [7, 14, 23, 12][frame] ?? 10;
    ellipse(
      target,
      cx - v.x * reach * 0.4,
      53 - v.y * reach * 0.25,
      13 + reach * 0.25,
      3,
      [62, 162, 157, 70],
    );
    for (const offset of [-5, 5]) {
      const px = cx - v.x * (10 + frame * 3) + p.x * offset;
      const py = cy - v.y * (10 + frame * 3) + p.y * offset;
      stroke(target, px - v.x * 4 - p.x * 3, py - v.y * 4 - p.y * 3, px, py, COLORS.teal, 2);
      stroke(target, px - v.x * 4 + p.x * 3, py - v.y * 4 + p.y * 3, px, py, COLORS.tealHot, 1.5);
    }
  }
  if (state === 'damage') drawImpact(target, cx, cy, direction, frame, COLORS.tealHot);
}

function drawRookHelmet(target, direction, state, frame) {
  const { v, cx } = rookPose(direction, state, frame);
  const actionShift = state === 'attack' ? ([0, -1, 1, 0][frame] ?? 0) : 0;
  const cy = 23 + v.y * actionShift;
  ellipse(target, cx, cy, 8.5, 9, COLORS.ink);
  ellipse(target, cx, cy, 6.5, 7, COLORS.green);
  stroke(target, cx, cy - 7, cx + v.x * 2, cy - 11 + v.y * 2, COLORS.ink, 3);
  stroke(target, cx, cy - 7, cx + v.x * 2, cy - 10 + v.y * 2, COLORS.greenLight, 1.2);
  if (direction === 'up') {
    stroke(target, cx - 5, cy, cx + 5, cy, COLORS.greenLight, 1.5);
  } else if (direction === 'down') {
    ellipse(target, cx - 3, cy + 1, 2.4, 2.4, COLORS.ink);
    ellipse(target, cx + 3, cy + 1, 2.4, 2.4, COLORS.ink);
    ellipse(target, cx - 3, cy + 1, 1.3, 1.3, COLORS.lensHot);
    ellipse(target, cx + 3, cy + 1, 1.3, 1.3, COLORS.lens);
  } else {
    const facing = direction === 'side' ? 1 : -1;
    ellipse(target, cx + facing * 4, cy + 1, 2.7, 2.7, COLORS.ink);
    ellipse(target, cx + facing * 4, cy + 1, 1.5, 1.5, COLORS.lensHot);
    stroke(target, cx - facing * 5, cy, cx - facing * 7, cy + 3, COLORS.greenLight, 2);
  }
  if (state === 'ability') {
    stroke(target, cx - 7, cy + 5, cx + 7, cy + 5, COLORS.teal, 1.5);
  }
}

function drawDeath(target, assetId, direction, variant, frame) {
  const progress = frame / 5;
  const facing = direction === 'side' ? 1 : -1;
  const settle = variant === 1 ? 2 : 0;
  const cx = 32 + settle * progress;
  const y = 51 - (1 - progress) * 9;
  if (assetId === 'rook-helmet') {
    const headX = progress < 0.45 ? cx - facing * 1 : cx - facing * (12 + progress * 3);
    const headY = progress < 0.45 ? y - 18 : y - 2;
    ellipse(target, headX, headY, 8, 7, COLORS.ink);
    ellipse(target, headX, headY, 6, 5, COLORS.green);
    ellipse(target, headX + facing * 3, headY, 1.7, 1.7, COLORS.lensHot);
    stroke(target, headX, headY - 5, headX - facing * 1, headY - 9, COLORS.greenLight, 2);
    return;
  }
  ellipse(target, cx, 56, assetId === 'bubba' ? 25 : 19, 4, COLORS.shadow);
  if (progress < 0.45) {
    const stateFrame = Math.min(1, Math.floor(progress * 4));
    if (assetId === 'bubba') drawBubba(target, direction, 'damage', stateFrame);
    else if (assetId.startsWith('jack')) {
      drawJack(target, direction, 'damage', stateFrame, assetId === 'jack-axe-absent');
    } else drawRookBody(target, direction, 'damage', stateFrame);
    return;
  }
  const isBubba = assetId === 'bubba';
  const isJack = assetId.startsWith('jack');
  const bodyColor = isBubba ? COLORS.navy : isJack ? COLORS.rust : COLORS.navyLight;
  const bodyThickness = isBubba ? 19 : 12;
  stroke(
    target,
    cx - facing * 10,
    y,
    cx + facing * (9 + progress * 9),
    y + 2,
    COLORS.ink,
    bodyThickness,
  );
  stroke(
    target,
    cx - facing * 9,
    y,
    cx + facing * (8 + progress * 8),
    y + 2,
    bodyColor,
    bodyThickness - 6,
  );
  ellipse(
    target,
    cx - facing * (12 + progress * 3),
    y - 1,
    isBubba ? 10 : 7,
    isBubba ? 8 : 6,
    COLORS.ink,
  );
  ellipse(
    target,
    cx - facing * (12 + progress * 3),
    y - 1,
    isBubba ? 7 : 5,
    isBubba ? 5 : 4,
    isJack || isBubba ? COLORS.undeadLight : COLORS.bone,
  );
  stroke(
    target,
    cx + facing * 5,
    y + 1,
    cx + facing * 18,
    y + (variant === 1 ? 5 : -4),
    COLORS.ink,
    isBubba ? 9 : 6,
  );
  stroke(
    target,
    cx + facing * 5,
    y + 1,
    cx + facing * 18,
    y + (variant === 1 ? 5 : -4),
    bodyColor,
    isBubba ? 4 : 3,
  );
  if (assetId === 'jack-axe-present') {
    stroke(target, cx - facing * 2, y - 3, cx + facing * 24, y - 5, COLORS.ink, 4);
    stroke(target, cx - facing * 2, y - 3, cx + facing * 24, y - 5, COLORS.bone, 1.5);
    polygon(
      target,
      [
        [cx + facing * 22, y - 11],
        [cx + facing * 29, y - 6],
        [cx + facing * 22, y],
      ],
      COLORS.steel,
    );
  }
  if (assetId === 'rook-body') {
    stroke(target, cx - facing * 1, y - 5, cx + facing * 22, y - 6, COLORS.ink, 5);
    stroke(target, cx - facing * 1, y - 5, cx + facing * 22, y - 6, COLORS.steel, 2);
  }
}

function drawFrame(assetId, state, direction, frame, variant = 0) {
  const target = scaledFrame();
  if (state === 'death') drawDeath(target, assetId, direction, variant, frame);
  else if (assetId === 'bubba') drawBubba(target, direction, state, frame);
  else if (assetId === 'jack-axe-present') drawJack(target, direction, state, frame, false);
  else if (assetId === 'jack-axe-absent') drawJack(target, direction, state, frame, true);
  else if (assetId === 'rook-body') drawRookBody(target, direction, state, frame);
  else drawRookHelmet(target, direction, state, frame);
  return downsample(target);
}

function stateFrames(asset) {
  const frames = [];
  for (const [state, count] of [
    ['idle', 2],
    ['move', 4],
    ['attack', 4],
    ['ability', 4],
    ['damage', 2],
  ]) {
    for (const direction of DIRECTIONS) {
      for (let frame = 0; frame < count; frame += 1) {
        frames.push(drawFrame(asset.id, state, direction, frame));
      }
    }
  }
  for (let variant = 0; variant < asset.deathVariants; variant += 1) {
    for (const direction of ['side', 'side-left']) {
      for (let frame = 0; frame < 6; frame += 1) {
        frames.push(drawFrame(asset.id, 'death', direction, frame, variant));
      }
    }
  }
  return frames;
}

function composeSheet(frames) {
  const rows = frames.length / COLUMNS;
  const target = surface(FRAME_SIZE * COLUMNS, FRAME_SIZE * rows);
  frames.forEach((frame, index) => {
    const ox = (index % COLUMNS) * FRAME_SIZE;
    const oy = Math.floor(index / COLUMNS) * FRAME_SIZE;
    for (let y = 0; y < FRAME_SIZE; y += 1) {
      const sourceStart = y * FRAME_SIZE * 4;
      const targetStart = ((oy + y) * target.width + ox) * 4;
      frame.pixels.copy(target.pixels, targetStart, sourceStart, sourceStart + FRAME_SIZE * 4);
    }
  });
  return target;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function encodePng(target) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(target.width, 0);
  header.writeUInt32BE(target.height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc((target.width * 4 + 1) * target.height);
  for (let y = 0; y < target.height; y += 1) {
    const rowOffset = y * (target.width * 4 + 1);
    scanlines[rowOffset] = 0;
    target.pixels.copy(scanlines, rowOffset + 1, y * target.width * 4, (y + 1) * target.width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const asset of ASSETS) {
  const frames = stateFrames(asset);
  if (frames.length !== asset.frameCount) {
    throw new Error(`${asset.id}: expected ${asset.frameCount} frames, received ${frames.length}`);
  }
  const path = resolve(OUT_DIR, asset.file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(composeSheet(frames)));
}

process.stdout.write(`Generated deterministic Fighter Art II sources in ${OUT_DIR}\n`);
