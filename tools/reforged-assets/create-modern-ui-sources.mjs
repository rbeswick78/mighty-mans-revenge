import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const OUT_DIR = resolve('art/reforged/sources/modern-ui');
const CHROME_SIZE = 64;
const ICON_SIZE = 32;

const COLORS = Object.freeze({
  transparent: [0, 0, 0, 0],
  canvas: [9, 13, 20, 255],
  surface: [18, 26, 38, 255],
  raised: [27, 41, 56, 255],
  border: [50, 72, 93, 255],
  borderSoft: [39, 57, 75, 255],
  bone: [243, 240, 223, 255],
  muted: [158, 175, 189, 255],
  teal: [114, 214, 201, 255],
  tealDark: [43, 116, 116, 255],
  amber: [255, 138, 61, 255],
  amberHot: [255, 177, 92, 255],
  red: [232, 59, 59, 255],
  redDark: [105, 32, 38, 255],
  disabled: [54, 65, 75, 255],
});

function surface(width, height) {
  return { width, height, pixels: Buffer.alloc(width * height * 4) };
}

function put(target, x, y, color) {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return;
  const offset = (y * target.width + x) * 4;
  target.pixels.set(color, offset);
}

function fillRect(target, x, y, width, height, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) put(target, px, py, color);
  }
}

function line(target, x0, y0, x1, y1, color, thickness = 1) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    const half = Math.floor(thickness / 2);
    fillRect(target, x - half, y - half, thickness, thickness, color);
    if (x === x1 && y === y1) break;
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

function strokeCircle(target, cx, cy, radius, color, thickness = 1) {
  const outer = radius * radius;
  const inner = Math.max(0, radius - thickness) ** 2;
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const d = x * x + y * y;
      if (d <= outer && d >= inner) put(target, cx + x, cy + y, color);
    }
  }
}

