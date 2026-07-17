import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { encodePngRgba } from './asset-pipeline.mjs';

const OUT = resolve('art/reforged/sources/combat-feedback-art/combat-feedback.png');
const FRAME = 64;
const COLUMNS = 8;
const FRAME_COUNT = 96;

const C = Object.freeze({
  ink: [17, 18, 20, 255],
  cream: [255, 240, 204, 255],
  amber: [247, 174, 45, 255],
  coral: [238, 82, 65, 255],
  mint: [113, 222, 161, 255],
  cyan: [95, 205, 230, 255],
  steel: [107, 151, 190, 255],
  violet: [173, 118, 232, 255],
  gold: [239, 198, 74, 255],
  dust: [153, 128, 96, 255],
  smoke: [86, 82, 78, 220],
});

function surface(width = FRAME, height = FRAME) {
  return { width, height, pixels: Buffer.alloc(width * height * 4) };
}

function pixel(target, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= target.width || py >= target.height) return;
  const offset = (py * target.width + px) * 4;
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
    for (let px = Math.floor(x); px < Math.ceil(x + width); px += 1) pixel(target, px, py, color);
  }
}

function ellipse(target, cx, cy, rx, ry, color) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = (x - cx) / Math.max(rx, 0.01);
      const dy = (y - cy) / Math.max(ry, 0.01);
      if (dx * dx + dy * dy <= 1) pixel(target, x, y, color);
    }
  }
}

