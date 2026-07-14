import Phaser from 'phaser';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { AudioManager } from '../../audio/audio-manager.js';
import { drawBeveledChrome, type BeveledChromeOpts } from './menu-panel.js';
import { MENU_FONTS } from './fonts.js';

const HOVER_LIGHTEN = 20;

export type PixelButtonVariant = 'primary' | 'secondary';

export interface PixelButtonOpts {
  variant?: PixelButtonVariant;
  fontSize?: number;
  subtitle?: string;
  subtitleFontSize?: number;
  onClick?: () => void;
  disabled?: boolean;
  /** Expand the pointer target vertically without changing visible chrome. */
  hitPaddingY?: number;
  /** Defaults to 'menuSelect'. Pass null to skip the click SFX. */
  sound?: 'menuSelect' | null;
}

const lighten = (hex: number, amount: number): number =>
  Phaser.Display.Color.ValueToColor(hex).lighten(amount).color;

// 3-state beveled pixel button: idle (raised bevel + base fill), hover
// (raised bevel + lightened fill), pressed (inverted bevel + base fill).
// Plays sfx-menu-select on press (silently skipped if asset unloaded).
// Square corners — no rounding — matches the chunky pixel-art aesthetic.
export class PixelButton extends Phaser.GameObjects.Container {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text | null;
  private readonly zone: Phaser.GameObjects.Zone;
  private readonly baseColor: number;
  private readonly hoverColor: number;
  private readonly btnWidth: number;
  private readonly btnHeight: number;
  private readonly chromeOpts: BeveledChromeOpts;
  private readonly onClick?: () => void;
  private readonly sound: 'menuSelect' | null;
  private btnState: 'idle' | 'hover' | 'pressed' = 'idle';
  private disabled: boolean;
  private focused = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    labelText: string,
    opts?: PixelButtonOpts,
  ) {
    super(scene, x, y);
    this.btnWidth = width;
    this.btnHeight = height;
    this.disabled = opts?.disabled ?? false;
    this.onClick = opts?.onClick;
    this.sound = opts?.sound === undefined ? 'menuSelect' : opts.sound;

    const variant = opts?.variant ?? 'primary';
    this.baseColor = variant === 'primary' ? Wasteland.LOADING_BAR_FILL : Wasteland.WALL_FILL;
    this.hoverColor = lighten(this.baseColor, HOVER_LIGHTEN);

    this.chromeOpts = {
      fillColor: this.baseColor,
      fillAlpha: 1,
      strokeColor: Wasteland.CANVAS_BG,
      highlightColor: Wasteland.TEXT_PRIMARY,
      shadowColor: Wasteland.WALL_LINE,
    };

    this.gfx = scene.add.graphics();
    const hasSubtitle = opts?.subtitle !== undefined;
    this.label = scene.add
      .text(width / 2, hasSubtitle ? height * 0.34 : height / 2, labelText, {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: `${opts?.fontSize ?? 11}px`,
        color: cssHex(Wasteland.TEXT_PRIMARY),
      })
      .setOrigin(0.5);
    // Nudge label up by 1px — Press Start 2P's optical center sits low.
    this.label.setY(this.label.y - 1);

    this.subtitle = hasSubtitle
      ? scene.add
          .text(width / 2, height * 0.72, opts.subtitle ?? '', {
            fontFamily: MENU_FONTS.HEADER,
            fontSize: `${opts.subtitleFontSize ?? 7}px`,
            color: cssHex(Wasteland.COVER_FILL),
          })
          .setOrigin(0.5)
      : null;

    const hitPaddingY = Math.max(0, opts?.hitPaddingY ?? 0);
    this.zone = scene.add
      .zone(width / 2, height / 2, width, height + hitPaddingY * 2)
      .setInteractive({ useHandCursor: true });

    this.add(
      this.subtitle
        ? [this.gfx, this.label, this.subtitle, this.zone]
        : [this.gfx, this.label, this.zone],
    );

    this.zone.on('pointerover', () => {
      // Touch browsers may synthesize pointerover after pointerdown. Keep
      // the pressed state until release so a valid tap still activates.
      if (this.disabled || this.btnState === 'pressed') return;
      this.btnState = 'hover';
      this.redraw();
    });
    this.zone.on('pointerout', () => {
      if (this.disabled) return;
      this.btnState = 'idle';
      this.redraw();
    });
    this.zone.on('pointerdown', () => {
      if (this.disabled) return;
      this.btnState = 'pressed';
      this.redraw();
      if (this.sound) {
        AudioManager.getInstance()?.play(this.sound);
      }
    });
    // pointerup fires the click. Match Phaser's gameobjectupzone semantics —
    // we want click on release, not on press, so a drag-off cancels.
    this.zone.on('pointerup', () => {
      if (this.disabled) return;
      const wasPressed = this.btnState === 'pressed';
      this.btnState = 'hover';
      this.redraw();
      if (wasPressed) this.onClick?.();
    });
    // If the pointer leaves while pressed, drop back to idle without firing.
    this.zone.on('pointerupoutside', () => {
      if (this.disabled) return;
      this.btnState = 'idle';
      this.redraw();
    });

    this.redraw();
    if (this.disabled) this.setAlpha(0.5);

    scene.add.existing(this);
  }

  setDisabled(disabled: boolean): this {
    if (this.disabled === disabled) return this;
    this.disabled = disabled;
    if (disabled) this.focused = false;
    this.setAlpha(disabled ? 0.5 : 1);
    if (disabled) {
      this.zone.disableInteractive();
    } else {
      this.zone.setInteractive({ useHandCursor: true });
    }
    this.btnState = 'idle';
    this.redraw();
    return this;
  }

  setLabel(text: string): this {
    this.label.setText(text);
    return this;
  }

  /** Exposed for scene-level E2E assertions on canvas-rendered cards. */
  getSubtitleText(): string | null {
    return this.subtitle?.text ?? null;
  }

  /** Controller/keyboard focus, visually matching pointer hover. */
  setFocused(focused: boolean): this {
    this.focused = focused && !this.disabled;
    this.redraw();
    return this;
  }

  /** Trigger the same action and sound as a pointer click. */
  activate(): boolean {
    if (this.disabled) return false;
    this.btnState = 'pressed';
    this.redraw();
    if (this.sound) AudioManager.getInstance()?.play(this.sound);
    this.scene.time.delayedCall(80, () => {
      if (!this.active) return;
      this.btnState = this.focused ? 'hover' : 'idle';
      this.redraw();
    });
    this.onClick?.();
    return true;
  }

  private redraw(): void {
    this.gfx.clear();
    const fill = this.btnState === 'hover' || this.focused ? this.hoverColor : this.baseColor;
    drawBeveledChrome(
      this.gfx,
      0,
      0,
      this.btnWidth,
      this.btnHeight,
      { ...this.chromeOpts, fillColor: fill },
      this.btnState === 'pressed',
    );
  }
}
