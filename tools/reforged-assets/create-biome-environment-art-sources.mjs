import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { encodePngRgba } from './asset-pipeline.mjs';

const OUT_DIR = resolve('art/reforged/sources/biome-environment-art');
const FRAME = 64;
const COLUMNS = 5;
const FAMILIES = Object.freeze([
  {
    id: 'wasteland',
    ground: [133, 102, 70, 255],
    groundAlt: [153, 119, 79, 255],
    structure: [118, 71, 48, 255],
    raised: [180, 128, 80, 255],
    light: [222, 188, 135, 255],
    accent: [198, 79, 45, 255],
    anchor: [114, 214, 201, 255],
    ink: [39, 27, 24, 255],
    next: 'overgrown',
  },
  {
    id: 'overgrown',
    ground: [76, 89, 70, 255],
    groundAlt: [91, 103, 78, 255],
    structure: [54, 72, 61, 255],
    raised: [91, 114, 87, 255],
    light: [153, 157, 116, 255],
    accent: [45, 128, 119, 255],
    anchor: [114, 214, 201, 255],
    ink: [20, 31, 29, 255],
    next: 'industrial',
  },
  {
    id: 'industrial',
    ground: [75, 69, 64, 255],
    groundAlt: [94, 86, 76, 255],
    structure: [81, 47, 43, 255],
    raised: [143, 68, 48, 255],
    light: [163, 151, 132, 255],
    accent: [247, 150, 23, 255],
    anchor: [114, 214, 201, 255],
    ink: [26, 24, 27, 255],
    next: 'irradiated',
  },
  {
    id: 'irradiated',
    ground: [31, 34, 39, 255],
    groundAlt: [46, 48, 54, 255],
    structure: [27, 30, 39, 255],
    raised: [65, 70, 73, 255],
    light: [127, 135, 112, 255],
    accent: [145, 219, 105, 255],
    anchor: [168, 132, 243, 255],
    ink: [8, 12, 18, 255],
    next: 'wasteland',
  },
]);

function surface(width = FRAME, height = FRAME) {
  return { width, height, pixels: Buffer.alloc(width * height * 4) };
}

function pixel(target, x, y, color) {
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

function rect(target, x, y, width, height, color) {
  for (let py = Math.floor(y); py < Math.ceil(y + height); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + width); px += 1) {
      pixel(target, px, py, color);
    }
  }
}

function ellipse(target, cx, cy, rx, ry, color) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) pixel(target, x, y, color);
    }
  }
}

function eraseEllipse(target, cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1 && x >= 0 && y >= 0 && x < target.width && y < target.height) {
        target.pixels.fill(0, (y * target.width + x) * 4, (y * target.width + x) * 4 + 4);
      }
    }
  }
}

