import Phaser from 'phaser';
import { Wasteland, cssHex } from '@shared/config/palette.js';

// --- Tile picker config (TUNABLE) ---
// Renders an entire tileset with frame indices labeled on every cell so
// the user can identify exact frames to plug into map-renderer.ts.
//
// Access: `?tilepicker` (defaults to bleak-yellow), `?tilepicker=brick`,
// `?tilepicker=fence`. Add more entries to TILESETS as new sheets are
// loaded in boot-scene.
const DISPLAY_SCALE = 4;        // 1 source px → 4 screen px
const LABEL_FONT_PX = 9;
const TITLE_FONT_PX = 14;

interface TilesetSpec {
  textureKey: string;       // matches the spritesheet key registered in boot-scene
  cols: number;
  rows: number;
  frameWidth: number;       // source-pixel frame width (varies per sheet)
  frameHeight: number;      // source-pixel frame height
  label: string;            // shown in the title strip
}

const TILESETS: Record<string, TilesetSpec> = {
  bleak: {
    textureKey: 'tiles_bleak',
    cols: 24,
    rows: 17,
    frameWidth: 16,
    frameHeight: 16,
    label: 'bleak-yellow',
  },
  brick: {
    textureKey: 'tiles_brick',
    cols: 6,
    rows: 3,
    frameWidth: 16,
    frameHeight: 16,
    label: 'brick-wall',
  },
  fence: {
    textureKey: 'tiles_wire_fence_closing',
    cols: 7,
    rows: 1,
    frameWidth: 21,
    frameHeight: 22,
    label: 'wire-fence (closing, no-lock, 7-frame anim)',
  },
  iron: {
    textureKey: 'tiles_iron_fence',
    cols: 3,
    rows: 4,
    frameWidth: 16,
    frameHeight: 16,
    label: 'iron-fence',
  },
};

const DEFAULT_TILESET_KEY = 'bleak';

export class TilePickerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TilePickerScene' });
  }

  create(): void {
    const param = new URLSearchParams(window.location.search).get('tilepicker') ?? '';
    const spec = TILESETS[param] ?? TILESETS[DEFAULT_TILESET_KEY];

    const cw = this.cameras.main.width;
    const ch = this.cameras.main.height;
    const cellW = spec.frameWidth * DISPLAY_SCALE;
    const cellH = spec.frameHeight * DISPLAY_SCALE;
    const gridWidth = spec.cols * cellW;
    const gridHeight = spec.rows * cellH;
    const originX = Math.floor((cw - gridWidth) / 2);
    const originY = Math.floor((ch - gridHeight) / 2) + 8;

    // Title — names the active sheet so multi-sheet picking isn't confusing.
    this.add.text(
      cw / 2,
      originY - 22,
      `TILE PICKER · ${spec.label} · click/tap to exit`,
      {
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: `${TITLE_FONT_PX}px`,
        color: cssHex(Wasteland.TEXT_PRIMARY),
      },
    ).setOrigin(0.5);

    // Render every frame in a cols×rows grid with its index labeled.
    for (let row = 0; row < spec.rows; row++) {
      for (let col = 0; col < spec.cols; col++) {
        const frame = row * spec.cols + col;
        const x = originX + col * cellW;
        const y = originY + row * cellH;

        // Tile sprite at top-left origin so the label sits cleanly in
        // the bottom-right corner without overlapping the next cell.
        this.add.sprite(x, y, spec.textureKey, frame)
          .setOrigin(0, 0)
          .setScale(DISPLAY_SCALE);

        // Frame index label, white with dark stroke for readability over
        // any tile color.
        this.add.text(x + cellW - 1, y + cellH - 1, String(frame), {
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: `${LABEL_FONT_PX}px`,
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2,
        }).setOrigin(1, 1);
      }
    }

    // Click/tap anywhere to bail back to the lobby.
    this.input.on('pointerdown', () => {
      this.scene.start('LobbyScene');
    });
  }
}
