import Phaser from 'phaser';

export interface ParallaxLayerConfig {
  textureKey: string;
  /** Drift speed in px/sec. Positive = leftward (texture scrolls left). */
  pxPerSec: number;
  /** Top y in scene coords. */
  y: number;
  /** Layer height. Default: texture native height. */
  height?: number;
  /** Layer width. Default: camera width. */
  width?: number;
  alpha?: number;
  tint?: number;
  depth?: number;
}

// Manages N tiled TileSprite layers, each drifting horizontally at its own
// speed. Snaps drift to integer pixels to avoid sub-pixel sampling artifacts
// on the pixel-art canvas (image-rendering: pixelated). Auto-cleans up on
// scene SHUTDOWN.
export class ParallaxBackdrop {
  private readonly scene: Phaser.Scene;
  private readonly layers: Array<{
    sprite: Phaser.GameObjects.TileSprite;
    pxPerSec: number;
  }> = [];
  private elapsed = 0;

  constructor(scene: Phaser.Scene, configs: ParallaxLayerConfig[]) {
    this.scene = scene;

    const camWidth = scene.cameras.main.width;
    for (const cfg of configs) {
      const tex = scene.textures.get(cfg.textureKey);
      const source = tex.source[0];
      const nativeH = source?.height ?? 64;
      const sprite = scene.add
        .tileSprite(
          0,
          cfg.y,
          cfg.width ?? camWidth,
          cfg.height ?? nativeH,
          cfg.textureKey,
        )
        .setOrigin(0, 0);
      if (cfg.depth !== undefined) sprite.setDepth(cfg.depth);
      if (cfg.alpha !== undefined) sprite.setAlpha(cfg.alpha);
      if (cfg.tint !== undefined) sprite.setTint(cfg.tint);
      this.layers.push({ sprite, pxPerSec: cfg.pxPerSec });
    }

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.handleUpdate, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  private handleUpdate = (_time: number, delta: number): void => {
    this.elapsed += delta;
    for (const layer of this.layers) {
      // Integer snap — sub-pixel TileSprite scrolling causes visible flicker
      // when the canvas uses image-rendering: pixelated and the texture has
      // sharp 1px features.
      layer.sprite.tilePositionX = Math.floor(
        (this.elapsed * layer.pxPerSec) / 1000,
      );
    }
  };

  getLayer(index: number): Phaser.GameObjects.TileSprite | null {
    return this.layers[index]?.sprite ?? null;
  }

  setLayerTint(index: number, tint: number | null): void {
    const sprite = this.layers[index]?.sprite;
    if (!sprite) return;
    if (tint === null) sprite.clearTint();
    else sprite.setTint(tint);
  }

  setLayerAlpha(index: number, alpha: number): void {
    this.layers[index]?.sprite.setAlpha(alpha);
  }

  destroy(): void {
    this.scene.events.off(
      Phaser.Scenes.Events.UPDATE,
      this.handleUpdate,
      this,
    );
    for (const layer of this.layers) {
      layer.sprite.destroy();
    }
    this.layers.length = 0;
  }
}
