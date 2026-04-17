import Phaser from 'phaser';
import { GUN, GRENADE as GRENADE_CONFIG } from '@shared/config/game.js';

const FONT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '14px',
  color: '#ffffff',
};

const LARGE_FONT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '48px',
  color: '#ffffff',
  fontStyle: 'bold',
  align: 'center',
};

interface KillFeedItem {
  text: Phaser.GameObjects.Text;
  timer: Phaser.Time.TimerEvent;
}

function healthColor(ratio: number): number {
  if (ratio > 0.6) return 0x00ff00;
  if (ratio > 0.3) return 0xffff00;
  return 0xff0000;
}

export class HUD {
  private scene: Phaser.Scene;

  // Health bar (bottom-left)
  private healthBarBg: Phaser.GameObjects.Rectangle;
  private healthBarFg: Phaser.GameObjects.Rectangle;
  private healthText: Phaser.GameObjects.Text;

  // Ammo (bottom-left, below health)
  private ammoText: Phaser.GameObjects.Text;
  private reloadingText: Phaser.GameObjects.Text;

  // Grenades (bottom-left, below ammo)
  private grenadeText: Phaser.GameObjects.Text;

  // Stamina bar (below health bar)
  private staminaBarBg: Phaser.GameObjects.Rectangle;
  private staminaBarFg: Phaser.GameObjects.Rectangle;

  // Score (top-center)
  private scoreText: Phaser.GameObjects.Text;

  // Timer (top-center, below score)
  private timerText: Phaser.GameObjects.Text;

  // Kill feed (top-right)
  private killFeedEntries: KillFeedItem[] = [];
  private killFeedContainer: Phaser.GameObjects.Container;

  // Countdown
  private countdownText: Phaser.GameObjects.Text;

  // Death overlay (shown while the local player is dead)
  private deathOverlay: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const { width, height } = scene.scale;
    const margin = 16;

    // --- Health bar: bottom-left ---
    // Stack of: health bar, stamina bar, ammo, grenades — 4 rows need to
    // fit above the bottom edge. Reserve ~90px so the grenade row isn't
    // clipped off the canvas.
    const hbX = margin;
    const hbY = height - 90;
    const hbW = 200;
    const hbH = 20;

    this.healthBarBg = scene.add.rectangle(hbX, hbY, hbW, hbH, 0x333333);
    this.healthBarBg.setOrigin(0, 0);
    this.healthBarBg.setScrollFactor(0);
    this.healthBarBg.setDepth(1000);

    this.healthBarFg = scene.add.rectangle(hbX, hbY, hbW, hbH, 0x00ff00);
    this.healthBarFg.setOrigin(0, 0);
    this.healthBarFg.setScrollFactor(0);
    this.healthBarFg.setDepth(1001);

    this.healthText = scene.add.text(hbX + hbW / 2, hbY + hbH / 2, '100', {
      ...FONT_STYLE,
      fontSize: '12px',
      color: '#000000',
      fontStyle: 'bold',
    });
    this.healthText.setOrigin(0.5, 0.5);
    this.healthText.setScrollFactor(0);
    this.healthText.setDepth(1002);

    // --- Stamina bar: just below health ---
    const stY = hbY + hbH + 4;
    const stH = 6;

    this.staminaBarBg = scene.add.rectangle(hbX, stY, hbW, stH, 0x333333);
    this.staminaBarBg.setOrigin(0, 0);
    this.staminaBarBg.setScrollFactor(0);
    this.staminaBarBg.setDepth(1000);

    this.staminaBarFg = scene.add.rectangle(hbX, stY, hbW, stH, 0x3399ff);
    this.staminaBarFg.setOrigin(0, 0);
    this.staminaBarFg.setScrollFactor(0);
    this.staminaBarFg.setDepth(1001);

    // --- Ammo: below stamina ---
    const ammoY = stY + stH + 8;
    this.ammoText = scene.add.text(hbX, ammoY, `${GUN.MAGAZINE_SIZE} / ${GUN.MAGAZINE_SIZE}`, {
      ...FONT_STYLE,
    });
    this.ammoText.setScrollFactor(0);
    this.ammoText.setDepth(1000);

    this.reloadingText = scene.add.text(hbX + 80, ammoY, 'RELOADING', {
      ...FONT_STYLE,
      color: '#ffaa00',
    });
    this.reloadingText.setScrollFactor(0);
    this.reloadingText.setDepth(1000);
    this.reloadingText.setVisible(false);

    // --- Grenades: below ammo ---
    const grenadeY = ammoY + 20;
    this.grenadeText = scene.add.text(hbX, grenadeY, `GRN: ${GRENADE_CONFIG.MAX_CARRY}`, {
      ...FONT_STYLE,
    });
    this.grenadeText.setScrollFactor(0);
    this.grenadeText.setDepth(1000);

    // --- Score: top-center ---
    this.scoreText = scene.add.text(width / 2, margin, 'YOU: 0 | ENEMY: 0', {
      ...FONT_STYLE,
      fontSize: '16px',
      fontStyle: 'bold',
    });
    this.scoreText.setOrigin(0.5, 0);
    this.scoreText.setScrollFactor(0);
    this.scoreText.setDepth(1000);

