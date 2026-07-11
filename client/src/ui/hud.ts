import Phaser from 'phaser';
import { WEAPONS, ABILITY } from '@shared/config/game.js';
import type { CharacterId, WeaponId } from '@shared/config/game.js';
import type { KothHudState } from '@shared/types/network.js';
import type { GunGameRung } from '@shared/utils/gun-game.js';
import { Wasteland, cssHex, healthColor } from '@shared/config/palette.js';
import { HUD_STRIP_HEIGHT, MAP_HEIGHT_PX, MAP_WIDTH_PX } from './layout.js';
import { gunGameLadderLabel, rifleAmmoRowVisible } from './gun-game-hud.js';
import { deathOverlayLabel } from './death-overlay.js';
import { MENU_FONTS } from './menu/fonts.js';

// Press Start 2P is much wider per glyph than Courier, so the final-minute
// banner size drops to compensate (Courier 40px ≈ PS2P 22-24px in width).
const EVENT_BANNER_PIXEL_FONT_SIZE = '22px';
const EVENT_BANNER_PIXEL_LINE_SPACING = 12;

// Strip body text uses Silkscreen — a clean pixel font with widths close
// to Courier so the existing layout offsets still line up. Headers (score,
// timer, active-event label) use Press Start 2P at smaller sizes (PS2P is
// much wider per glyph than Courier).
const FONT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: MENU_FONTS.BODY,
  fontSize: '16px',
  color: cssHex(Wasteland.TEXT_PRIMARY),
};

const HEADER_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: MENU_FONTS.HEADER,
  fontSize: '12px',
  color: cssHex(Wasteland.TEXT_PRIMARY),
};

