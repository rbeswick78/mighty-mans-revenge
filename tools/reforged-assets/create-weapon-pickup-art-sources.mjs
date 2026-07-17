import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { encodePngRgba } from './asset-pipeline.mjs';

const OUT_DIR = resolve('art/reforged/sources/weapon-pickup-art');
const FRAME_SIZE = 64;
const GUN_COLUMNS = 4;
const SUPERSAMPLE = 2;
const DIRECTIONS = ['down', 'up', 'side', 'side-left'];

const COLORS = Object.freeze({
  transparent: [0, 0, 0, 0],
  ink: [8, 12, 18, 255],
  shadow: [5, 8, 13, 72],
  navy: [24, 35, 49, 255],
  raised: [48, 72, 93, 255],
  steel: [91, 112, 132, 255],
  steelLight: [158, 177, 187, 255],
  bone: [228, 220, 193, 255],
  rust: [151, 58, 42, 255],
  rustLight: [205, 84, 55, 255],
  teal: [62, 162, 157, 255],
  tealHot: [114, 214, 201, 255],
  amber: [247, 150, 23, 255],
  green: [145, 219, 105, 255],
  blue: [77, 155, 230, 255],
  purple: [168, 132, 243, 255],
  red: [232, 59, 59, 255],
  common: [155, 171, 178, 255],
  white: [243, 240, 223, 255],
});

const GUNS = Object.freeze([
  {
    id: 'rifle',
    length: 38,
    receiver: 18,
    width: 7,
    barrel: 3,
    stock: 8,
    magazine: 8,
    scope: false,
    tube: false,
    accent: COLORS.teal,
  },
  {
    id: 'pistol',
    length: 22,
    receiver: 11,
    width: 7,
    barrel: 3,
    stock: 2,
    magazine: 7,
    scope: false,
    tube: false,
    accent: COLORS.amber,
  },
  {
    id: 'shotgun',
    length: 42,
    receiver: 15,
    width: 9,
    barrel: 6,
    stock: 8,
    magazine: 4,
    scope: false,
    tube: false,
    accent: COLORS.rustLight,
  },
  {
    id: 'smg',
    length: 29,
    receiver: 15,
    width: 9,
    barrel: 3,
    stock: 4,
    magazine: 12,
    scope: false,
    tube: false,
    accent: COLORS.tealHot,
  },
  {
    id: 'sniper-rifle',
    length: 52,
    receiver: 17,
    width: 6,
    barrel: 2,
    stock: 10,
    magazine: 5,
    scope: true,
    tube: false,
    accent: COLORS.blue,
  },
  {
    id: 'launcher',
    length: 46,
    receiver: 21,
    width: 13,
    barrel: 10,
    stock: 12,
    magazine: 4,
    scope: false,
    tube: true,
    accent: COLORS.amber,
  },
]);

function surface(width = FRAME_SIZE * SUPERSAMPLE, height = FRAME_SIZE * SUPERSAMPLE) {
  return { width, height, pixels: Buffer.alloc(width * height * 4) };
}

