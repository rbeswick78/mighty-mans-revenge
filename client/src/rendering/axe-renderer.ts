import Phaser from 'phaser';
import type { AxeState } from '@shared/types/projectile.js';
import { bucketAimAngle, type Direction4 } from './sprite-direction.js';

const SPRITE_SCALE = 3;
const AXE_DEPTH = 50;
/** How long the landed axe still lies on the floor before fading out. */
const LANDED_LINGER_MS = 900;
const LANDED_FADE_MS = 500;

/**
 * Renders Jack's thrown axes. Flight sprites mirror the server's
 * authoritative in-flight list each frame (same contract as
 * GrenadeRenderer): spinning `axe_*_thrown` loops picked by flight
 * direction (the pack's vertical sheet covers both up and down).
 *
 * Landing is NOT frame-driven: the whole flight can span a single server
 * snapshot (point-blank wall throw), which bursty message delivery can
 * overwrite before a render frame ever samples it. GameScene therefore
 * drives playLandingAt from the NetworkManager's per-message 'axeResolved'
 * event, which can't be swallowed. Purely cosmetic — damage is
 * server-authoritative.
 */
export class AxeRenderer {
  private scene: Phaser.Scene;
  private sprites: Map<string, Phaser.GameObjects.Sprite> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  updateAxes(axes: AxeState[]): void {
    const currentIds = new Set<string>();

    for (const axe of axes) {
      currentIds.add(axe.id);

      let sprite = this.sprites.get(axe.id);
      if (!sprite) {
        const direction = bucketAimAngle(axe.angle);
        sprite = this.scene.add.sprite(
          axe.position.x,
          axe.position.y,
          this.thrownKey(direction),
        );
        sprite.setOrigin(0.5, 0.5);
        sprite.setScale(SPRITE_SCALE);
        sprite.setDepth(AXE_DEPTH);
        sprite.play(this.thrownKey(direction));
        this.sprites.set(axe.id, sprite);
      }

      sprite.setPosition(axe.position.x, axe.position.y);
    }

    // Landing FX is event-driven (see class doc) — just drop the sprite.
    for (const [id, sprite] of this.sprites) {
      if (!currentIds.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
  }

  /** The vertical thrown sheet covers both up and down flight. */
  private thrownKey(direction: Direction4): string {
    if (direction === 'up' || direction === 'down') return 'axe_vertical_thrown';
    return `axe_${direction}_thrown`;
  }

  /**
   * One-shot landing animation at the axe's final position, then the
   * landed still lingers and fades. Fire-and-forget — these sprites own
   * their own teardown. Called from GameScene's 'axeResolved' handler.
   */
  playLandingAt(x: number, y: number, angle: number): void {
    const direction = bucketAimAngle(angle);
    const landing = this.scene.add.sprite(x, y, `axe_${direction}_landing`);
    landing.setOrigin(0.5, 0.5);
    landing.setScale(SPRITE_SCALE);
    landing.setDepth(AXE_DEPTH);
    landing.play(`axe_${direction}_landing`);
    landing.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      landing.destroy();
      const landed = this.scene.add.image(x, y, `axe_${direction}_landed`);
      landed.setOrigin(0.5, 0.5);
      landed.setScale(SPRITE_SCALE);
      landed.setDepth(AXE_DEPTH - 1);
      this.scene.tweens.add({
        targets: landed,
        alpha: 0,
        delay: LANDED_LINGER_MS,
        duration: LANDED_FADE_MS,
        onComplete: () => landed.destroy(),
      });
    });
  }

  destroy(): void {
    for (const sprite of this.sprites.values()) {
      sprite.destroy();
    }
    this.sprites.clear();
  }
}