function ring(target, cx, cy, radius, thickness, color, start = 0, end = Math.PI * 2) {
  const inner = Math.max(0, radius - thickness);
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const distance = Math.hypot(dx, dy);
      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += Math.PI * 2;
      const normalizedStart = ((start % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      let normalizedEnd = ((end % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (end - start >= Math.PI * 2) normalizedEnd = normalizedStart + Math.PI * 2;
      let relative = angle - normalizedStart;
      if (relative < 0) relative += Math.PI * 2;
      const span = normalizedEnd - normalizedStart;
      const withinArc =
        span >= Math.PI * 2 - 0.001 || relative <= (span < 0 ? span + Math.PI * 2 : span);
      if (distance >= inner && distance <= radius && withinArc) pixel(target, x, y, color);
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

function line(target, x0, y0, x1, y1, color, thickness = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    rect(
      target,
      x0 + (x1 - x0) * t - Math.floor(thickness / 2),
      y0 + (y1 - y0) * t - Math.floor(thickness / 2),
      thickness,
      thickness,
      color,
    );
  }
}

function rotated(points, angle, cx = 32, cy = 32) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
}

function star(target, radius, inner, color, angle = 0) {
  const points = [];
  for (let index = 0; index < 16; index += 1) {
    const theta = angle + (Math.PI * index) / 8;
    const r = index % 2 === 0 ? radius : inner;
    points.push([32 + Math.cos(theta) * r, 32 + Math.sin(theta) * r]);
  }
  polygon(target, points, C.ink);
  polygon(
    target,
    points.map(([x, y]) => [32 + (x - 32) * 0.72, 32 + (y - 32) * 0.72]),
    color,
  );
  ellipse(target, 32, 32, 3, 3, C.cream);
}

function muzzle(direction, phase) {
  const target = surface();
  const angle = direction * (Math.PI / 2);
  const length = [14, 25, 20, 11][phase];
  const width = [5, 10, 8, 4][phase];
  polygon(
    target,
    rotated(
      [
        [0, -width],
        [length, -3],
        [length + 4, 0],
        [length, 3],
        [0, width],
      ],
      angle,
    ),
    C.ink,
  );
  polygon(
    target,
    rotated(
      [
        [1, -Math.max(2, width - 3)],
        [length - 2, 0],
        [1, Math.max(2, width - 3)],
      ],
      angle,
    ),
    C.amber,
  );
  polygon(
    target,
    rotated(
      [
        [1, -2],
        [Math.max(7, length - 6), 0],
        [1, 2],
      ],
      angle,
    ),
    C.cream,
  );
  for (const offset of [-0.42, 0.42]) {
    const ray = angle + offset;
    line(
      target,
      32 + Math.cos(ray) * 8,
      32 + Math.sin(ray) * 8,
      32 + Math.cos(ray) * (length + 2),
      32 + Math.sin(ray) * (length + 2),
      C.gold,
      phase === 1 ? 2 : 1,
    );
  }
  ellipse(target, 32, 32, 3, 3, C.cream);
  return target;
}

function impact(direction, phase, confirmed) {
  const target = surface();
  const angle = direction * (Math.PI / 2);
  const size = confirmed ? [11, 19, 12][phase] : [9, 16, 10][phase];
  star(target, size, Math.max(3, size * 0.32), confirmed ? C.coral : C.dust, angle / 2);
  const count = confirmed ? 4 : 3;
  for (let index = 0; index < count; index += 1) {
    const spread = (index - (count - 1) / 2) * 0.28;
    const ray = angle + Math.PI + spread;
    const near = size * 0.45;
    const far = Math.min(29, size + 5 + index * 2);
    line(
      target,
      32 + Math.cos(ray) * near,
      32 + Math.sin(ray) * near,
      32 + Math.cos(ray) * far,
      32 + Math.sin(ray) * far,
      confirmed ? C.cream : C.dust,
      confirmed ? 2 : 1,
    );
  }
  return target;
}

function explosion(phase) {
  const target = surface();
  const pulse = [7, 12, 18, 24, 22, 17, 12, 7][phase];
  ring(target, 32, 32, 30, 2, phase < 5 ? C.amber : C.coral);
  for (let spoke = 0; spoke < 8; spoke += 1) {
    const angle = (Math.PI * spoke) / 4 + phase * 0.09;
    line(
      target,
      32 + Math.cos(angle) * 24,
      32 + Math.sin(angle) * 24,
      32 + Math.cos(angle) * 30,
      32 + Math.sin(angle) * 30,
      C.cream,
      1,
    );
  }
  star(target, pulse, Math.max(4, pulse * 0.5), phase < 4 ? C.amber : C.coral, phase * 0.12);
  if (phase >= 3) {
    for (const [x, y] of [
      [16, 17],
      [48, 19],
      [18, 46],
      [47, 45],
    ])
      ellipse(target, x, y, 3 + (phase % 2), 2 + (phase % 2), C.smoke);
  }
  return target;
}

function heal(phase) {
  const target = surface();
  const radius = [11, 18, 24, 29][phase];
  ring(target, 32, 32, radius, 2, C.mint);
  rect(target, 28, 17, 8, 30, C.ink);
  rect(target, 17, 28, 30, 8, C.ink);
  rect(target, 30, 19, 4, 26, C.cream);
  rect(target, 19, 30, 26, 4, C.cream);
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const distance = 12 + phase * 5;
    ellipse(target, 32 + Math.cos(angle) * distance, 32 + Math.sin(angle) * distance, 2, 2, C.mint);
  }
  return target;
}

function shield(phase) {
  const target = surface();
  ring(target, 32, 32, 15 + phase * 4, 2, C.steel);
  const inset = phase === 0 ? 3 : 0;
  polygon(
    target,
    [
      [32, 12 + inset],
      [48 - inset, 19],
      [45, 42],
      [32, 53 - inset],
      [19, 42],
      [16 + inset, 19],
    ],
    C.ink,
  );
  polygon(
    target,
    [
      [32, 17 + inset],
      [43 - inset, 22],
      [40, 39],
      [32, 47 - inset],
      [24, 39],
      [21 + inset, 22],
    ],
    C.steel,
  );
  line(target, 32, 19, 32, 44, C.cream, 2);
  return target;
}

const ABILITY_COLORS = [C.gold, C.coral, C.cyan, C.amber, C.violet, C.steel];
function ability(fighter, phase) {
  const target = surface();
  const color = ABILITY_COLORS[fighter];
  const radius = 12 + phase * 7;
  if (fighter === 0) {
    star(target, radius, radius * 0.45, color, -Math.PI / 2);
    line(target, 32, 31, 32, 8 + phase * 2, C.cream, 3);
  } else if (fighter === 1) {
    polygon(
      target,
      [
        [8, 43],
        [20, 28],
        [17, 37],
        [34, 15],
        [29, 34],
        [53, 22],
        [39, 48],
      ],
      C.ink,
    );
    polygon(
      target,
      [
        [13, 41],
        [24, 29],
        [22, 38],
        [33, 21],
        [31, 38],
        [47, 29],
        [37, 45],
      ],
      color,
    );
  } else if (fighter === 2) {
    for (let spoke = 0; spoke < 6; spoke += 1) {
      const angle = (Math.PI * spoke) / 3;
      line(target, 32, 32, 32 + Math.cos(angle) * radius, 32 + Math.sin(angle) * radius, C.ink, 5);
      line(target, 32, 32, 32 + Math.cos(angle) * radius, 32 + Math.sin(angle) * radius, color, 3);
      line(
        target,
        32 + Math.cos(angle) * (radius - 5),
        32 + Math.sin(angle) * (radius - 5),
        32 + Math.cos(angle + 0.5) * radius,
        32 + Math.sin(angle + 0.5) * radius,
        C.cream,
        1,
      );
    }
  } else if (fighter === 3) {
    ring(target, 32, 35, radius, 5, C.ink, Math.PI, Math.PI * 2);
    ring(target, 32, 35, radius, 3, color, Math.PI, Math.PI * 2);
    for (const x of [15, 24, 32, 40, 49]) {
      const peak = 18 + Math.abs(32 - x) * 0.35 - phase * 2;
      polygon(
        target,
        [
          [x - 5, 40],
          [x, peak - 2],
          [x + 5, 40],
        ],
        C.ink,
      );
      polygon(
        target,
        [
          [x - 3, 38],
          [x, peak],
          [x + 3, 38],
        ],
        phase === 2 ? C.cream : color,
      );
    }
  } else if (fighter === 4) {
    ring(target, 32, 32, radius, 5, color, -Math.PI * 0.8, Math.PI * 0.7);
    polygon(
      target,
      [
        [47, 11],
        [56, 17],
        [50, 25],
        [42, 19],
      ],
      C.cream,
    );
  } else {
    for (const offset of [-7, 0, 7]) {
      line(target, 8, 32 + offset, 51 - phase * 2, 32 + offset, C.ink, 5);
      line(target, 10, 32 + offset, 49 - phase * 2, 32 + offset, color, 2);
    }
    for (const x of [34 + phase * 3, 45 + phase * 2]) {
      polygon(
        target,
        [
          [x - 7, 23],
          [x + 3, 32],
          [x - 7, 41],
          [x - 2, 32],
        ],
        C.ink,
      );
      polygon(
        target,
        [
          [x - 5, 26],
          [x, 32],
          [x - 5, 38],
          [x - 2, 32],
        ],
        C.cream,
      );
    }
  }
  ellipse(target, 32, 32, 3, 3, C.cream);
  return target;
}

function rarity(level) {
  const target = surface();
  const colors = [C.dust, C.mint, C.cyan, C.violet, C.gold, C.coral];
  const sides = 4 + Math.min(level, 4);
  const points = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / sides;
    points.push([32 + Math.cos(angle) * (18 + level), 32 + Math.sin(angle) * (18 + level)]);
  }
  polygon(target, points, C.ink);
  polygon(
    target,
    points.map(([x, y]) => [32 + (x - 32) * 0.76, 32 + (y - 32) * 0.76]),
    colors[level],
  );
  star(target, 7 + level, 3 + level * 0.35, C.cream, -Math.PI / 2);
  return target;
}

function zone(phase) {
  const target = surface();
  const warning = phase >= 4;
  const color = warning ? C.coral : C.cyan;
  ring(target, 32, 32, 29, warning ? 3 : 2, color);
  ring(target, 32, 32, 23, 1, C.cream);
  for (let index = 0; index < 4; index += 1) {
    const angle = index * (Math.PI / 2) + (phase % 4) * 0.12;
    polygon(
      target,
      rotated(
        [
          [22, -4],
          [28, 0],
          [22, 4],
        ],
        angle,
      ),
      C.ink,
    );
    polygon(
      target,
      rotated(
        [
          [23, -2],
          [27, 0],
          [23, 2],
        ],
        angle,
      ),
      color,
    );
  }
  return target;
}

function elimination(direction, phase) {
  const target = surface();
  const angle = direction * (Math.PI / 2);
  const size = phase === 0 ? 22 : 14;
  star(target, size, size * 0.3, C.coral, angle / 2);
  ellipse(target, 32, phase === 0 ? 25 : 34, 5, phase === 0 ? 8 : 3, C.ink);
  polygon(
    target,
    phase === 0
      ? [
          [24, 30],
          [40, 30],
          [44, 47],
          [20, 47],
        ]
      : [
          [21, 39],
          [43, 39],
          [38, 45],
          [26, 45],
        ],
    C.ink,
  );
  for (const spread of [-0.35, 0, 0.35]) {
    const ray = angle + spread;
    line(
      target,
      32 + Math.cos(ray) * 8,
      32 + Math.sin(ray) * 8,
      32 + Math.cos(ray) * 28,
      32 + Math.sin(ray) * 28,
      C.cream,
      1,
    );
  }
  return target;
}

function frameAt(index) {
  if (index < 16) return muzzle(Math.floor(index / 4), index % 4);
  if (index < 28) return impact(Math.floor((index - 16) / 3), (index - 16) % 3, false);
  if (index < 40) return impact(Math.floor((index - 28) / 3), (index - 28) % 3, true);
  if (index < 48) return explosion(index - 40);
  if (index < 52) return heal(index - 48);
  if (index < 56) return shield(index - 52);
  if (index < 74) return ability(Math.floor((index - 56) / 3), (index - 56) % 3);
  if (index < 80) return rarity(index - 74);
  if (index < 88) return zone(index - 80);
  return elimination(Math.floor((index - 88) / 2), (index - 88) % 2);
}

function blit(target, source, dx, dy) {
  for (let y = 0; y < source.height; y += 1) {
    source.pixels.copy(
      target.pixels,
      ((dy + y) * target.width + dx) * 4,
      y * source.width * 4,
      (y + 1) * source.width * 4,
    );
  }
}

const sheet = surface(COLUMNS * FRAME, Math.ceil(FRAME_COUNT / COLUMNS) * FRAME);
for (let index = 0; index < FRAME_COUNT; index += 1) {
  blit(sheet, frameAt(index), (index % COLUMNS) * FRAME, Math.floor(index / COLUMNS) * FRAME);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, encodePngRgba(sheet.width, sheet.height, sheet.pixels));