function put(target, x, y, color) {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return;
  const offset = (Math.floor(y) * target.width + Math.floor(x)) * 4;
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

const S = (value) => value * SUPERSAMPLE;
const rect = (target, x, y, width, height, color) =>
  fillRect(target, S(x), S(y), S(width), S(height), color);
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

const perpendicular = (vector) => ({ x: -vector.y, y: vector.x });
const point = (center, v, p, forward, lateral = 0) => ({
  x: center.x + v.x * forward + p.x * lateral,
  y: center.y + v.y * forward + p.y * lateral,
});

function drawWeapon(target, gun, direction, presentation, phase = 0) {
  const v = directionVector(direction);
  const p = perpendicular(v);
  const recoil = presentation === 'fire' ? (phase === 0 ? -1.5 : -3) : 0;
  const center = { x: 32 + v.x * recoil, y: 32 + v.y * recoil };
  const rear = -gun.length * 0.42;
  const front = gun.length * 0.58;
  const receiverRear = -gun.receiver * 0.45;
  const receiverFront = gun.receiver * 0.55;
  const receiver = [
    point(center, v, p, receiverRear, -gun.width / 2),
    point(center, v, p, receiverFront, -gun.width / 2),
    point(center, v, p, receiverFront, gun.width / 2),
    point(center, v, p, receiverRear, gun.width / 2),
  ];
  stroke(
    target,
    point(center, v, p, rear).x,
    point(center, v, p, rear).y,
    point(center, v, p, front).x,
    point(center, v, p, front).y,
    COLORS.ink,
    gun.tube ? 14 : gun.width + 4,
  );
  stroke(
    target,
    point(center, v, p, receiverFront).x,
    point(center, v, p, receiverFront).y,
    point(center, v, p, front).x,
    point(center, v, p, front).y,
    gun.tube ? COLORS.raised : COLORS.steel,
    gun.barrel,
  );
  polygon(
    target,
    receiver.map(({ x, y }) => [x, y]),
    COLORS.navy,
  );
  stroke(
    target,
    point(center, v, p, receiverRear, -gun.width / 2 + 1).x,
    point(center, v, p, receiverRear, -gun.width / 2 + 1).y,
    point(center, v, p, receiverFront, -gun.width / 2 + 1).x,
    point(center, v, p, receiverFront, -gun.width / 2 + 1).y,
    COLORS.raised,
    2,
  );
  const stockStart = point(center, v, p, receiverRear, 0);
  const stockEnd = point(center, v, p, rear, 0);
  stroke(
    target,
    stockStart.x,
    stockStart.y,
    stockEnd.x,
    stockEnd.y,
    COLORS.ink,
    gun.tube ? gun.stock : Math.max(5, gun.width),
  );
  stroke(
    target,
    stockStart.x,
    stockStart.y,
    stockEnd.x,
    stockEnd.y,
    gun.tube ? COLORS.steel : COLORS.raised,
    Math.max(2, gun.tube ? gun.stock - 5 : gun.width - 3),
  );
  const grip = point(center, v, p, -1, gun.width / 2 + 1);
  const gripEnd = point(center, v, p, -5, gun.width / 2 + gun.magazine);
  stroke(target, grip.x, grip.y, gripEnd.x, gripEnd.y, COLORS.ink, gun.id === 'smg' ? 7 : 5);
  stroke(
    target,
    grip.x,
    grip.y,
    gripEnd.x,
    gripEnd.y,
    gun.id === 'smg' ? COLORS.steel : COLORS.rust,
    gun.id === 'smg' ? 3 : 2,
  );
  if (gun.id === 'shotgun') {
    const pumpStart = point(center, v, p, receiverFront + 3, 0);
    const pumpEnd = point(center, v, p, front - 3, 0);
    stroke(target, pumpStart.x, pumpStart.y, pumpEnd.x, pumpEnd.y, COLORS.ink, 10);
    stroke(target, pumpStart.x, pumpStart.y, pumpEnd.x, pumpEnd.y, COLORS.rust, 5);
  }
  if (gun.scope) {
    const scopeStart = point(center, v, p, -5, -gun.width / 2 - 3);
    const scopeEnd = point(center, v, p, 10, -gun.width / 2 - 3);
    stroke(target, scopeStart.x, scopeStart.y, scopeEnd.x, scopeEnd.y, COLORS.ink, 5);
    stroke(target, scopeStart.x, scopeStart.y, scopeEnd.x, scopeEnd.y, COLORS.blue, 2);
  }
  const accentStart = point(center, v, p, receiverRear + 3, -gun.width / 2 + 1);
  const accentEnd = point(
    center,
    v,
    p,
    Math.min(receiverFront - 2, receiverRear + 9),
    -gun.width / 2 + 1,
  );
  stroke(target, accentStart.x, accentStart.y, accentEnd.x, accentEnd.y, gun.accent, 1.5);
  if (presentation === 'dry') {
    const dry = point(center, v, p, receiverFront - 2, -gun.width / 2 - 2);
    stroke(
      target,
      dry.x - p.x * 2,
      dry.y - p.y * 2,
      dry.x + p.x * 2,
      dry.y + p.y * 2,
      COLORS.common,
      1.5,
    );
  }
  if (presentation === 'fire') {
    const muzzle = point(center, v, p, front + 1, 0);
    const reach = phase === 0 ? 6 : 10;
    polygon(
      target,
      [
        [muzzle.x - p.x * 4, muzzle.y - p.y * 4],
        [muzzle.x + v.x * reach, muzzle.y + v.y * reach],
        [muzzle.x + p.x * 4, muzzle.y + p.y * 4],
      ],
      phase === 0 ? COLORS.bone : COLORS.amber,
    );
  }
}

function drawBadge(target, color = COLORS.steel) {
  polygon(
    target,
    [
      [5, 12],
      [9, 8],
      [55, 8],
      [59, 12],
      [59, 52],
      [55, 56],
      [9, 56],
      [5, 52],
    ],
    COLORS.ink,
  );
  polygon(
    target,
    [
      [8, 13],
      [11, 11],
      [53, 11],
      [56, 13],
      [56, 51],
      [53, 53],
      [11, 53],
      [8, 51],
    ],
    COLORS.navy,
  );
  stroke(target, 11, 51, 53, 51, color, 2);
}

function drawGroundFrame(gun) {
  const target = surface();
  ellipse(target, 32, 43, Math.min(27, gun.length * 0.55), 5, COLORS.shadow);
  drawWeapon(target, gun, 'side', 'hold', 0);
  return downsample(target);
}

function drawHudFrame(gun) {
  const target = surface();
  drawBadge(target, gun.accent);
  const scaledGun = {
    ...gun,
    length: Math.min(gun.length, 43),
    width: Math.max(5, gun.width - 2),
    barrel: Math.max(2, gun.barrel - 1),
    stock: Math.max(2, gun.stock - 2),
    magazine: Math.max(3, gun.magazine - 3),
  };
  drawWeapon(target, scaledGun, 'side', 'hold', 0);
  return downsample(target);
}

function drawAmmoFrame(gun) {
  const target = surface();
  drawBadge(target, gun.accent);
  if (gun.id === 'launcher') {
    stroke(target, 15, 32, 47, 32, COLORS.ink, 10);
    stroke(target, 16, 32, 45, 32, COLORS.amber, 5);
    polygon(
      target,
      [
        [47, 26],
        [58, 32],
        [47, 38],
      ],
      COLORS.rustLight,
    );
  } else if (gun.id === 'shotgun') {
    for (const x of [19, 29, 39, 49]) {
      rect(target, x - 3, 21, 6, 23, COLORS.ink);
      rect(target, x - 2, 23, 4, 18, COLORS.rustLight);
      rect(target, x - 2, 21, 4, 4, COLORS.bone);
    }
  } else if (gun.id === 'smg') {
    polygon(
      target,
      [
        [23, 17],
        [43, 17],
        [40, 48],
        [25, 48],
      ],
      COLORS.ink,
    );
    polygon(
      target,
      [
        [26, 20],
        [40, 20],
        [37, 45],
        [28, 45],
      ],
      COLORS.steel,
    );
    for (const y of [25, 32, 39]) stroke(target, 28, y, 38, y, COLORS.tealHot, 1);
  } else {
    const count = gun.id === 'pistol' ? 4 : gun.id === 'sniper-rifle' ? 1 : 5;
    const spacing = gun.id === 'sniper-rifle' ? 0 : 9;
    for (let index = 0; index < count; index += 1) {
      const x = count === 1 ? 32 : 14 + index * spacing;
      const height = gun.id === 'sniper-rifle' ? 34 : 24;
      polygon(
        target,
        [
          [x - 3, 45],
          [x + 3, 45],
          [x + 3, 25],
          [x, 21],
          [x - 3, 25],
        ],
        COLORS.ink,
      );
      polygon(
        target,
        [
          [x - 1.5, 42],
          [x + 1.5, 42],
          [x + 1.5, 27],
          [x, 24],
          [x - 1.5, 27],
        ],
        gun.id === 'sniper-rifle' ? COLORS.blue : COLORS.steelLight,
      );
      if (height > 24) stroke(target, x, 17, x, 48, COLORS.ink, 1);
    }
  }
  return downsample(target);
}

function drawContainerFrame(gun) {
  const target = surface();
  ellipse(target, 32, 48, 26, 5, COLORS.shadow);
  polygon(
    target,
    [
      [6, 18],
      [12, 13],
      [52, 13],
      [58, 18],
      [58, 46],
      [53, 51],
      [11, 51],
      [6, 46],
    ],
    COLORS.ink,
  );
  polygon(
    target,
    [
      [9, 20],
      [13, 17],
      [51, 17],
      [55, 20],
      [55, 44],
      [51, 47],
      [13, 47],
      [9, 44],
    ],
    COLORS.raised,
  );
  stroke(target, 9, 31, 55, 31, COLORS.steel, 2);
  stroke(target, 19, 17, 19, 47, COLORS.rust, 2);
  stroke(target, 45, 17, 45, 47, COLORS.rust, 2);
  const mark = {
    ...gun,
    length: Math.min(34, gun.length),
    width: Math.max(4, gun.width - 3),
    barrel: Math.max(2, gun.barrel - 2),
    stock: Math.max(2, gun.stock - 4),
    magazine: Math.max(2, gun.magazine - 5),
  };
  drawWeapon(target, mark, 'side', 'dry', 0);
  return downsample(target);
}

function gunFrames(gun) {
  const frames = [];
  for (const direction of DIRECTIONS) {
    for (let frame = 0; frame < 2; frame += 1) {
      const target = surface();
      drawWeapon(target, gun, direction, 'hold', frame);
      frames.push(downsample(target));
    }
  }
  for (const direction of DIRECTIONS) {
    for (let frame = 0; frame < 2; frame += 1) {
      const target = surface();
      drawWeapon(target, gun, direction, 'fire', frame);
      frames.push(downsample(target));
    }
  }
  for (const direction of DIRECTIONS) {
    const target = surface();
    drawWeapon(target, gun, direction, 'dry', 0);
    frames.push(downsample(target));
  }
  frames.push(drawGroundFrame(gun), drawHudFrame(gun), drawAmmoFrame(gun), drawContainerFrame(gun));
  return frames;
}

function drawPickup(index) {
  const target = surface();
  ellipse(target, 32, 49, 19, 4, COLORS.shadow);
  if (index === 0) {
    polygon(
      target,
      [
        [10, 19],
        [15, 14],
        [49, 14],
        [54, 19],
        [54, 46],
        [49, 51],
        [15, 51],
        [10, 46],
      ],
      COLORS.ink,
    );
    polygon(
      target,
      [
        [13, 21],
        [17, 18],
        [47, 18],
        [51, 21],
        [51, 44],
        [47, 47],
        [17, 47],
        [13, 44],
      ],
      COLORS.raised,
    );
    for (const x of [23, 32, 41]) stroke(target, x, 24, x, 41, COLORS.blue, 3);
  } else if (index === 1) {
    ellipse(target, 32, 36, 13, 15, COLORS.ink);
    ellipse(target, 32, 36, 9, 12, COLORS.green);
    stroke(target, 24, 28, 40, 44, COLORS.steel, 2);
    rect(target, 27, 15, 10, 7, COLORS.steel);
    stroke(target, 35, 17, 44, 11, COLORS.bone, 2);
    ellipse(target, 45, 10, 4, 4, COLORS.ink);
  } else if (index === 2) {
    polygon(
      target,
      [
        [12, 23],
        [18, 17],
        [48, 20],
        [53, 28],
        [49, 45],
        [42, 50],
        [15, 46],
        [9, 38],
      ],
      COLORS.ink,
    );
    polygon(
      target,
      [
        [15, 25],
        [20, 21],
        [45, 23],
        [49, 29],
        [46, 42],
        [40, 46],
        [17, 43],
        [13, 37],
      ],
      COLORS.bone,
    );
    rect(target, 28, 23, 8, 21, COLORS.rustLight);
    rect(target, 22, 29, 20, 8, COLORS.rustLight);
  } else if (index === 3) {
    polygon(
      target,
      [
        [17, 14],
        [47, 17],
        [52, 27],
        [47, 49],
        [34, 54],
        [15, 47],
        [11, 28],
      ],
      COLORS.ink,
    );
    polygon(
      target,
      [
        [19, 18],
        [44, 20],
        [48, 28],
        [44, 46],
        [34, 50],
        [18, 44],
        [15, 29],
      ],
      COLORS.steel,
    );
    stroke(target, 21, 23, 42, 44, COLORS.blue, 3);
    for (const [x, y] of [
      [20, 21],
      [43, 23],
      [20, 41],
      [41, 43],
    ])
      ellipse(target, x, y, 2, 2, COLORS.bone);
  } else if (index === 4) {
    rect(target, 20, 12, 24, 40, COLORS.ink);
    rect(target, 23, 15, 18, 34, COLORS.purple);
    ellipse(target, 32, 32, 7, 13, [114, 214, 201, 140]);
    polygon(
      target,
      [
        [34, 18],
        [27, 31],
        [33, 31],
        [29, 46],
        [39, 28],
        [33, 28],
      ],
      COLORS.white,
    );
    stroke(target, 18, 18, 18, 46, COLORS.bone, 2);
    stroke(target, 46, 18, 46, 46, COLORS.bone, 2);
  } else if (index === 5) {
    polygon(
      target,
      [
        [10, 19],
        [18, 12],
        [49, 16],
        [55, 25],
        [51, 50],
        [15, 50],
        [8, 41],
      ],
      COLORS.ink,
    );
    polygon(
      target,
      [
        [13, 21],
        [20, 16],
        [46, 19],
        [51, 26],
        [48, 46],
        [17, 46],
        [12, 39],
      ],
      COLORS.raised,
    );
    stroke(target, 16, 19, 48, 45, COLORS.teal, 3);
    rect(target, 26, 28, 13, 13, COLORS.bone);
    rect(target, 31, 25, 3, 19, COLORS.green);
    rect(target, 23, 33, 19, 3, COLORS.green);
  } else {
    const damaged = index === 7;
    polygon(
      target,
      [
        [7, 18],
        [13, 13],
        [51, 13],
        [58, 20],
        [56, 47],
        [50, 52],
        [12, 51],
        [6, 44],
      ],
      COLORS.ink,
    );
    polygon(
      target,
      [
        [10, 20],
        [15, 17],
        [49, 17],
        [54, 22],
        [52, 44],
        [48, 48],
        [14, 47],
        [10, 42],
      ],
      damaged ? COLORS.navy : COLORS.raised,
    );
    stroke(target, 10, 31, 54, 31, damaged ? COLORS.rustLight : COLORS.steel, 2);
    stroke(target, 20, 17, 20, 47, COLORS.rust, 2);
    stroke(target, 44, 17, 44, 47, COLORS.rust, 2);
    if (damaged) {
      stroke(target, 22, 23, 42, 42, COLORS.amber, 3);
      stroke(target, 42, 23, 22, 42, COLORS.amber, 3);
      polygon(
        target,
        [
          [47, 13],
          [57, 17],
          [52, 24],
        ],
        COLORS.ink,
      );
    } else {
      rect(target, 28, 27, 8, 10, COLORS.bone);
    }
  }
  return downsample(target);
}

function drawRarity(index) {
  const target = surface();
  const colors = [
    COLORS.common,
    COLORS.green,
    COLORS.blue,
    COLORS.purple,
    COLORS.amber,
    COLORS.red,
  ];
  const color = colors[index];
  polygon(
    target,
    [
      [27, 7],
      [37, 7],
      [41, 12],
      [37, 17],
      [27, 17],
      [23, 12],
    ],
    COLORS.ink,
  );
  polygon(
    target,
    [
      [28, 9],
      [36, 9],
      [38, 12],
      [36, 15],
      [28, 15],
      [26, 12],
    ],
    color,
  );
  stroke(target, 13, 48, 51, 48, color, 2);
  if (index === 1) stroke(target, 24, 42, 40, 42, color, 3);
  if (index === 2) {
    stroke(target, 15, 27, 19, 23, color, 2);
    stroke(target, 45, 23, 49, 27, color, 2);
  }
  if (index === 3) {
    for (const [x, y] of [
      [18, 24],
      [46, 24],
      [18, 39],
      [46, 39],
    ]) {
      polygon(
        target,
        [
          [x, y - 4],
          [x + 4, y],
          [x, y + 4],
          [x - 4, y],
        ],
        color,
      );
    }
  }
  if (index === 4) {
    for (const [x, y, dx] of [
      [23, 25, -4],
      [32, 20, 0],
      [41, 25, 4],
    ]) {
      stroke(target, x, y, x + dx, y - 9, color, 3);
    }
  }
  if (index === 5) {
    for (const side of [-1, 1]) {
      const x = side < 0 ? 18 : 46;
      stroke(target, x, 22, x + side * 6, 28, color, 3);
      stroke(target, x + side * 6, 28, x, 34, color, 3);
      stroke(target, x, 29, x + side * 6, 35, color, 2);
      stroke(target, x + side * 6, 35, x, 41, color, 2);
    }
  }
  return downsample(target);
}

function composeSheet(frames, columns) {
  const rows = frames.length / columns;
  const target = surface(FRAME_SIZE * columns, FRAME_SIZE * rows);
  frames.forEach((frame, index) => {
    const ox = (index % columns) * FRAME_SIZE;
    const oy = Math.floor(index / columns) * FRAME_SIZE;
    for (let y = 0; y < FRAME_SIZE; y += 1) {
      const sourceStart = y * FRAME_SIZE * 4;
      const targetStart = ((oy + y) * target.width + ox) * 4;
      frame.pixels.copy(target.pixels, targetStart, sourceStart, sourceStart + FRAME_SIZE * 4);
    }
  });
  return target;
}

function writeSheet(file, frames, columns) {
  const sheet = composeSheet(frames, columns);
  const path = resolve(OUT_DIR, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePngRgba(sheet.width, sheet.height, sheet.pixels));
}

for (const gun of GUNS) {
  const frames = gunFrames(gun);
  if (frames.length !== 24) throw new Error(`${gun.id}: expected 24 frames`);
  writeSheet(`${gun.id}-states.png`, frames, GUN_COLUMNS);
}
writeSheet(
  'sustain-pickups.png',
  Array.from({ length: 8 }, (_, index) => drawPickup(index)),
  4,
);
writeSheet(
  'rarity-language.png',
  Array.from({ length: 6 }, (_, index) => drawRarity(index)),
  3,
);

process.stdout.write(`Generated deterministic weapon and pickup sources in ${OUT_DIR}\n`);