function polygon(target, points, color) {
  const minY = Math.floor(Math.min(...points.map((point) => point[1])));
  const maxY = Math.ceil(Math.max(...points.map((point) => point[1])));
  for (let y = minY; y <= maxY; y += 1) {
    const hits = [];
    for (let index = 0; index < points.length; index += 1) {
      const [x1, y1] = points[index];
      const [x2, y2] = points[(index + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        hits.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    hits.sort((a, b) => a - b);
    for (let index = 0; index < hits.length; index += 2) {
      for (
        let x = Math.ceil(hits[index]);
        x <= Math.floor(hits[index + 1] ?? hits[index]);
        x += 1
      ) {
        pixel(target, x, y, color);
      }
    }
  }
}

function erasePolygon(target, points) {
  const mask = surface(target.width, target.height);
  polygon(mask, points, [255, 255, 255, 255]);
  for (let offset = 0; offset < mask.pixels.length; offset += 4) {
    if (mask.pixels[offset + 3] !== 0) target.pixels.fill(0, offset, offset + 4);
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
    rect(
      target,
      x - Math.floor(thickness / 2),
      y - Math.floor(thickness / 2),
      thickness,
      thickness,
      color,
    );
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

function quietGround(family, variant) {
  const target = surface();
  rect(target, 0, 0, FRAME, FRAME, family.ground);
  if (variant === 1) rect(target, 4, 4, 56, 56, family.groundAlt);
  if (variant === 2)
    polygon(
      target,
      [
        [7, 9],
        [46, 6],
        [58, 28],
        [49, 56],
        [13, 58],
        [5, 31],
      ],
      family.groundAlt,
    );
  const wear = [...family.structure.slice(0, 3), 68];
  const accent = [...family.accent.slice(0, 3), 76];
  const seeds = [
    [11, 17, 20, 16],
    [43, 12, 50, 17],
    [24, 42, 31, 50],
    [48, 47, 55, 42],
  ];
  for (const [x0, y0, x1, y1] of seeds.slice(0, variant + 2)) line(target, x0, y0, x1, y1, wear, 1);
  if (variant === 2) {
    ellipse(target, 17, 47, 3, 2, accent);
    ellipse(target, 48, 23, 2, 3, accent);
  }
  return target;
}

function transition(family, targetFamily, kind) {
  const target = surface();
  rect(target, 0, 0, FRAME, FRAME, family.ground);
  if (kind === 'horizontal') {
    rect(target, 34, 0, 30, FRAME, targetFamily.ground);
    for (let y = 0; y < FRAME; y += 8)
      rect(target, 28 + ((y / 8) % 2) * 3, y, 9, 8, family.groundAlt);
  } else if (kind === 'vertical') {
    rect(target, 0, 34, FRAME, 30, targetFamily.ground);
    for (let x = 0; x < FRAME; x += 8)
      rect(target, x, 28 + ((x / 8) % 2) * 3, 8, 9, family.groundAlt);
  } else {
    rect(target, 34, 0, 30, FRAME, targetFamily.ground);
    rect(target, 0, 34, FRAME, 30, targetFamily.ground);
    polygon(
      target,
      [
        [25, 25],
        [39, 25],
        [39, 39],
        [25, 39],
      ],
      family.groundAlt,
    );
  }
  return target;
}

function wall(family, damaged) {
  const target = surface();
  const top = damaged ? 18 : 7;
  polygon(
    target,
    [
      [3, top + 4],
      [9, top - 2],
      [57, top - 2],
      [62, top + 4],
      [62, 56],
      [3, 56],
    ],
    family.ink,
  );
  polygon(
    target,
    [
      [8, top + 5],
      [12, top + 1],
      [53, top + 1],
      [57, top + 5],
      [57, 51],
      [8, 51],
    ],
    family.structure,
  );
  rect(target, 11, top + 4, 43, 7, family.raised);
  rect(target, 10, 45, 45, 4, family.accent);
  for (const x of [17, 32, 47]) line(target, x, top + 2, x, 48, family.ink, 2);
  if (damaged) {
    erasePolygon(target, [
      [20, 12],
      [28, 12],
      [33, 25],
      [39, 15],
      [47, 14],
      [43, 31],
      [25, 29],
    ]);
    polygon(
      target,
      [
        [4, 49],
        [19, 39],
        [29, 55],
      ],
      family.raised,
    );
    polygon(
      target,
      [
        [38, 55],
        [49, 40],
        [61, 51],
      ],
      family.raised,
    );
  }
  return target;
}

function lowCover(family, damaged) {
  const target = surface();
  const points = damaged
    ? [
        [5, 39],
        [14, 28],
        [27, 33],
        [36, 25],
        [56, 35],
        [59, 52],
        [5, 52],
      ]
    : [
        [5, 35],
        [12, 26],
        [52, 26],
        [59, 35],
        [59, 52],
        [5, 52],
      ];
  polygon(target, points, family.ink);
  polygon(
    target,
    [
      [9, 37],
      [15, 31],
      [49, 31],
      [55, 37],
      [55, 48],
      [9, 48],
    ],
    family.raised,
  );
  line(target, 11, 43, 53, 43, family.light, 2);
  line(target, 18, 32, 18, 48, family.structure, 2);
  line(target, 45, 32, 45, 48, family.structure, 2);
  if (damaged) line(target, 23, 31, 40, 47, family.accent, 3);
  return target;
}

function prop(family, kind, damaged) {
  const target = surface();
  if (kind === 'a') {
    ellipse(target, 32, 49, 18, 4, [5, 8, 13, 72]);
    polygon(
      target,
      damaged
        ? [
            [16, 25],
            [47, 19],
            [51, 46],
            [20, 51],
          ]
        : [
            [18, 17],
            [46, 17],
            [50, 49],
            [14, 49],
          ],
      family.ink,
    );
    polygon(
      target,
      [
        [20, 22],
        [44, 22],
        [46, 45],
        [18, 45],
      ],
      family.raised,
    );
    line(target, 18, 31, 46, 31, family.accent, 3);
    line(target, 19, 40, 45, 40, family.light, 2);
    if (damaged) line(target, 23, 22, 40, 45, family.ink, 3);
  } else {
    ellipse(target, 32, 49, 21, 4, [5, 8, 13, 72]);
    polygon(
      target,
      damaged
        ? [
            [9, 34],
            [22, 20],
            [34, 29],
            [48, 18],
            [57, 45],
            [11, 50],
          ]
        : [
            [9, 29],
            [16, 21],
            [49, 21],
            [57, 29],
            [54, 48],
            [12, 48],
          ],
      family.ink,
    );
    polygon(
      target,
      [
        [14, 31],
        [20, 26],
        [45, 26],
        [52, 31],
        [49, 44],
        [16, 44],
      ],
      family.structure,
    );
    line(target, 17, 34, 49, 34, family.light, 2);
    line(target, 24, 27, 24, 44, family.accent, 2);
  }
  return target;
}

function landmark(family, damaged) {
  const target = surface();
  polygon(
    target,
    [
      [2, 55],
      [7, 22],
      [17, 8],
      [47, 8],
      [57, 22],
      [62, 55],
    ],
    family.ink,
  );
  polygon(
    target,
    [
      [8, 52],
      [12, 25],
      [20, 14],
      [44, 14],
      [52, 25],
      [56, 52],
    ],
    family.structure,
  );
  ellipse(target, 32, 38, 13, 18, family.ink);
  eraseEllipse(target, 32, 40, 8, 14);
  rect(target, 13, 18, 38, 6, family.raised);
  rect(target, 15, 49, 34, 4, family.accent);
  if (damaged) {
    erasePolygon(target, [
      [39, 7],
      [55, 7],
      [62, 28],
      [48, 31],
      [43, 20],
    ]);
    line(target, 14, 21, 27, 35, family.light, 3);
  } else {
    polygon(
      target,
      [
        [28, 4],
        [36, 4],
        [40, 11],
        [36, 17],
        [28, 17],
        [24, 11],
      ],
      family.anchor,
    );
  }
  return target;
}

function shadow(kind) {
  const target = surface();
  const color = [5, 8, 13, kind === 'wall' ? 96 : 76];
  if (kind === 'wall')
    polygon(
      target,
      [
        [8, 18],
        [57, 18],
        [63, 25],
        [63, 58],
        [16, 58],
      ],
      color,
    );
  else if (kind === 'cover')
    polygon(
      target,
      [
        [10, 34],
        [54, 34],
        [63, 42],
        [63, 57],
        [20, 57],
      ],
      color,
    );
  else
    polygon(
      target,
      [
        [20, 27],
        [47, 27],
        [58, 37],
        [58, 55],
        [30, 55],
      ],
      color,
    );
  return target;
}

function anchor(family) {
  const target = surface();
  ellipse(target, 32, 49, 15, 5, [5, 8, 13, 72]);
  polygon(
    target,
    [
      [19, 42],
      [24, 36],
      [40, 36],
      [45, 42],
      [42, 51],
      [22, 51],
    ],
    family.ink,
  );
  polygon(
    target,
    [
      [32, 8],
      [42, 22],
      [36, 39],
      [28, 39],
      [22, 22],
    ],
    family.ink,
  );
  polygon(
    target,
    [
      [32, 12],
      [38, 23],
      [34, 35],
      [30, 35],
      [26, 23],
    ],
    family.anchor,
  );
  line(target, 24, 44, 40, 44, family.light, 2);
  return target;
}

function framesFor(family) {
  const targetFamily = FAMILIES.find(({ id }) => id === family.next);
  return [
    quietGround(family, 0),
    quietGround(family, 1),
    quietGround(family, 2),
    transition(family, targetFamily, 'horizontal'),
    transition(family, targetFamily, 'vertical'),
    transition(family, targetFamily, 'corner'),
    wall(family, false),
    wall(family, true),
    lowCover(family, false),
    lowCover(family, true),
    prop(family, 'a', false),
    prop(family, 'a', true),
    prop(family, 'b', false),
    prop(family, 'b', true),
    landmark(family, false),
    landmark(family, true),
    shadow('wall'),
    shadow('cover'),
    shadow('prop'),
    anchor(family),
  ];
}

function compose(frames) {
  const rows = frames.length / COLUMNS;
  const target = surface(FRAME * COLUMNS, FRAME * rows);
  frames.forEach((frame, index) => {
    const ox = (index % COLUMNS) * FRAME;
    const oy = Math.floor(index / COLUMNS) * FRAME;
    for (let y = 0; y < FRAME; y += 1) {
      const sourceStart = y * FRAME * 4;
      const targetStart = ((oy + y) * target.width + ox) * 4;
      frame.pixels.copy(target.pixels, targetStart, sourceStart, sourceStart + FRAME * 4);
    }
  });
  return target;
}

for (const family of FAMILIES) {
  const frames = framesFor(family);
  if (frames.length !== 20) throw new Error(`${family.id}: expected 20 frames`);
  const sheet = compose(frames);
  const path = resolve(OUT_DIR, `${family.id}-environment.png`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePngRgba(sheet.width, sheet.height, sheet.pixels));
}

process.stdout.write(`Generated deterministic biome environment sources in ${OUT_DIR}\n`);
