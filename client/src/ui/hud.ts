import Phaser from 'phaser';
import { GUN } from '@shared/config/game.js';
import { Wasteland, cssHex, healthColor } from '@shared/config/palette.js';
import { HUD_STRIP_HEIGHT, MAP_HEIGHT_PX, MAP_WIDTH_PX } from './layout.js';

const FONT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '14px',
  color: cssHex(Wasteland.TEXT_PRIMARY),
};

const LARGE_FONT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '48px',
  color: cssHex(Wasteland.TEXT_PRIMARY),
  fontStyle: 'bold',
  align: 'center',
};

interface KillFeedItem {
  text: Phaser.GameObjects.Text;
  timer: Phaser.Time.TimerEvent;
}

export class HUD {
  private scene: Phaser.Scene;

  // Strip chrome (dedicated HUD band below the gameboard)
  private stripBg: Phaser.GameObjects.Rectangle;
  private stripBorder: Phaser.GameObjects.Rectangle;

  // Left column: player stats
  private healthBarBg: Phaser.GameObjects.Rectangle;
  private healthBarFg: Phaser.GameObjects.Rectangle;
  private healthText: Phaser.GameObjects.Text;
  private staminaBarBg: Phaser.GameObjects.Rectangle;
  private staminaBarFg: Phaser.GameObjects.Rectangle;
  private ammoText: Phaser.GameObjects.Text;
  private reloadingText: Phaser.GameObjects.Text;
  private grenadeText: Phaser.GameObjects.Text;

  // Middle column: match state
  private scoreText: Phaser.GameObjects.Text;
  private timerText: Phaser.GameObjects.Text;

  // Right column: kill feed
  private killFeedEntries: KillFeedItem[] = [];
  private killFeedContainer: Phaser.GameObjects.Container;

  // Map-centered overlays
  private countdownText: Phaser.GameObjects.Text;
  private deathOverlay: Phaser.GameObjects.Text;
  private eventBannerText: Phaser.GameObjects.Text;

  // Persistent active-event label, shown next to the timer.
  private activeEventLabel: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Strip occupies the bottom band of the canvas. The gameboard owns
    // the top MAP_HEIGHT_PX pixels; the strip never overlays map tiles.
    const stripTop = MAP_HEIGHT_PX;
    const margin = 16;

    // --- Strip background + 1px top border ---
    this.stripBg = scene.add.rectangle(0, stripTop, MAP_WIDTH_PX, HUD_STRIP_HEIGHT, Wasteland.HUD_STRIP_BG);
    this.stripBg.setOrigin(0, 0);
    this.stripBg.setScrollFactor(0);
    this.stripBg.setDepth(500);

    this.stripBorder = scene.add.rectangle(0, stripTop, MAP_WIDTH_PX, 1, Wasteland.HUD_STRIP_BORDER);
    this.stripBorder.setOrigin(0, 0);
    this.stripBorder.setScrollFactor(0);
    this.stripBorder.setDepth(501);

    // --- Left column: health, stamina, ammo, grenades ---
    const hbX = margin;
    const hbY = stripTop + 16;
    const hbW = 200;
    const hbH = 20;

    this.healthBarBg = scene.add.rectangle(hbX, hbY, hbW, hbH, Wasteland.HEALTH_BAR_BG);
    this.healthBarBg.setOrigin(0, 0);
    this.healthBarBg.setScrollFactor(0);
    this.healthBarBg.setDepth(1000);

    this.healthBarFg = scene.add.rectangle(hbX, hbY, hbW, hbH, Wasteland.HEALTH_GOOD);
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

    const stY = hbY + hbH + 6;
    const stH = 6;

    this.staminaBarBg = scene.add.rectangle(hbX, stY, hbW, stH, Wasteland.STAMINA_BAR_BG);
    this.staminaBarBg.setOrigin(0, 0);
    this.staminaBarBg.setScrollFactor(0);
    this.staminaBarBg.setDepth(1000);

