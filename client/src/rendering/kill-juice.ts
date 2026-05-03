import Phaser from 'phaser';

const FLASH_COLOR = 0xffffff;
const FLASH_ALPHA = 0.55;
const FLASH_DURATION_MS = 120;
const FREEZE_DURATION_MS = 50;

// Above the lighting overlay (100) so the flash isn't dimmed, below the
// existing death overlay/countdown text at 2000.
const KILL_JUICE_DEPTH = 1900;

/**
 * Kill juice: brief screen-wide white flash + tween/animation freeze on any
 * player death. Trigger once per kill — caller (GameScene) detects the
 * isDead transition false→true.
 *
 * Freeze pauses tweens and animations only; the scene update loop and
 * networking continue running so client prediction stays in sync with the
 * server.
 */
export class KillJuice {
  private scene: Phaser.Scene;
  private isFrozen = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  trigger(): void {
    this.flash();
    this.freeze();
  }

  private flash(): void {
    const cam = this.scene.cameras.main;
    const flash = this.scene.add.rectangle(
      0,
      0,
      cam.width,
      cam.height,
      FLASH_COLOR,
      FLASH_ALPHA,
    );
    flash.setOrigin(0, 0);
    flash.setScrollFactor(0);
    flash.setDepth(KILL_JUICE_DEPTH);
    // Tweens run on the scene's tweens manager — when freeze() sets its
    // timeScale to 0, the alpha hold-then-fade lines up automatically with
    // the freeze: the flash holds at full alpha during the freeze, then
    // fades after.
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: FLASH_DURATION_MS,
      onComplete: () => flash.destroy(),
    });
  }

  private freeze(): void {
    if (this.isFrozen) return;
    this.isFrozen = true;
    const prevTweenScale = this.scene.tweens.timeScale;
    const prevAnimScale = this.scene.anims.globalTimeScale;
    this.scene.tweens.timeScale = 0;
    this.scene.anims.globalTimeScale = 0;
    // delayedCall uses the scene Clock, which is independent of tween/anim
    // time scaling — it fires after FREEZE_DURATION_MS of wall-clock time.
    this.scene.time.delayedCall(FREEZE_DURATION_MS, () => {
      this.scene.tweens.timeScale = prevTweenScale;
      this.scene.anims.globalTimeScale = prevAnimScale;
      this.isFrozen = false;
    });
  }

  destroy(): void {
    if (this.isFrozen) {
      this.scene.tweens.timeScale = 1;
      this.scene.anims.globalTimeScale = 1;
      this.isFrozen = false;
    }
  }
}
