import Phaser from 'phaser';
import { Wasteland } from '@shared/config/palette.js';

export interface BeveledChromeOpts {
  fillColor: number;
  fillAlpha: number;
  strokeColor: number;
  highlightColor: number;
  shadowColor: number;
}

export interface MenuPanelOpts {
  fillColor?: number;
  fillAlpha?: number;
  strokeColor?: number;
  highlightColor?: number;
  shadowColor?: number;
}

const DEFAULT_OPTS: BeveledChromeOpts = {
  fillColor: Wasteland.HUD_STRIP_BG,
  fillAlpha: 0.85,
  strokeColor: Wasteland.CANVAS_BG,
  highlightColor: Wasteland.TEXT_PRIMARY,
  shadowColor: Wasteland.WALL_LINE,
};

// Draws a square-cornered beveled pixel-art panel into the given Graphics
// at (x, y) with the given dimensions. 2px outer plum stroke, 1px inner
// highlight (top+left), 1px inner shadow (bottom+right), translucent fill.
// Set inverted=true for a pushed-in look (highlight/shadow swap) — used by
// PixelButton in the pressed state.
export function drawBeveledChrome(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: BeveledChromeOpts,
  inverted = false,
): void {
  // Fill interior
  gfx.fillStyle(opts.fillColor, opts.fillAlpha);
  gfx.fillRect(x, y, w, h);

  // 2px outer stroke — drawn as 4 fillRects so corners stay crisp
  gfx.fillStyle(opts.strokeColor, 1);
  gfx.fillRect(x, y, w, 2);              // top
  gfx.fillRect(x, y + h - 2, w, 2);      // bottom
  gfx.fillRect(x, y, 2, h);              // left
  gfx.fillRect(x + w - 2, y, 2, h);      // right

  // 1px highlight and shadow inside the outer stroke
  const hi = inverted ? opts.shadowColor : opts.highlightColor;
  const sh = inverted ? opts.highlightColor : opts.shadowColor;
  const hiAlpha = inverted ? 1 : 0.6;

  // Highlight: inside-top + inside-left
  gfx.fillStyle(hi, hiAlpha);
  gfx.fillRect(x + 2, y + 2, w - 4, 1);          // top inside
  gfx.fillRect(x + 2, y + 2, 1, h - 4);          // left inside

  // Shadow: inside-bottom + inside-right
  gfx.fillStyle(sh, 1);
  gfx.fillRect(x + 2, y + h - 3, w - 4, 1);      // bottom inside
  gfx.fillRect(x + w - 3, y + 2, 1, h - 4);      // right inside
}

// Beveled pixel-art frame container. Lives at scene coords (x, y) with the
// frame's top-left at (0, 0) in container space. Add children with .add()
// and position them in panel-local coords (use centerX/centerY helpers).
export class MenuPanel extends Phaser.GameObjects.Container {
  readonly contentWidth: number;
  readonly contentHeight: number;
  private readonly chrome: Phaser.GameObjects.Graphics;
  private readonly opts: BeveledChromeOpts;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    opts?: MenuPanelOpts,
  ) {
    super(scene, x, y);
    this.contentWidth = width;
    this.contentHeight = height;
    this.opts = {
      ...DEFAULT_OPTS,
      ...(opts ?? {}),
    };

    this.chrome = scene.add.graphics();
    drawBeveledChrome(this.chrome, 0, 0, width, height, this.opts);
    this.add(this.chrome);

    scene.add.existing(this);
  }

  get centerX(): number {
    return this.contentWidth / 2;
  }

  get centerY(): number {
    return this.contentHeight / 2;
  }
}
