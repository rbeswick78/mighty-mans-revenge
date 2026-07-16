import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const OUT_DIR = resolve('art/reforged/sources/fighter-art-i');
const FRAME_SIZE = 64;
const COLUMNS = 4;
const SUPERSAMPLE = 2;
const DIRECTIONS = ['down', 'up', 'side', 'side-left'];

const COLORS = Object.freeze({
  ink: [8, 12, 18, 255],
  shadow: [5, 8, 13, 92],
  navy: [24, 35, 49, 255],
  navyLight: [48, 68, 88, 255],
  charcoal: [35, 35, 43, 255],
  charcoalLight: [70, 68, 79, 255],
  bone: [228, 220, 193, 255],
  steel: [111, 126, 138, 255],
  amber: [220, 117, 36, 255],
  amberHot: [255, 178, 77, 255],
  cyan: [93, 222, 231, 255],
  cyanHot: [208, 251, 255, 255],
  indigo: [52, 57, 107, 255],
  indigoLight: [91, 105, 167, 255],
  undead: [111, 98, 123, 255],
  undeadLight: [157, 138, 166, 255],
  ember: [242, 91, 35, 255],
  red: [232, 59, 59, 255],
});

const FIGHTERS = Object.freeze([
  { id: 'mighty-man', deathVariants: 3, frameCount: 100 },
  { id: 'bruce', deathVariants: 2, frameCount: 88 },
  { id: 'frost-wizard', deathVariants: 3, frameCount: 100 },
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
  const minX = Math.floor(cx - radiusX);
  const maxX = Math.ceil(cx + radiusX);
  const minY = Math.floor(cy - radiusY);
  const maxY = Math.ceil(cy + radiusY);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
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
      const start = Math.ceil(intersections[index]);
      const end = Math.floor(intersections[index + 1] ?? intersections[index]);
      for (let x = start; x <= end; x += 1) put(target, x, y, color);
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

function S(value) {
  return value * SUPERSAMPLE;
}

function ellipse(target, cx, cy, rx, ry, color) {
  fillEllipse(target, S(cx), S(cy), S(rx), S(ry), color);
}

function polygon(target, points, color) {
  fillPolygon(
    target,
    points.map(([x, y]) => [S(x), S(y)]),
    color,
  );
}

function stroke(target, x0, y0, x1, y1, color, thickness = 1) {
  line(target, S(x0), S(y0), S(x1), S(y1), color, S(thickness));
}

function downsample(source) {
  const target = surface(FRAME_SIZE, FRAME_SIZE);
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    for (let x = 0; x < FRAME_SIZE; x += 1) {
      const sums = [0, 0, 0, 0];
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const offset = ((y * SUPERSAMPLE + sy) * source.width + x * SUPERSAMPLE + sx) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            sums[channel] += source.pixels[offset + channel];
          }
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

function perpendicular(vector) {
  return { x: -vector.y, y: vector.x };
}

function phaseOffset(state, frame) {
  if (state === 'move') return [-2, 0, 2, 0][frame] ?? 0;
  if (state === 'idle') return frame === 1 ? 0.5 : 0;
  if (state === 'attack' || state === 'ability') return [0, -1, 1, 0][frame] ?? 0;
  return 0;
}

function drawMighty(target, direction, state, frame) {
  const v = directionVector(direction);
  const p = perpendicular(v);
  const stride = phaseOffset(state, frame);
  const recoil = state === 'damage' ? (frame === 0 ? -2 : -1) : 0;
  const cx = 32 + v.x * recoil;
  const cy = 34 + v.y * recoil;
  ellipse(target, cx, 53, 13, 4, COLORS.shadow);
  stroke(target, cx - 5 - p.x * stride, 43, cx - 7 + p.x * stride, 54, COLORS.ink, 7);
  stroke(target, cx + 5 + p.x * stride, 43, cx + 7 - p.x * stride, 54, COLORS.ink, 7);
  stroke(target, cx - 5 - p.x * stride, 43, cx - 7 + p.x * stride, 54, COLORS.navyLight, 3.5);
  stroke(target, cx + 5 + p.x * stride, 43, cx + 7 - p.x * stride, 54, COLORS.navyLight, 3.5);
  polygon(
    target,
    [
      [cx - 10, 28],
      [cx + 10, 28],
      [cx + 8, 45],
      [cx, 49],
      [cx - 8, 45],
    ],
    COLORS.ink,
  );
  polygon(
    target,
    [
      [cx - 7, 30],
      [cx + 7, 30],
      [cx + 6, 43],
      [cx, 46],
      [cx - 6, 43],
    ],
    COLORS.navy,
  );
  stroke(target, cx - 8, 32, cx - 13, 42, COLORS.ink, 6);
  stroke(target, cx + 8, 32, cx + 13, 42, COLORS.ink, 6);
  ellipse(target, cx, 24.5, 8.5, 8, COLORS.ink);
  ellipse(target, cx, 24.5, 6.2, 5.8, COLORS.bone);
  polygon(
    target,
    [
      [cx - 7, 27],
      [cx + 7, 27],
      [cx + 8, 31],
      [cx - 8, 31],
    ],
    COLORS.amber,
  );
  stroke(target, cx - 4, 23, cx + 4, 23, COLORS.ink, 2);
  stroke(target, cx - 3, 26, cx + 3, 26, COLORS.ink, 1.5);
  const action = state === 'attack' ? ([0, 2, -2, 0][frame] ?? 0) : 0;
  const weaponStart = { x: cx - p.x * 4 - v.x * 4, y: cy - p.y * 4 - v.y * 4 };
  const weaponEnd = {
    x: cx - p.x * 4 + v.x * (22 + action),
    y: cy - p.y * 4 + v.y * (22 + action),
  };
  stroke(target, weaponStart.x, weaponStart.y, weaponEnd.x, weaponEnd.y, COLORS.ink, 5);
  stroke(target, weaponStart.x, weaponStart.y, weaponEnd.x, weaponEnd.y, COLORS.steel, 2.2);
  stroke(
    target,
    weaponEnd.x,
    weaponEnd.y,
    weaponEnd.x + v.x * 5,
    weaponEnd.y + v.y * 5,
    COLORS.ink,
    2.5,
  );
  if (state === 'attack' && frame === 1) {
    polygon(
      target,
      [
        [weaponEnd.x + v.x * 3 - p.x * 4, weaponEnd.y + v.y * 3 - p.y * 4],
        [weaponEnd.x + v.x * 10, weaponEnd.y + v.y * 10],
        [weaponEnd.x + v.x * 3 + p.x * 4, weaponEnd.y + v.y * 3 + p.y * 4],
      ],
      COLORS.amberHot,
    );
  }
  if (state === 'ability') {
    const pulse = [0.45, 0.8, 1, 0.65][frame] ?? 0.7;
    stroke(target, cx, 31, cx, 43, [...COLORS.cyan, Math.round(255 * pulse)], 2);
    stroke(target, cx - 4, 34, cx + 4, 34, COLORS.cyanHot, 1.5);
    stroke(target, cx - 4, 38, cx + 4, 38, COLORS.cyanHot, 1.5);
    ellipse(target, cx + v.x * 13, cy + v.y * 13, 5 + frame, 3 + frame * 0.5, [93, 222, 231, 80]);
  }
  if (state === 'damage') drawImpact(target, cx, cy, direction, frame, COLORS.red);
}

function drawBruce(target, direction, state, frame) {
  const v = directionVector(direction);
  const p = perpendicular(v);
  const stride = phaseOffset(state, frame) * 0.8;
  const recoil = state === 'damage' ? (frame === 0 ? -2 : -1) : 0;
  const cx = 32 + v.x * recoil;
  const cy = 35 + v.y * recoil;
  ellipse(target, cx, 53, 14, 4.5, COLORS.shadow);
  stroke(target, cx - 6 - p.x * stride, 44, cx - 8 + p.x * stride, 54, COLORS.ink, 8);
  stroke(target, cx + 6 + p.x * stride, 44, cx + 8 - p.x * stride, 54, COLORS.ink, 8);
  stroke(target, cx - 6 - p.x * stride, 44, cx - 8 + p.x * stride, 54, COLORS.charcoalLight, 4);
  stroke(target, cx + 6 + p.x * stride, 44, cx + 8 - p.x * stride, 54, COLORS.charcoalLight, 4);
  ellipse(target, cx, 36, 13, 15, COLORS.ink);
  polygon(
    target,
    [
      [cx - 10, 27],
      [cx + 10, 27],
      [cx + 11, 42],
      [cx, 48],
      [cx - 11, 42],
    ],
    COLORS.charcoal,
  );
  const swing = state === 'attack' ? ([0, 4, 8, 3][frame] ?? 0) : 0;
  stroke(target, cx - 10, 31, cx - 16 - p.x * swing, 43 - v.y * swing, COLORS.ink, 8);
  stroke(target, cx + 10, 31, cx + 16 + p.x * swing, 43 + v.y * swing, COLORS.ink, 8);
  stroke(target, cx - 10, 31, cx - 16 - p.x * swing, 43 - v.y * swing, COLORS.undead, 4);
  stroke(target, cx + 10, 31, cx + 16 + p.x * swing, 43 + v.y * swing, COLORS.undead, 4);
  ellipse(target, cx - 16 - p.x * swing, 43 - v.y * swing, 4.5, 4.5, COLORS.ink);
  ellipse(target, cx + 16 + p.x * swing, 43 + v.y * swing, 4.5, 4.5, COLORS.ink);
  ellipse(target, cx, 23, 9.5, 8.5, COLORS.ink);
  ellipse(target, cx, 23.5, 7.4, 6.4, COLORS.undeadLight);
  polygon(
    target,
    [
      [cx - 7, 24],
      [cx + 7, 24],
      [cx + 5, 30],
      [cx - 5, 30],
    ],
    COLORS.undead,
  );
  stroke(target, cx - 4, 22, cx - 1, 22, COLORS.amberHot, 1.5);
  stroke(target, cx + 1, 22, cx + 4, 22, COLORS.amberHot, 1.5);
  stroke(target, cx - 3, 27, cx + 4, 27, COLORS.ink, 2);
  ellipse(target, cx, 32, 4, 5, COLORS.ember);
  if (state === 'ability') {
    const reach = [7, 16, 23, 12][frame] ?? 12;
    const mouth = { x: cx + v.x * 8, y: 23 + v.y * 6 };
    polygon(
      target,
      [
        [mouth.x - p.x * 2, mouth.y - p.y * 2],
        [mouth.x + v.x * reach - p.x * (4 + frame), mouth.y + v.y * reach - p.y * (4 + frame)],
        [mouth.x + v.x * (reach + 4), mouth.y + v.y * (reach + 4)],
        [mouth.x + v.x * reach + p.x * (4 + frame), mouth.y + v.y * reach + p.y * (4 + frame)],
        [mouth.x + p.x * 2, mouth.y + p.y * 2],
      ],
      frame === 1 || frame === 2 ? COLORS.amberHot : COLORS.ember,
    );
  }
  if (state === 'damage') drawImpact(target, cx, cy, direction, frame, COLORS.amberHot);
}

function drawFrost(target, direction, state, frame) {
  const v = directionVector(direction);
  const p = perpendicular(v);
  const stride = phaseOffset(state, frame) * 1.2;
  const recoil = state === 'damage' ? (frame === 0 ? -2 : -1) : 0;
  const cx = 32 + v.x * recoil;
  const cy = 35 + v.y * recoil;
  ellipse(target, cx, 53, 12, 4, [93, 222, 231, 38]);
  stroke(target, cx - 4 - p.x * stride, 42, cx - 6 + p.x * stride, 54, COLORS.ink, 6);
  stroke(target, cx + 4 + p.x * stride, 42, cx + 6 - p.x * stride, 54, COLORS.ink, 6);
  stroke(target, cx - 4 - p.x * stride, 42, cx - 6 + p.x * stride, 54, COLORS.indigoLight, 2.5);
  stroke(target, cx + 4 + p.x * stride, 42, cx + 6 - p.x * stride, 54, COLORS.indigoLight, 2.5);
  polygon(
    target,
    [
      [cx - 8, 28],
      [cx + 8, 28],
      [cx + 7, 43],
      [cx, 49],
      [cx - 7, 43],
    ],
    COLORS.ink,
  );
  polygon(
    target,
    [
      [cx - 5.5, 30],
      [cx + 5.5, 30],
      [cx + 5, 41],
      [cx, 46],
      [cx - 5, 41],
    ],
    COLORS.indigo,
  );
  stroke(target, cx - 7, 31, cx - 11, 42, COLORS.ink, 5);
  stroke(target, cx + 7, 31, cx + 11, 42, COLORS.ink, 5);
  polygon(
    target,
    [
      [cx, 14],
      [cx - 9, 27],
      [cx - 6, 33],
      [cx + 6, 33],
      [cx + 9, 27],
    ],
    COLORS.ink,
  );
  polygon(
    target,
    [
      [cx, 17],
      [cx - 6, 27],
      [cx - 4, 30],
      [cx + 4, 30],
      [cx + 6, 27],
    ],
    COLORS.indigoLight,
  );
  ellipse(target, cx, 27, 3.7, 3, COLORS.bone);
  const cast = state === 'attack' || state === 'ability' ? ([0, 2, 5, 1][frame] ?? 0) : 0;
  const hand = { x: cx + p.x * 8 + v.x * 2, y: cy + p.y * 8 + v.y * 2 };
  const tip = { x: hand.x + v.x * (14 + cast) + p.x * 4, y: hand.y + v.y * (14 + cast) + p.y * 4 };
  stroke(target, hand.x, hand.y, tip.x, tip.y, COLORS.ink, 3.5);
  stroke(target, hand.x, hand.y, tip.x, tip.y, COLORS.steel, 1.5);
  polygon(
    target,
    [
      [tip.x + v.x * 4, tip.y + v.y * 4],
      [tip.x - p.x * 3, tip.y - p.y * 3],
      [tip.x + p.x * 3, tip.y + p.y * 3],
    ],
    COLORS.cyanHot,
  );
  if (state === 'ability') {
    const radius = [8, 13, 17, 11][frame] ?? 10;
    for (let index = 0; index < 5; index += 1) {
      const angle = (Math.PI * 2 * index) / 5 + frame * 0.35;
      const px = cx + Math.cos(angle) * radius;
      const py = 45 + Math.sin(angle) * radius * 0.35;
      polygon(
        target,
        [
          [px, py - 4],
          [px + 2, py],
          [px, py + 4],
          [px - 2, py],
        ],
        COLORS.cyan,
      );
    }
    ellipse(target, cx, 50, 14 + frame * 2, 4 + frame * 0.5, [93, 222, 231, 52]);
  }
  if (state === 'damage') drawImpact(target, cx, cy, direction, frame, COLORS.cyanHot);
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

function drawDeath(target, fighterId, direction, variant, frame) {
  const progress = frame / 5;
  const facing = direction === 'side' ? 1 : -1;
  const settle = variant === 1 ? -1 : variant === 2 ? 2 : 0;
  const cx = 32 + settle * progress;
  const y = 50 - (1 - progress) * 10;
  ellipse(target, cx, 55, 18 + progress * 5, 4, COLORS.shadow);
  if (progress < 0.45) {
    const stateFrame = Math.min(1, Math.floor(progress * 4));
    if (fighterId === 'mighty-man') drawMighty(target, direction, 'damage', stateFrame);
    else if (fighterId === 'bruce') drawBruce(target, direction, 'damage', stateFrame);
    else drawFrost(target, direction, 'damage', stateFrame);
    return;
  }
  const bodyColor =
    fighterId === 'bruce'
      ? COLORS.charcoal
      : fighterId === 'frost-wizard'
        ? COLORS.indigo
        : COLORS.navy;
  const localColor =
    fighterId === 'bruce'
      ? COLORS.undead
      : fighterId === 'frost-wizard'
        ? COLORS.indigoLight
        : COLORS.navyLight;
  stroke(target, cx - facing * 10, y, cx + facing * (8 + progress * 8), y + 2, COLORS.ink, 13);
  stroke(target, cx - facing * 9, y, cx + facing * (7 + progress * 7), y + 2, bodyColor, 8);
  ellipse(
    target,
    cx - facing * (12 + progress * 3),
    y,
    fighterId === 'bruce' ? 8 : 7,
    fighterId === 'bruce' ? 7 : 6,
    COLORS.ink,
  );
  ellipse(
    target,
    cx - facing * (12 + progress * 3),
    y,
    fighterId === 'bruce' ? 6 : 5,
    fighterId === 'bruce' ? 5 : 4,
    fighterId === 'bruce' ? COLORS.undead : COLORS.bone,
  );
  stroke(
    target,
    cx + facing * 6,
    y + 1,
    cx + facing * 17,
    y + (variant === 1 ? -4 : 5),
    COLORS.ink,
    6,
  );
  stroke(
    target,
    cx + facing * 6,
    y + 1,
    cx + facing * 17,
    y + (variant === 1 ? -4 : 5),
    localColor,
    3,
  );
  if (fighterId === 'mighty-man') {
    stroke(target, cx - facing * 4, y - 2, cx + facing * 21, y - 2, COLORS.ink, 4);
    stroke(target, cx - facing * 4, y - 2, cx + facing * 21, y - 2, COLORS.steel, 1.8);
    stroke(target, cx - facing * 13, y - 4, cx - facing * 7, y - 4, COLORS.amber, 2);
  } else if (fighterId === 'frost-wizard') {
    polygon(
      target,
      [
        [cx - facing * 14, y - 7],
        [cx - facing * 20, y],
        [cx - facing * 12, y + 2],
      ],
      COLORS.indigoLight,
    );
    stroke(target, cx, y - 3, cx + facing * 18, y - 7, COLORS.steel, 2);
    polygon(
      target,
      [
        [cx + facing * 22, y - 8],
        [cx + facing * 18, y - 10],
        [cx + facing * 18, y - 4],
      ],
      COLORS.cyan,
    );
  } else {
    ellipse(target, cx - facing * 12, y + 3, 4, 3, COLORS.ember);
  }
}

function drawFrame(fighterId, state, direction, frame, variant = 0) {
  const target = scaledFrame();
  if (state === 'death') drawDeath(target, fighterId, direction, variant, frame);
  else if (fighterId === 'mighty-man') drawMighty(target, direction, state, frame);
  else if (fighterId === 'bruce') drawBruce(target, direction, state, frame);
  else drawFrost(target, direction, state, frame);
  return downsample(target);
}

function stateFrames(fighter) {
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
        frames.push(drawFrame(fighter.id, state, direction, frame));
      }
    }
  }
  for (let variant = 0; variant < fighter.deathVariants; variant += 1) {
    for (const direction of ['side', 'side-left']) {
      for (let frame = 0; frame < 6; frame += 1) {
        frames.push(drawFrame(fighter.id, 'death', direction, frame, variant));
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

for (const fighter of FIGHTERS) {
  const frames = stateFrames(fighter);
  if (frames.length !== fighter.frameCount) {
    throw new Error(
      `${fighter.id}: expected ${fighter.frameCount} frames, received ${frames.length}`,
    );
  }
  const path = resolve(OUT_DIR, `${fighter.id}-states.png`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(composeSheet(frames)));
}

process.stdout.write(`Generated deterministic Fighter Art I sources in ${OUT_DIR}\n`);