function fillCircle(target, cx, cy, radius, color) {
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      if (x * x + y * y <= radius * radius) put(target, cx + x, cy + y, color);
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

function chamferedRect(target, x, y, width, height, cut, fill, border, inner = null) {
  const points = [
    [x + cut, y],
    [x + width - cut - 1, y],
    [x + width - 1, y + cut],
    [x + width - 1, y + height - cut - 1],
    [x + width - cut - 1, y + height - 1],
    [x + cut, y + height - 1],
    [x, y + height - cut - 1],
    [x, y + cut],
  ];
  fillPolygon(target, points, border);
  const inset = 3;
  const innerPoints = [
    [x + cut + inset, y + inset],
    [x + width - cut - inset - 1, y + inset],
    [x + width - inset - 1, y + cut + inset],
    [x + width - inset - 1, y + height - cut - inset - 1],
    [x + width - cut - inset - 1, y + height - inset - 1],
    [x + cut + inset, y + height - inset - 1],
    [x + inset, y + height - cut - inset - 1],
    [x + inset, y + cut + inset],
  ];
  fillPolygon(target, innerPoints, fill);
  if (inner) {
    line(target, x + 8, y + 5, x + width - 9, y + 5, inner, 1);
    line(target, x + 5, y + 8, x + 5, y + height - 9, inner, 1);
  }
}

function drawWear(target, ox, oy, color) {
  line(target, ox + 11, oy + 52, ox + 21, oy + 52, color);
  line(target, ox + 45, oy + 10, ox + 52, oy + 10, color);
  put(target, ox + 24, oy + 11, color);
  put(target, ox + 42, oy + 51, color);
}

function drawChromeFrame(target, index, spec) {
  const ox = (index % 8) * CHROME_SIZE;
  const oy = Math.floor(index / 8) * CHROME_SIZE;
  chamferedRect(
    target,
    ox + 1,
    oy + 1 + (spec.pressed ? 3 : 0),
    62,
    62 - (spec.pressed ? 3 : 0),
    spec.cut ?? 6,
    spec.fill,
    spec.border,
    spec.inner ?? COLORS.borderSoft,
  );
  if (spec.focus) {
    chamferedRect(
      target,
      ox + 5,
      oy + 5 + (spec.pressed ? 3 : 0),
      54,
      54 - (spec.pressed ? 3 : 0),
      4,
      spec.fill,
      COLORS.teal,
    );
  }
  drawWear(target, ox, oy + (spec.pressed ? 3 : 0), spec.wear ?? COLORS.borderSoft);
  if (spec.disabled) {
    for (let y = oy + 8; y < oy + 56; y += 6) {
      line(target, ox + 8, y, ox + 55, y, [9, 13, 20, 70]);
    }
  }
}

function makeChromeSheet() {
  const target = surface(CHROME_SIZE * 8, CHROME_SIZE * 4);
  const specs = [
    { fill: COLORS.surface, border: COLORS.border, inner: COLORS.tealDark, cut: 7 },
    { fill: COLORS.surface, border: COLORS.tealDark, inner: COLORS.teal, cut: 7 },
    { fill: COLORS.raised, border: COLORS.amber, inner: COLORS.amberHot, cut: 8 },
    { fill: COLORS.canvas, border: COLORS.teal, inner: COLORS.border, cut: 8 },
    { fill: COLORS.surface, border: COLORS.border },
    { fill: COLORS.raised, border: COLORS.teal, inner: COLORS.teal, focus: true },
    { fill: COLORS.amber, border: COLORS.amberHot, inner: COLORS.bone },
    { fill: COLORS.amberHot, border: COLORS.bone, inner: COLORS.amber, pressed: true },
    { fill: COLORS.disabled, border: COLORS.borderSoft, disabled: true },
    { fill: COLORS.canvas, border: COLORS.border },
    { fill: COLORS.raised, border: COLORS.teal, inner: COLORS.teal, focus: true },
    { fill: COLORS.raised, border: COLORS.amber, inner: COLORS.amberHot },
    { fill: COLORS.amber, border: COLORS.amberHot, inner: COLORS.bone, pressed: true },
    { fill: COLORS.disabled, border: COLORS.borderSoft, disabled: true },
    { fill: COLORS.surface, border: COLORS.border },
    { fill: COLORS.raised, border: COLORS.teal, inner: COLORS.teal, focus: true },
    { fill: COLORS.raised, border: COLORS.amber, inner: COLORS.amberHot, pressed: true },
    { fill: COLORS.disabled, border: COLORS.borderSoft, disabled: true },
    { fill: COLORS.amber, border: COLORS.amberHot, inner: COLORS.bone },
    { fill: COLORS.amberHot, border: COLORS.teal, inner: COLORS.bone, focus: true },
    { fill: COLORS.amberHot, border: COLORS.bone, inner: COLORS.amber, pressed: true },
    { fill: COLORS.disabled, border: COLORS.borderSoft, disabled: true },
    { fill: COLORS.redDark, border: COLORS.red, inner: COLORS.amber },
    { fill: COLORS.redDark, border: COLORS.teal, inner: COLORS.red, focus: true },
    { fill: COLORS.red, border: COLORS.bone, inner: COLORS.redDark, pressed: true },
    { fill: COLORS.disabled, border: COLORS.borderSoft, disabled: true },
    { fill: COLORS.surface, border: COLORS.teal, inner: COLORS.amber },
    { fill: COLORS.surface, border: COLORS.amber, inner: COLORS.teal },
    { fill: COLORS.canvas, border: COLORS.amber, inner: COLORS.teal },
    { fill: COLORS.canvas, border: COLORS.teal, inner: COLORS.bone, focus: true },
    { fill: COLORS.redDark, border: COLORS.red, inner: COLORS.amber },
    { fill: COLORS.surface, border: COLORS.border, inner: COLORS.borderSoft },
  ];
  specs.forEach((spec, index) => drawChromeFrame(target, index, spec));
  return target;
}

function iconCell(target, index, draw) {
  const ox = index * ICON_SIZE;
  draw(ox, 0);
}

function makeIconSheet() {
  const target = surface(ICON_SIZE * 16, ICON_SIZE);
  const c = COLORS.bone;
  const teal = COLORS.teal;
  const amber = COLORS.amberHot;
  iconCell(target, 0, (x) => {
    strokeCircle(target, x + 16, 16, 9, teal, 2);
    line(target, x + 16, 4, x + 16, 11, c, 2);
    line(target, x + 16, 21, x + 16, 28, c, 2);
    line(target, x + 4, 16, x + 11, 16, c, 2);
    line(target, x + 21, 16, x + 28, 16, c, 2);
  });
  iconCell(target, 1, (x) => {
    fillCircle(target, x + 16, 10, 5, amber);
    fillPolygon(
      target,
      [
        [x + 7, 27],
        [x + 9, 17],
        [x + 16, 14],
        [x + 23, 17],
        [x + 25, 27],
      ],
      teal,
    );
  });
  iconCell(target, 2, (x) => {
    line(target, x + 9, 5, x + 9, 28, c, 3);
    fillPolygon(
      target,
      [
        [x + 11, 6],
        [x + 25, 10],
        [x + 11, 16],
      ],
      amber,
    );
    line(target, x + 5, 28, x + 14, 28, teal, 2);
  });
  iconCell(target, 3, (x) => {
    fillRect(target, x + 6, 19, 4, 9, teal);
    fillRect(target, x + 14, 13, 4, 15, amber);
    fillRect(target, x + 22, 6, 4, 22, c);
  });
  iconCell(target, 4, (x) => {
    strokeCircle(target, x + 16, 16, 8, c, 3);
    fillCircle(target, x + 16, 16, 3, teal);
    for (const angle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      line(
        target,
        x + 16 + Math.round(Math.cos(angle) * 10),
        16 + Math.round(Math.sin(angle) * 10),
        x + 16 + Math.round(Math.cos(angle) * 14),
        16 + Math.round(Math.sin(angle) * 14),
        amber,
        3,
      );
    }
  });
  iconCell(target, 5, (x) => {
    for (const [cx, cy] of [
      [10, 10],
      [22, 10],
      [16, 22],
    ])
      fillCircle(target, x + cx, cy, 4, teal);
    line(target, x + 12, 12, x + 15, 19, c, 2);
    line(target, x + 20, 12, x + 17, 19, c, 2);
  });
  iconCell(target, 6, (x) => {
    strokeCircle(target, x + 16, 16, 11, amber, 2);
    line(target, x + 16, 16, x + 16, 8, c, 2);
    line(target, x + 16, 16, x + 23, 19, c, 2);
  });
  iconCell(target, 7, (x) => {
    fillRect(target, x + 5, 6, 22, 20, COLORS.border);
    line(target, x + 7, 23, x + 24, 8, teal, 2);
    fillPolygon(
      target,
      [
        [x + 17, 7],
        [x + 22, 15],
        [x + 16, 14],
      ],
      amber,
    );
  });
  iconCell(target, 8, (x) => {
    chamferedRect(target, x + 4, 8, 24, 16, 3, COLORS.surface, teal);
    fillRect(target, x + 8, 12, 8, 3, amber);
    fillRect(target, x + 8, 18, 15, 2, c);
  });
  iconCell(target, 9, (x) => {
    fillPolygon(
      target,
      [
        [x + 16, 4],
        [x + 20, 12],
        [x + 29, 13],
        [x + 22, 19],
        [x + 24, 28],
        [x + 16, 23],
        [x + 8, 28],
        [x + 10, 19],
        [x + 3, 13],
        [x + 12, 12],
      ],
      amber,
    );
    fillCircle(target, x + 16, 16, 4, COLORS.surface);
  });
  iconCell(target, 10, (x) => {
    fillRect(target, x + 13, 5, 6, 22, teal);
    fillRect(target, x + 5, 13, 22, 6, teal);
  });
  iconCell(target, 11, (x) =>
    fillPolygon(
      target,
      [
        [x + 7, 6],
        [x + 25, 6],
        [x + 23, 20],
        [x + 16, 28],
        [x + 9, 20],
      ],
      [77, 155, 230, 255],
    ),
  );
  iconCell(target, 12, (x) => {
    for (const bx of [8, 14, 20]) {
      fillRect(target, x + bx, 7, 4, 17, amber);
      fillPolygon(
        target,
        [
          [x + bx, 7],
          [x + bx + 2, 3],
          [x + bx + 4, 7],
        ],
        c,
      );
    }
  });
  iconCell(target, 13, (x) => {
    fillPolygon(
      target,
      [
        [x + 16, 3],
        [x + 27, 16],
        [x + 16, 29],
        [x + 5, 16],
      ],
      teal,
    );
    fillCircle(target, x + 16, 16, 4, amber);
  });
  iconCell(target, 14, (x) => {
    strokeCircle(target, x + 16, 16, 10, teal, 3);
    strokeCircle(target, x + 16, 16, 5, c, 2);
  });
  iconCell(target, 15, (x) => {
    fillPolygon(
      target,
      [
        [x + 16, 3],
        [x + 29, 28],
        [x + 3, 28],
      ],
      COLORS.red,
    );
    fillRect(target, x + 14, 10, 4, 10, c);
    fillRect(target, x + 14, 23, 4, 3, c);
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

function writePng(path, target) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(target));
}

writePng(resolve(OUT_DIR, 'chrome-states.png'), makeChromeSheet());
writePng(resolve(OUT_DIR, 'icon-language.png'), makeIconSheet());
process.stdout.write(`Generated deterministic modern UI sources in ${OUT_DIR}\n`);
