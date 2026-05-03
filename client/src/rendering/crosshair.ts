import Phaser from 'phaser';

/**
 * Depth above HUD (which is around 1000) so the crosshair is never
 * occluded by score/health/etc. Below the disconnect overlay (depth 2000).
 */
const CROSSHAIR_DEPTH = 1500;

/** Soften slightly so the bullseye doesn't dominate the playfield. */
const CROSSHAIR_ALPHA = 0.85;

/**
 * Bullseye cursor that follows the mouse pointer over the gameboard.
 * Pinned at scrollFactor 0 so camera kick/zoom/roll don't drag it; it
 * tracks input position in screen-space, exactly like a native cursor.
 */
export class Crosshair {
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Image;
  private canvasEnterHandler: () => void;
  private canvasLeaveHandler: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.sprite = scene.add.image(0, 0, 'crosshair');
    this.sprite.setScrollFactor(0);
    this.sprite.setDepth(CROSSHAIR_DEPTH);
    this.sprite.setAlpha(CROSSHAIR_ALPHA);
    this.sprite.setVisible(false);

    // Hide the OS cursor while the pointer is over the canvas — the
    // bullseye replaces it. Restored in destroy().
    scene.input.setDefaultCursor('none');

    // Show/hide the crosshair as the mouse enters/leaves the canvas, so
    // the OS cursor reappears naturally outside the play area (browser
    // chrome, dev tools, etc.).
    const canvas = scene.game.canvas;
    this.canvasEnterHandler = () => this.sprite.setVisible(true);
    this.canvasLeaveHandler = () => this.sprite.setVisible(false);
    canvas.addEventListener('mouseenter', this.canvasEnterHandler);
    canvas.addEventListener('mouseleave', this.canvasLeaveHandler);
  }

  update(): void {
    const pointer = this.scene.input.activePointer;
    this.sprite.setPosition(pointer.x, pointer.y);
  }

  destroy(): void {
    const canvas = this.scene.game.canvas;
    canvas.removeEventListener('mouseenter', this.canvasEnterHandler);
    canvas.removeEventListener('mouseleave', this.canvasLeaveHandler);
    this.scene.input.setDefaultCursor('default');
    this.sprite.destroy();
  }
}
