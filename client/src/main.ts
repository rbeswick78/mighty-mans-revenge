import Phaser from 'phaser';
import { BootScene } from './scenes/boot-scene.js';
import { LobbyScene } from './scenes/lobby-scene.js';
import { GameScene } from './scenes/game-scene.js';
import { ResultsScene } from './scenes/results-scene.js';
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
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  backgroundColor: '#1a1a2e',
  scene: [BootScene, LobbyScene, GameScene, ResultsScene],
};

const game = new Phaser.Game(config);
export default game;
