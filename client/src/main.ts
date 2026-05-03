import Phaser from 'phaser';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { BootScene } from './scenes/boot-scene.js';
import { LobbyScene } from './scenes/lobby-scene.js';
import { GameScene } from './scenes/game-scene.js';
import { ResultsScene } from './scenes/results-scene.js';
import { TilePickerScene } from './scenes/tile-picker-scene.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './ui/layout.js';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  parent: 'game-container',
  pixelArt: true,
  roundPixels: true,
  // Right-click throws grenades, so we never want the browser context menu.
  disableContextMenu: true,
  scale: {
    mode: Phaser.Scale.FIT,
    // Centering is handled by the flex parent (#game-container in
    // index.html). Phaser's CENTER_BOTH adds explicit margin-left/top
    // on the canvas, which compounds with flex centering and shifts
    // the canvas right/down when the viewport aspect doesn't match
    // the canvas aspect.
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  // Enables this.add.dom(...), which lets scenes mount real HTML
  // elements (e.g. a transparent <input> over the nickname box so
  // mobile virtual keyboards appear on tap).
  dom: {
    createContainer: true,
  },
  backgroundColor: cssHex(Wasteland.CANVAS_BG),
  scene: [BootScene, LobbyScene, GameScene, ResultsScene, TilePickerScene],
};

const game = new Phaser.Game(config);

// Expose the Phaser game on window for Playwright E2E inspection (hooking
// scene input to verify touch events propagate). Harmless in production.
(window as unknown as { game: Phaser.Game }).game = game;

export default game;
