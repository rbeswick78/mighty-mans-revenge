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
  onClick?: () => void;
  disabled?: boolean;
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
    this.baseColor =
      variant === 'primary' ? Wasteland.LOADING_BAR_FILL : Wasteland.WALL_FILL;
    this.hoverColor = lighten(this.baseColor, HOVER_LIGHTEN);

    this.chromeOpts = {
      fillColor: this.baseColor,
      fillAlpha: 1,
      strokeColor: Wasteland.CANVAS_BG,
      highlightColor: Wasteland.TEXT_PRIMARY,
      shadowColor: Wasteland.WALL_LINE,
    };

    this.gfx = scene.add.graphics();
    this.label = scene.add
      .text(width / 2, height / 2, labelText, {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: `${opts?.fontSize ?? 11}px`,
        color: cssHex(Wasteland.TEXT_PRIMARY),
      })
      .setOrigin(0.5);
    // Nudge label up by 1px — Press Start 2P's optical center sits low.
    this.label.setY(height / 2 - 1);

    this.zone = scene.add
      .zone(width / 2, height / 2, width, height)
      .setInteractive({ useHandCursor: true });

    this.add([this.gfx, this.label, this.zone]);

    this.zone.on('pointerover', () => {
      if (this.disabled) return;
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

  private redraw(): void {
    this.gfx.clear();
    const fill = this.btnState === 'hover' ? this.hoverColor : this.baseColor;
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