    this.staminaBarFg = scene.add.rectangle(hbX, stY, hbW, stH, Wasteland.STAMINA_FILL);
    this.staminaBarFg.setOrigin(0, 0);
    this.staminaBarFg.setScrollFactor(0);
    this.staminaBarFg.setDepth(1001);

    const ammoY = stY + stH + 10;
    this.ammoText = scene.add.text(hbX, ammoY, `${GUN.MAGAZINE_SIZE} / ${GUN.MAGAZINE_SIZE}`, {
      ...FONT_STYLE,
    });
    this.ammoText.setScrollFactor(0);
    this.ammoText.setDepth(1000);

    this.reloadingText = scene.add.text(hbX + 80, ammoY, 'RELOADING', {
      ...FONT_STYLE,
      color: cssHex(Wasteland.TEXT_RELOAD_WARNING),
    });
    this.reloadingText.setScrollFactor(0);
    this.reloadingText.setDepth(1000);
    this.reloadingText.setVisible(false);

    const grenadeY = ammoY + 22;
    this.grenadeText = scene.add.text(hbX, grenadeY, 'GRN: ready', {
      ...FONT_STYLE,
    });
    this.grenadeText.setScrollFactor(0);
    this.grenadeText.setDepth(1000);

    // --- Middle column: score + timer ---
    const middleX = MAP_WIDTH_PX / 2;
    this.scoreText = scene.add.text(middleX, stripTop + 24, 'YOU: 0 | ENEMY: 0', {
      ...FONT_STYLE,
      fontSize: '18px',
      fontStyle: 'bold',
    });
    this.scoreText.setOrigin(0.5, 0);
    this.scoreText.setScrollFactor(0);
    this.scoreText.setDepth(1000);

    this.timerText = scene.add.text(middleX, stripTop + 58, '5:00', {
      ...FONT_STYLE,
      fontSize: '16px',
    });
    this.timerText.setOrigin(0.5, 0);
    this.timerText.setScrollFactor(0);
    this.timerText.setDepth(1000);

    // Persistent active-event label, sits right under the timer. Hidden
    // until an event activates; never moves, just toggles text + visibility.
    this.activeEventLabel = scene.add.text(middleX, stripTop + 80, '', {
      ...FONT_STYLE,
      fontSize: '14px',
      fontStyle: 'bold',
      color: cssHex(Wasteland.TEXT_RELOAD_WARNING),
    });
    this.activeEventLabel.setOrigin(0.5, 0);
    this.activeEventLabel.setScrollFactor(0);
    this.activeEventLabel.setDepth(1000);
    this.activeEventLabel.setVisible(false);

    // --- Right column: kill feed (right-anchored, stacks downward) ---
    this.killFeedContainer = scene.add.container(MAP_WIDTH_PX - margin, stripTop + 16);
    this.killFeedContainer.setScrollFactor(0);
    this.killFeedContainer.setDepth(1000);

    // --- Map-centered overlays ---
    const mapCenterX = MAP_WIDTH_PX / 2;
    const mapCenterY = MAP_HEIGHT_PX / 2;

    this.countdownText = scene.add.text(mapCenterX, mapCenterY, '', {
      ...LARGE_FONT_STYLE,
    });
    this.countdownText.setOrigin(0.5, 0.5);
    this.countdownText.setScrollFactor(0);
    this.countdownText.setDepth(2000);
    this.countdownText.setVisible(false);

    this.deathOverlay = scene.add.text(mapCenterX, mapCenterY, '', {
      ...LARGE_FONT_STYLE,
      color: cssHex(Wasteland.TEXT_DEATH),
      fontSize: '36px',
    });
    this.deathOverlay.setOrigin(0.5, 0.5);
    this.deathOverlay.setScrollFactor(0);
    this.deathOverlay.setDepth(2000);
    this.deathOverlay.setVisible(false);