// Map-centered overlays (countdown, death overlay, ability activation
// banner) stay in Courier — they are gameplay-language UI, separate from
// the menu-style HUD strip. Only the final-minute event banner swaps to
// MENU_FONTS.HEADER inside showEventBanner.
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
  private stripBevel: Phaser.GameObjects.Rectangle;

  // Left column: player stats
  private healthBarBg: Phaser.GameObjects.Rectangle;
  private healthBarFg: Phaser.GameObjects.Rectangle;
  private healthText: Phaser.GameObjects.Text;
  private staminaBarBg: Phaser.GameObjects.Rectangle;
  private staminaBarFg: Phaser.GameObjects.Rectangle;
  private ammoText: Phaser.GameObjects.Text;
  private reloadingText: Phaser.GameObjects.Text;
  private grenadeText: Phaser.GameObjects.Text;

  // Special-weapon row: label + indicator icons + count text. Hidden while
  // the player is on the rifle. Shotgun shows one icon per magazine shell
  // plus "+reserve"; the pistol's 12-round mag would overflow the column,
  // so it shows a single bullet icon plus "mag +reserve" as text; fists
  // show only the label (no ammo exists).
  private specialWeaponLabel: Phaser.GameObjects.Text;
  private specialShellIcons: Phaser.GameObjects.Image[] = [];
  private specialReserveText: Phaser.GameObjects.Text;
  /** Left edge of the icon run — reserve-text X is derived per weapon. */
  private readonly specialIconStartX: number;
  /** specialReserveText X while the shotgun's full shell row is visible. */
  private readonly shotgunReserveTextX: number;

  // Rifle-ammo-row suppression inputs (see syncAmmoRowVisibility): the
  // held weapon, the Gun Game rung (null outside that mode), and whether
  // the row's RELOADING flag was last set.
  private currentWeaponId: WeaponId = 'rifle';
  private gunGameRung: GunGameRung | null = null;
  private rifleAmmoReloading = false;

  // Middle column: match state
  private scoreText: Phaser.GameObjects.Text;
  private timerText: Phaser.GameObjects.Text;

  // KOTH capture bar (middle column, between score and timer). Hidden in
  // deathmatch and while the hill is retired for overtime.
  private kothLabel: Phaser.GameObjects.Text;
  private kothBarBg: Phaser.GameObjects.Rectangle;
  private kothBarFg: Phaser.GameObjects.Rectangle;
  /** True while the timer renders in the sudden-death style. */
  private overtimeStyle = false;

  // Gun Game ladder line (middle column). Occupies the KOTH bar's band —
  // the two are mutually exclusive by mode, so they never collide.
  private gunGameLadderText: Phaser.GameObjects.Text;
  /** Last Stand label in the same mode-exclusive middle band. */
  private lastStandText: Phaser.GameObjects.Text;

  // Right column: kill feed
  private killFeedEntries: KillFeedItem[] = [];
  private killFeedContainer: Phaser.GameObjects.Container;

  // Map-centered overlays
  private countdownText: Phaser.GameObjects.Text;
  private deathOverlay: Phaser.GameObjects.Text;
  private eventBannerText: Phaser.GameObjects.Text;
  private combatCalloutText: Phaser.GameObjects.Text;

  // Persistent active-event label, shown next to the timer.
  private activeEventLabel: Phaser.GameObjects.Text;

  // Ability indicator (left column, near the grenade row): icon + radial
  // sweep cooldown overlay + numeric countdown.
  private abilityBg: Phaser.GameObjects.Arc;
  private abilityIconGfx: Phaser.GameObjects.Graphics;
  private abilityCountdownText: Phaser.GameObjects.Text;
  private abilitySweep: Phaser.GameObjects.Graphics;
  private abilityCenterX: number = 0;
  private abilityCenterY: number = 0;
  private abilityRadius: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Strip occupies the bottom band of the canvas. The gameboard owns
    // the top MAP_HEIGHT_PX pixels; the strip never overlays map tiles.
    const stripTop = MAP_HEIGHT_PX;
    const margin = 16;

    // --- Strip background + beveled top edge ---
    // 2px dark stroke at the gameboard/strip boundary reads as a hardware
    // panel seam; a 1px highlight just below it sells the bevel without
    // adding visual weight on top of the gameplay area.
    this.stripBg = scene.add.rectangle(0, stripTop, MAP_WIDTH_PX, HUD_STRIP_HEIGHT, Wasteland.HUD_STRIP_BG);
    this.stripBg.setOrigin(0, 0);
    this.stripBg.setScrollFactor(0);
    this.stripBg.setDepth(500);

    this.stripBorder = scene.add.rectangle(0, stripTop, MAP_WIDTH_PX, 2, Wasteland.CANVAS_BG);
    this.stripBorder.setOrigin(0, 0);
    this.stripBorder.setScrollFactor(0);
    this.stripBorder.setDepth(501);

    this.stripBevel = scene.add.rectangle(0, stripTop + 2, MAP_WIDTH_PX, 1, Wasteland.TEXT_PRIMARY, 0.35);
    this.stripBevel.setOrigin(0, 0);
    this.stripBevel.setScrollFactor(0);
    this.stripBevel.setDepth(501);

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
      fontSize: '14px',
      color: '#000000',
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

    const ammoY = stY + stH + 12;
    this.ammoText = scene.add.text(
      hbX,
      ammoY,
      `${WEAPONS.rifle.magazineSize} / ${WEAPONS.rifle.magazineSize}`,
      {
        ...FONT_STYLE,
      },
    );
    this.ammoText.setScrollFactor(0);
    this.ammoText.setDepth(1000);

    this.reloadingText = scene.add.text(hbX + 80, ammoY, 'RELOADING', {
      ...HEADER_STYLE,
      fontSize: '10px',
      color: cssHex(Wasteland.TEXT_RELOAD_WARNING),
    });
    this.reloadingText.setScrollFactor(0);
    this.reloadingText.setDepth(1000);
    this.reloadingText.setVisible(false);

    const grenadeY = ammoY + 24;
    this.grenadeText = scene.add.text(hbX, grenadeY, 'GRN: ready', {
      ...FONT_STYLE,
    });
    this.grenadeText.setScrollFactor(0);
    this.grenadeText.setDepth(1000);

    // --- Special-weapon row (hidden until a non-rifle weapon is held) ---
    const specialY = grenadeY + 26;
    this.specialWeaponLabel = scene.add.text(hbX, specialY + 4, '', {
      ...HEADER_STYLE,
      fontSize: '10px',
      color: cssHex(Wasteland.TEXT_RELOAD_WARNING),
    });
    this.specialWeaponLabel.setScrollFactor(0);
    this.specialWeaponLabel.setDepth(1000);
    this.specialWeaponLabel.setVisible(false);

    // Enough icon slots for the shotgun's per-shell row; the pistol reuses
    // slot 0 as its single bullet icon.
    this.specialIconStartX = hbX + 96;
    for (let i = 0; i < WEAPONS.shotgun.magazineSize; i++) {
      const icon = scene.add.image(this.specialIconStartX + i * 24, specialY, 'shotgun_shell');
      icon.setOrigin(0, 0);
      icon.setScale(2);
      icon.setScrollFactor(0);
      icon.setDepth(1000);
      icon.setVisible(false);
      this.specialShellIcons.push(icon);
    }

    this.shotgunReserveTextX =
      this.specialIconStartX + WEAPONS.shotgun.magazineSize * 24 + 8;
    this.specialReserveText = scene.add.text(
      this.shotgunReserveTextX,
      specialY + 4,
      '',
      { ...FONT_STYLE },
    );
    this.specialReserveText.setScrollFactor(0);
    this.specialReserveText.setDepth(1000);
    this.specialReserveText.setVisible(false);

    // --- Ability indicator: themed icon + radial sweep cooldown ---
    this.abilityRadius = 18;
    this.abilityCenterX = hbX + hbW + 36;
    this.abilityCenterY = hbY + this.abilityRadius;

    this.abilityBg = scene.add.circle(
      this.abilityCenterX,
      this.abilityCenterY,
      this.abilityRadius,
      Wasteland.HUD_STRIP_BG,
      0.85,
    );
    this.abilityBg.setStrokeStyle(2, 0x55667a, 1);
    this.abilityBg.setScrollFactor(0);
    this.abilityBg.setDepth(1000);
    this.abilityBg.setVisible(false);

    this.abilityIconGfx = scene.add.graphics();
    this.abilityIconGfx.setPosition(this.abilityCenterX, this.abilityCenterY);
    this.abilityIconGfx.setScrollFactor(0);
    this.abilityIconGfx.setDepth(1002);
    this.abilityIconGfx.setVisible(false);

    this.abilitySweep = scene.add.graphics();
    this.abilitySweep.setScrollFactor(0);
    this.abilitySweep.setDepth(1001);

    this.abilityCountdownText = scene.add.text(
      this.abilityCenterX,
      this.abilityCenterY + this.abilityRadius + 6,
      '',
      {
        ...HEADER_STYLE,
        fontSize: '9px',
      },
    );
    this.abilityCountdownText.setOrigin(0.5, 0);
    this.abilityCountdownText.setScrollFactor(0);
    this.abilityCountdownText.setDepth(1002);
    this.abilityCountdownText.setVisible(false);

    // --- Middle column: score + timer ---
    const middleX = MAP_WIDTH_PX / 2;
    this.scoreText = scene.add.text(middleX, stripTop + 22, 'YOU: 0 | ENEMY: 0', {
      ...HEADER_STYLE,
      fontSize: '14px',
    });
    this.scoreText.setOrigin(0.5, 0);
    this.scoreText.setScrollFactor(0);
    this.scoreText.setDepth(1000);

    this.timerText = scene.add.text(middleX, stripTop + 58, '5:00', {
      ...HEADER_STYLE,
      fontSize: '13px',
    });
    this.timerText.setOrigin(0.5, 0);
    this.timerText.setScrollFactor(0);
    this.timerText.setDepth(1000);

    // --- KOTH capture bar: "HILL" label + progress toward the next point.
    // Lives in the gap between the score line and the timer; hidden until
    // updateKothState sees hill state in the snapshot.
    const kothBarW = 140;
    const kothBarY = stripTop + 44;
    this.kothLabel = scene.add.text(middleX - kothBarW / 2 - 8, kothBarY - 1, 'HILL', {
      ...HEADER_STYLE,
      fontSize: '8px',
    });
    this.kothLabel.setOrigin(1, 0);
    this.kothLabel.setScrollFactor(0);
    this.kothLabel.setDepth(1000);
    this.kothLabel.setVisible(false);

    this.kothBarBg = scene.add.rectangle(
      middleX - kothBarW / 2,
      kothBarY,
      kothBarW,
      8,
      Wasteland.HEALTH_BAR_BG,
    );
    this.kothBarBg.setOrigin(0, 0);
    this.kothBarBg.setScrollFactor(0);
    this.kothBarBg.setDepth(1000);
    this.kothBarBg.setVisible(false);

    this.kothBarFg = scene.add.rectangle(
      middleX - kothBarW / 2,
      kothBarY,
      0,
      8,
      Wasteland.HEALTH_GOOD,
    );
    this.kothBarFg.setOrigin(0, 0);
    this.kothBarFg.setScrollFactor(0);
    this.kothBarFg.setDepth(1001);
    this.kothBarFg.setVisible(false);

    // --- Gun Game ladder line: "PISTOL 1/2 - LVL 3/5". Sits in the KOTH
    // bar's band (mode-exclusive) so both desktop and the scaled mobile
    // canvas keep the middle column single-purpose. Hidden until
    // updateGunGame receives a rung.
    this.gunGameLadderText = scene.add.text(middleX, kothBarY - 1, '', {
      ...HEADER_STYLE,
      fontSize: '9px',
      color: cssHex(Wasteland.TEXT_RELOAD_WARNING),
    });
    this.gunGameLadderText.setOrigin(0.5, 0);
    this.gunGameLadderText.setScrollFactor(0);
    this.gunGameLadderText.setDepth(1000);
    this.gunGameLadderText.setVisible(false);

    this.lastStandText = scene.add.text(middleX, kothBarY - 1, 'LIVES REMAINING', {
      ...HEADER_STYLE,
      fontSize: '9px',
      color: cssHex(Wasteland.TEXT_RELOAD_WARNING),
    });
    this.lastStandText.setOrigin(0.5, 0);
    this.lastStandText.setScrollFactor(0);
    this.lastStandText.setDepth(1000);
    this.lastStandText.setVisible(false);

    // Persistent active-event label, sits right under the timer. Hidden
    // until an event activates; never moves, just toggles text + visibility.
    this.activeEventLabel = scene.add.text(middleX, stripTop + 84, '', {
      ...HEADER_STYLE,
      fontSize: '10px',
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

    // Kill streak/payback callouts own a separate upper-map lane so a kill
    // cannot erase a mutator, overtime, or ability announcement.
    this.combatCalloutText = scene.add.text(mapCenterX, mapCenterY - 170, '', {
      fontFamily: MENU_FONTS.HEADER,
      fontSize: '20px',
      color: cssHex(Wasteland.TEXT_RELOAD_WARNING),
      align: 'center',
    });
    this.combatCalloutText.setOrigin(0.5, 0.5);
    this.combatCalloutText.setScrollFactor(0);
    this.combatCalloutText.setDepth(2001);
    this.combatCalloutText.setVisible(false);
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
    this.rifleAmmoReloading = isReloading;
    this.syncAmmoRowVisibility();
  }

  /**
   * Sync the special-weapon row.
   *   rifle   — hidden entirely (the rifle owns the plain ammo row).
   *   shotgun — one filled/empty icon per magazine shell + "+reserve".
   *   pistol  — label + a single bullet icon + "mag +reserve" as text
   *             (12 per-shell icons would overflow the left column).
   *   punch   — label only ("FISTS"); fists have no ammo, and the rifle
   *             ammo row hides too (syncAmmoRowVisibility).
   */
  updateSpecialWeapon(weaponId: WeaponId, magAmmo: number, reserve: number): void {
    this.currentWeaponId = weaponId;

    const showLabel = weaponId !== 'rifle';
    this.specialWeaponLabel.setVisible(showLabel);
    if (showLabel) {
      this.specialWeaponLabel.setText(WEAPONS[weaponId].displayName.toUpperCase());
    }

    if (weaponId === 'shotgun') {
      for (let i = 0; i < this.specialShellIcons.length; i++) {
        const icon = this.specialShellIcons[i];
        icon.setVisible(true);
        icon.setTexture(i < magAmmo ? 'shotgun_shell' : 'shotgun_shell_empty');
      }
      this.specialReserveText.setX(this.shotgunReserveTextX);
      this.specialReserveText.setText(`+${reserve}`);
      this.specialReserveText.setVisible(true);
    } else if (weaponId === 'pistol') {
      for (let i = 0; i < this.specialShellIcons.length; i++) {
        const icon = this.specialShellIcons[i];
        icon.setVisible(i === 0);
        if (i === 0) {
          icon.setTexture(magAmmo > 0 ? 'pistol_bullet' : 'pistol_bullet_empty');
        }
      }
      // Count text hugs the single icon instead of sitting past the
      // shotgun's shell run.
      this.specialReserveText.setX(this.specialIconStartX + 24);
      this.specialReserveText.setText(`${magAmmo} +${reserve}`);
      this.specialReserveText.setVisible(true);
    } else {
      for (const icon of this.specialShellIcons) {
        icon.setVisible(false);
      }
      this.specialReserveText.setVisible(false);
    }

    this.syncAmmoRowVisibility();
  }

  /**
   * Sync the Gun Game ladder line from the local player's rung (derived
   * from score via the shared gunGameRungForScore). Pass null outside Gun
   * Game — hides the line and lifts the grenade-rung ammo suppression.
   */
  updateGunGame(rung: GunGameRung | null): void {
    this.gunGameRung = rung;
    if (rung) {
      this.gunGameLadderText.setText(gunGameLadderLabel(rung));
      this.gunGameLadderText.setVisible(true);
    } else {
      this.gunGameLadderText.setVisible(false);
    }
    this.syncAmmoRowVisibility();
  }

  updateLastStand(active: boolean): void {
    this.lastStandText.setVisible(active);
  }

  /**
   * The rifle ammo row hides while it can only mislead: fists equipped
   * (no ammo exists) or the Gun Game grenade rung (weaponId stays 'rifle'
   * but gun fire is gated — the ladder line + grenade counter are the
   * truth there).
   */
  private syncAmmoRowVisibility(): void {
    const visible = rifleAmmoRowVisible(this.currentWeaponId, this.gunGameRung);
    this.ammoText.setVisible(visible);
    this.reloadingText.setVisible(visible && this.rifleAmmoReloading);
  }

  /** Show a respawn countdown or permanent stock-elimination state. */
  updateDeathState(
    isDead: boolean,
    respawnSecondsRemaining: number,
    eliminated = false,
  ): void {
    const label = deathOverlayLabel(isDead, respawnSecondsRemaining, eliminated);
    if (label === null) {
      this.deathOverlay.setVisible(false);
      return;
    }
    this.deathOverlay.setText(label);
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

  /**
   * Sync the KOTH capture bar from the latest snapshot. null hides the
   * whole row (DM matches, and overtime — the hill is retired for sudden
   * death). Bar semantics: fraction of the way to the occupant's next
   * point, colored by who benefits — mint for the local player, blood red
   * for an enemy, flashing orange full-width while contested.
   */
  updateKothState(state: KothHudState | null, localPlayerId: string | null): void {
    // .hill guard: treat a malformed snapshot (serialization dropped the
    // hill) the same as "no hill state" instead of trusting the type.
    const visible = !!state?.hill;
    this.kothLabel.setVisible(visible);
    this.kothBarBg.setVisible(visible);
    this.kothBarFg.setVisible(visible);
    if (!state?.hill) return;

    const fullWidth = this.kothBarBg.width;
    if (state.contested) {
      // Full-width blink — nobody is scoring until the hill clears.
      const blink = Math.floor(this.scene.time.now / 250) % 2 === 0;
      this.kothBarFg.setSize(fullWidth, 8);
      this.kothBarFg.setFillStyle(Wasteland.TEXT_LOADING, blink ? 0.9 : 0.35);
      this.kothLabel.setText('CONTESTED');
      return;
    }

    this.kothLabel.setText('HILL');
    if (state.occupantId === null) {
      this.kothBarFg.setSize(0, 8);
      return;
    }
    const mine = state.occupantId === localPlayerId;
    this.kothBarFg.setFillStyle(
      mine ? Wasteland.HEALTH_GOOD : Wasteland.TEXT_DEATH,
      1,
    );
    const fraction = Math.max(0, Math.min(1, state.captureFraction));
    this.kothBarFg.setSize(fullWidth * fraction, 8);
  }

  /**
   * Toggle the sudden-death timer style: the clock turns blood red for
   * the duration of overtime.
   */
  setOvertime(active: boolean): void {
    if (active === this.overtimeStyle) return;
    this.overtimeStyle = active;
    this.timerText.setColor(
      cssHex(active ? Wasteland.TEXT_DEATH : Wasteland.TEXT_PRIMARY),
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
      fontSize: '14px',
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
      this.killFeedEntries[i].text.setY(i * 20);
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
    // Final-minute event banner uses the menu's chunky pixel font for
    // distinct visual weight from the in-game Courier countdown / death
    // overlay (which share this text element). Switch the font family +
    // size here; showAbilityActivation resets back to LARGE_FONT_STYLE.
    this.eventBannerText.setStyle({
      fontFamily: MENU_FONTS.HEADER,
      fontSize: EVENT_BANNER_PIXEL_FONT_SIZE,
    });
    this.eventBannerText.setLineSpacing(EVENT_BANNER_PIXEL_LINE_SPACING);
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

  /** Short celebratory beat for server-authored streak/payback context. */
  showCombatCallout(headline: string, detail: string, tintColor: number): void {
    this.scene.tweens.killTweensOf(this.combatCalloutText);
    this.combatCalloutText.setText(`${headline}\n${detail}`);
    this.combatCalloutText.setColor(cssHex(tintColor));
    this.combatCalloutText.setLineSpacing(8);
    this.combatCalloutText.setVisible(true);
    this.combatCalloutText.setScale(1.35);
    this.combatCalloutText.setAlpha(1);
    this.scene.tweens.add({
      targets: this.combatCalloutText,
      scaleX: 1,
      scaleY: 1,
      alpha: 0,
      duration: 1400,
      ease: 'Quad.easeIn',
      onComplete: () => this.combatCalloutText.setVisible(false),
    });
  }

  /**
   * Update the per-character ability indicator. Pass null/undefined character
   * before COUNTDOWN to hide it.
   *
   *   ready    — icon glows, no sweep, blank countdown
   *   active   — icon pulses, sweep shows shrinking active fraction (cyan),
   *              countdown shows ceil(active seconds)
   *   cooldown — icon dimmed, sweep shows shrinking cooldown fraction (red),
   *              countdown shows ceil(cooldown seconds)
   */
  updateAbility(
    characterId: CharacterId | null,
    activeSeconds: number,
    cooldownSeconds: number,
  ): void {
    if (!characterId) {
      this.abilityBg.setVisible(false);
      this.abilityIconGfx.setVisible(false);
      this.abilityCountdownText.setVisible(false);
      this.abilitySweep.clear();
      this.abilityIconGfx.clear();
      return;
    }

    // Per-character "ready" color — the icon background is filled with this
    // when the ability is up, and a flat dark-grey when on cooldown so the
    // status reads at a glance.
    const readyColor =
      characterId === 'bruce' ? 0xff7b2a
      : characterId === 'mighty_man' ? 0x4ad8e8
      : characterId === 'bubba' ? 0xb8c4d0
      : characterId === 'jack' ? 0xffb347
      : 0xaaddff; // frost_wizard
    const cooldownColor = 0x3a4252;
    // Total recharge cycle from the moment activation should be measured.
    // Bruce/Bubba: cooldown begins at activation (DURATION overlaps it).
    // Mighty Man: cooldown begins after the active window ends.
    // Frost Wizard/Jack: instant cast, no active window — just COOLDOWN.
    const totalCycle =
      characterId === 'bruce' ? ABILITY.BRUCE_FIRE_BREATH.COOLDOWN
      : characterId === 'mighty_man'
        ? ABILITY.MIGHTY_MAN_XRAY.DURATION + ABILITY.MIGHTY_MAN_XRAY.COOLDOWN
      : characterId === 'bubba' ? ABILITY.BUBBA_IRON_HIDE.COOLDOWN
      : characterId === 'jack' ? ABILITY.JACK_AXE_THROW.COOLDOWN
      : ABILITY.FROST_WIZARD_FREEZE.COOLDOWN;
    // Instant-cast characters (Frost Wizard, Jack) never take the isActive
    // path — the fallback just keeps the sweep math from dividing by zero.
    const activeDuration =
      characterId === 'bruce' ? ABILITY.BRUCE_FIRE_BREATH.DURATION
      : characterId === 'mighty_man' ? ABILITY.MIGHTY_MAN_XRAY.DURATION
      : characterId === 'bubba' ? ABILITY.BUBBA_IRON_HIDE.DURATION
      : ABILITY.FROST_WIZARD_FREEZE.DURATION;

    this.abilityBg.setVisible(true);
    this.abilityIconGfx.setVisible(true);

    const isActive = activeSeconds > 0;
    const isCoolingDown = !isActive && cooldownSeconds > 0;

    let fillColor: number;
    let strokeColor: number;
    let iconAlpha: number;
    let iconColorNum: number;
    let sweepColor: number;
    let sweepFraction: number;
    let countdownText: string;

    if (isActive) {
      // Pulsing ready-color fill so the player feels the active window.
      fillColor = readyColor;
      strokeColor = 0xffffff;
      iconAlpha = 1;
      iconColorNum = 0x000000;
      sweepColor = 0xffffff;
      sweepFraction = activeSeconds / activeDuration;
      countdownText = `${Math.ceil(activeSeconds)}`;
    } else if (isCoolingDown) {
      // Flat dark grey — the unmistakable "not ready" state.
      fillColor = cooldownColor;
      strokeColor = 0x55667a;
      iconAlpha = 0.45;
      iconColorNum = 0x9aa3b0;
      sweepColor = readyColor;
      sweepFraction = cooldownSeconds / totalCycle;
      countdownText = `${Math.ceil(cooldownSeconds)}`;
    } else {
      // Ready: solid character color. Reads clearly even peripheral.
      fillColor = readyColor;
      strokeColor = 0xffffff;
      iconAlpha = 1;
      iconColorNum = 0x000000;
      sweepColor = 0;
      sweepFraction = 0;
      countdownText = 'READY';
    }

    this.abilityBg.setFillStyle(fillColor, 1);
    this.abilityBg.setStrokeStyle(2, strokeColor, 1);
    if (characterId === 'bruce') {
      this.drawFireIcon(iconColorNum, iconAlpha);
    } else if (characterId === 'mighty_man') {
      this.drawGlassesIcon(iconColorNum, iconAlpha);
    } else if (characterId === 'bubba') {
      this.drawShieldIcon(iconColorNum, iconAlpha);
    } else if (characterId === 'jack') {
      this.drawAxeIcon(iconColorNum, iconAlpha);
    } else {
      this.drawSnowflakeIcon(iconColorNum, iconAlpha);
    }
    this.abilityCountdownText.setText(countdownText);
    this.abilityCountdownText.setVisible(true);

    this.abilitySweep.clear();
    if (sweepFraction > 0) {
      const start = -Math.PI / 2;
      const end = start + sweepFraction * Math.PI * 2;
      this.abilitySweep.lineStyle(3, sweepColor, 0.95);
      this.abilitySweep.beginPath();
      this.abilitySweep.arc(
        this.abilityCenterX,
        this.abilityCenterY,
        this.abilityRadius + 3,
        start,
        end,
        false,
      );
      this.abilitySweep.strokePath();
    }
  }

  /**
   * Pixel-art flame silhouette for Bruce's fire-breath ability indicator.
   * Drawn into abilityIconGfx; coordinates are relative to the icon center.
   */
  private drawFireIcon(color: number, alpha: number): void {
    const g = this.abilityIconGfx;
    g.clear();
    g.fillStyle(color, alpha);
    // Outer flame silhouette: tall asymmetric teardrop with a notch on the
    // upper-left to suggest a flickering tongue.
    g.beginPath();
    g.moveTo(0, -12);
    g.lineTo(3, -7);
    g.lineTo(2, -3);
    g.lineTo(5, -5);
    g.lineTo(7, 0);
    g.lineTo(7, 5);
    g.lineTo(4, 10);
    g.lineTo(0, 11);
    g.lineTo(-4, 10);
    g.lineTo(-7, 5);
    g.lineTo(-7, 0);
    g.lineTo(-5, -4);
    g.lineTo(-2, -2);
    g.lineTo(-3, -7);
    g.closePath();
    g.fillPath();
  }

  /**
   * Pixel-art snowflake silhouette for Frost Wizard's freeze ability
   * indicator. Six radial arms with a small notch near each tip — reads
   * as a snowflake even at small sizes.
   * Drawn into abilityIconGfx; coordinates are relative to the icon center.
   */
  private drawSnowflakeIcon(color: number, alpha: number): void {
    const g = this.abilityIconGfx;
    g.clear();
    g.lineStyle(2, color, alpha);
    const arms = 6;
    const armLen = 11;
    const branchAt = 6;
    const branchLen = 3;
    for (let i = 0; i < arms; i++) {
      const ang = (i * 2 * Math.PI) / arms;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      // Main arm
      g.lineBetween(0, 0, cos * armLen, sin * armLen);
      // Two short branches angled off the arm at branchAt, like a snowflake.
      const bx = cos * branchAt;
      const by = sin * branchAt;
      const left = ang + Math.PI / 3;
      const right = ang - Math.PI / 3;
      g.lineBetween(bx, by, bx + Math.cos(left) * branchLen, by + Math.sin(left) * branchLen);
      g.lineBetween(bx, by, bx + Math.cos(right) * branchLen, by + Math.sin(right) * branchLen);
    }
    // Center pip so the arms read as anchored to a hub.
    g.fillStyle(color, alpha);
    g.fillCircle(0, 0, 1.5);
  }

  /**
   * Pixel-art kite-shield silhouette for Bubba's Iron Hide indicator.
   * Drawn into abilityIconGfx; coordinates are relative to the icon center.
   */
  private drawShieldIcon(color: number, alpha: number): void {
    const g = this.abilityIconGfx;
    g.clear();
    g.fillStyle(color, alpha);
    // Shield body: flat top, tapering to a point at the bottom.
    g.beginPath();
    g.moveTo(-8, -9);
    g.lineTo(8, -9);
    g.lineTo(8, 1);
    g.lineTo(0, 11);
    g.lineTo(-8, 1);
    g.closePath();
    g.fillPath();
    // Center boss — small punched-out dot so it reads as armor, not a blob.
    g.fillStyle(0xffffff, alpha * 0.35);
    g.fillCircle(0, -1, 2.5);
  }

  /**
   * Pixel-art hand-axe silhouette for Jack's Axe Throw indicator: a
   * diagonal haft with a wedge blade at the top end.
   * Drawn into abilityIconGfx; coordinates are relative to the icon center.
   */
  private drawAxeIcon(color: number, alpha: number): void {
    const g = this.abilityIconGfx;
    g.clear();
    // Haft: bottom-left to top-right diagonal.
    g.lineStyle(3, color, alpha);
    g.lineBetween(-8, 10, 5, -5);
    // Blade: wedge hanging off the top of the haft.
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(2, -8);
    g.lineTo(10, -6);
    g.lineTo(9, 2);
    g.lineTo(4, -1);
    g.closePath();
    g.fillPath();
  }

  /**
   * Pixel-art glasses silhouette for Mighty Man's x-ray ability indicator.
   * Two round lenses joined by a bridge, with short temple stubs.
   * Drawn into abilityIconGfx; coordinates are relative to the icon center.
   */
  private drawGlassesIcon(color: number, alpha: number): void {
    const g = this.abilityIconGfx;
    g.clear();
    g.lineStyle(2, color, alpha);
    // Lenses
    g.strokeCircle(-7, 1, 5);
    g.strokeCircle(7, 1, 5);
    // Bridge
    g.lineBetween(-2, 1, 2, 1);
    // Temple stubs
    g.lineBetween(-12, -1, -14, -3);
    g.lineBetween(12, -1, 14, -3);
  }

  /**
   * Big centered banner that fires once when the local player triggers an
   * ability. Same scale-fade language as the countdown, tinted by the
   * character's ability color. Loud and unmistakable — the player knows
   * the ability went off even if they can't see the world-space VFX.
   */
  showAbilityActivation(label: string, tintColor: number): void {
    // Reset back to LARGE_FONT_STYLE — the event banner element is shared
    // with showEventBanner, which swaps to the menu pixel font. Ability
    // activation stays in-game Courier per the gameplay UX language.
    this.eventBannerText.setStyle(LARGE_FONT_STYLE);
    this.eventBannerText.setFontSize('40px');
    this.eventBannerText.setLineSpacing(0);
    this.eventBannerText.setText(label);
    this.eventBannerText.setColor(cssHex(tintColor));
    this.eventBannerText.setVisible(true);
    this.eventBannerText.setScale(1.8);
    this.eventBannerText.setAlpha(1);

    this.scene.tweens.killTweensOf(this.eventBannerText);
    this.scene.tweens.add({
      targets: this.eventBannerText,
      scaleX: 1,
      scaleY: 1,
      alpha: 0,
      duration: 1200,
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
    this.stripBevel.destroy();
    this.healthBarBg.destroy();
    this.healthBarFg.destroy();
    this.healthText.destroy();
    this.staminaBarBg.destroy();
    this.staminaBarFg.destroy();
    this.ammoText.destroy();
    this.reloadingText.destroy();
    this.grenadeText.destroy();
    this.specialWeaponLabel.destroy();
    for (const icon of this.specialShellIcons) {
      icon.destroy();
    }
    this.specialShellIcons = [];
    this.specialReserveText.destroy();
    this.scoreText.destroy();
    this.timerText.destroy();
    this.kothLabel.destroy();
    this.kothBarBg.destroy();
    this.kothBarFg.destroy();
    this.gunGameLadderText.destroy();
    this.lastStandText.destroy();
    this.countdownText.destroy();
    this.deathOverlay.destroy();
    this.eventBannerText.destroy();
    this.combatCalloutText.destroy();
    this.activeEventLabel.destroy();
    this.abilityBg.destroy();
    this.abilityIconGfx.destroy();
    this.abilityCountdownText.destroy();
    this.abilitySweep.destroy();
    for (const entry of this.killFeedEntries) {
      entry.timer.remove();
      entry.text.destroy();
    }
    this.killFeedEntries = [];
    this.killFeedContainer.destroy();
  }
}