    // --- Timer: below score ---
    this.timerText = scene.add.text(width / 2, margin + 24, '5:00', {
      ...FONT_STYLE,
      fontSize: '14px',
    });
    this.timerText.setOrigin(0.5, 0);
    this.timerText.setScrollFactor(0);
    this.timerText.setDepth(1000);

    // --- Kill feed container: top-right ---
    this.killFeedContainer = scene.add.container(width - margin, margin + 50);
    this.killFeedContainer.setScrollFactor(0);
    this.killFeedContainer.setDepth(1000);

    // --- Countdown: center ---
    this.countdownText = scene.add.text(width / 2, height / 2, '', {
      ...LARGE_FONT_STYLE,
    });
    this.countdownText.setOrigin(0.5, 0.5);
    this.countdownText.setScrollFactor(0);
    this.countdownText.setDepth(2000);
    this.countdownText.setVisible(false);

    // --- Death overlay: center ---
    this.deathOverlay = scene.add.text(width / 2, height / 2, '', {
      ...LARGE_FONT_STYLE,
      color: '#ff3333',
      fontSize: '36px',
    });
    this.deathOverlay.setOrigin(0.5, 0.5);
    this.deathOverlay.setScrollFactor(0);
    this.deathOverlay.setDepth(2000);
    this.deathOverlay.setVisible(false);
  }

  updateHealth(current: number, max: number): void {
    const ratio = Math.max(0, Math.min(1, current / max));
    const fullWidth = 200;
    this.healthBarFg.setSize(fullWidth * ratio, 20);
    this.healthBarFg.setFillStyle(healthColor(ratio));
    this.healthText.setText(`${Math.ceil(current)}`);
  }

  updateAmmo(current: number, max: number, isReloading: boolean): void {
    this.ammoText.setText(`${current} / ${max}`);
    this.reloadingText.setVisible(isReloading);
  }

  /** Show "YOU DIED" with a respawn countdown, or hide it when alive. */
  updateDeathState(isDead: boolean, respawnSecondsRemaining: number): void {
    if (!isDead) {
      this.deathOverlay.setVisible(false);
      return;
    }
    const seconds = Math.max(0, Math.ceil(respawnSecondsRemaining));
    this.deathOverlay.setText(`YOU DIED\nRESPAWN IN ${seconds}`);
    this.deathOverlay.setVisible(true);
  }

  updateGrenades(count: number): void {
    this.grenadeText.setText(`GRN: ${count}`);
  }

  updateStamina(current: number, max: number): void {
    const ratio = Math.max(0, Math.min(1, current / max));
    this.staminaBarFg.setSize(200 * ratio, 6);
  }

  updateScores(localScore: number, opponentScore: number): void {
    this.scoreText.setText(`YOU: ${localScore} | ENEMY: ${opponentScore}`);
  }

  updateTimer(secondsRemaining: number): void {
    const mins = Math.floor(secondsRemaining / 60);
    const secs = Math.floor(secondsRemaining % 60);
    this.timerText.setText(`${mins}:${secs.toString().padStart(2, '0')}`);
  }

  addKillFeedEntry(killerName: string, victimName: string, weapon: string): void {
    const MAX_ENTRIES = 5;

    const text = this.scene.add.text(0, 0, `${killerName} [${weapon}] ${victimName}`, {
      ...FONT_STYLE,
      fontSize: '12px',
    });
    text.setOrigin(1, 0);

    this.killFeedContainer.add(text);

    const timer = this.scene.time.delayedCall(3000, () => {
      this.removeKillFeedEntry(text);
    });

    this.killFeedEntries.push({ text, timer });

    // Keep only MAX_ENTRIES
    while (this.killFeedEntries.length > MAX_ENTRIES) {
      const oldest = this.killFeedEntries.shift();
      if (oldest) {
        oldest.timer.remove();
        oldest.text.destroy();
      }
    }

    this.layoutKillFeed();
  }

  private removeKillFeedEntry(text: Phaser.GameObjects.Text): void {
    const index = this.killFeedEntries.findIndex((e) => e.text === text);
    if (index !== -1) {
      this.killFeedEntries.splice(index, 1);
      text.destroy();
      this.layoutKillFeed();
    }
  }

  private layoutKillFeed(): void {
    for (let i = 0; i < this.killFeedEntries.length; i++) {
      this.killFeedEntries[i].text.setY(i * 18);
    }
  }

  showCountdown(value: number): void {
    const label = value > 0 ? `${value}` : 'FIGHT!';
    this.countdownText.setText(label);
    this.countdownText.setVisible(true);
    this.countdownText.setScale(1.5);
    this.countdownText.setAlpha(1);

    this.scene.tweens.add({
      targets: this.countdownText,
      scaleX: 1,
      scaleY: 1,
      alpha: 0,
      duration: 800,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.countdownText.setVisible(false);
      },
    });
  }

  destroy(): void {
    this.healthBarBg.destroy();
    this.healthBarFg.destroy();
    this.healthText.destroy();
    this.staminaBarBg.destroy();
    this.staminaBarFg.destroy();
    this.ammoText.destroy();
    this.reloadingText.destroy();
    this.grenadeText.destroy();
    this.scoreText.destroy();
    this.timerText.destroy();
    this.countdownText.destroy();
    this.deathOverlay.destroy();
    for (const entry of this.killFeedEntries) {
      entry.timer.remove();
      entry.text.destroy();
    }
    this.killFeedEntries = [];
    this.killFeedContainer.destroy();
  }
}