    // Final-minute event banner — same scale-fade pattern as the countdown,
    // sits offset above center so it doesn't fight the YOU-DIED overlay.
    this.eventBannerText = scene.add.text(mapCenterX, mapCenterY - 80, '', {
      ...LARGE_FONT_STYLE,
      fontSize: '40px',
    });
    this.eventBannerText.setOrigin(0.5, 0.5);
    this.eventBannerText.setScrollFactor(0);
    this.eventBannerText.setDepth(2000);
    this.eventBannerText.setVisible(false);
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

  /**
   * Show "GRN: LIVE" while a grenade is in flight (right-click will detonate),
   * otherwise show the player's remaining carry count (right-click will throw).
   */
  updateGrenadeStatus(hasActiveGrenade: boolean, count: number): void {
    if (hasActiveGrenade) {
      this.grenadeText.setText('GRN: LIVE');
      this.grenadeText.setColor(cssHex(Wasteland.TEXT_GRENADE_LIVE));
    } else {
      this.grenadeText.setText(`GRN: ${count}`);
      this.grenadeText.setColor(cssHex(Wasteland.TEXT_GRENADE_READY));
    }
  }

  updateStamina(current: number, max: number): void {
    const ratio = Math.max(0, Math.min(1, current / max));
    this.staminaBarFg.setSize(200 * ratio, 6);
  }

  updateScores(
    localName: string,
    localScore: number,
    opponentName: string,
    opponentScore: number,
  ): void {
    this.scoreText.setText(
      `${localName}: ${localScore} | ${opponentName}: ${opponentScore}`,
    );
  }

  updateTimer(secondsRemaining: number): void {
    // Round UP so the displayed clock represents "at most this much time
    // left." Matches countdown convention everywhere else in the app —
    // "1:00" means up to 60s remaining, "0:00" means the timer has hit
    // zero. Floor would flip "1:00" → "0:59" the instant the event-trigger
    // threshold (60s remaining) was crossed and would show "0:00" for the
    // entire final second, making the music appear to outlast the clock.
    const totalSeconds = Math.ceil(secondsRemaining);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
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

  /**
   * Show a centered, dramatic banner for a final-minute event. Two-line
   * supported: line1 is the lead, line2 is the event name. Color is
   * optional — defaults to TEXT_PRIMARY. Same scale-fade animation as the
   * countdown so it reads as part of the same UX language.
   */
  showEventBanner(line1: string, line2?: string, tintColor?: number): void {
    const text = line2 ? `${line1}\n${line2}` : line1;
    this.eventBannerText.setText(text);
    if (tintColor !== undefined) {
      this.eventBannerText.setColor(cssHex(tintColor));
    } else {
      this.eventBannerText.setColor(cssHex(Wasteland.TEXT_PRIMARY));
    }
    this.eventBannerText.setVisible(true);
    this.eventBannerText.setScale(1.6);
    this.eventBannerText.setAlpha(1);

    this.scene.tweens.add({
      targets: this.eventBannerText,
      scaleX: 1,
      scaleY: 1,
      alpha: 0,
      duration: 1800,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.eventBannerText.setVisible(false);
      },
    });
  }

  /**
   * Show / hide the persistent label that names the active final-minute
   * event next to the match timer. Pass null to hide.
   */
  setActiveEventLabel(text: string | null): void {
    if (text === null) {
      this.activeEventLabel.setVisible(false);
      return;
    }
    this.activeEventLabel.setText(text);
    this.activeEventLabel.setVisible(true);
  }

  destroy(): void {
    this.stripBg.destroy();
    this.stripBorder.destroy();
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
    this.eventBannerText.destroy();
    this.activeEventLabel.destroy();
    for (const entry of this.killFeedEntries) {
      entry.timer.remove();
      entry.text.destroy();
    }
    this.killFeedEntries = [];
    this.killFeedContainer.destroy();
  }
}
