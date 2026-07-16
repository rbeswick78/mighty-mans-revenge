import Phaser from 'phaser';
import { AudioManager } from '../../audio/audio-manager.js';
import { MENU_FONTS } from '../menu/fonts.js';
import {
  MODERN_UI_TEXTURE_KEY,
  MODERN_UI_MIN_TOUCH_TARGET,
  modernUiCardFrame,
  type ModernUiControlState,
} from '../modern-ui-contract.js';
import { menuBodyFont, menuHeaderFont, modernUiEnabledForScene } from '../modern-ui-runtime.js';
import { ReforgedMenuTokens } from './design-tokens.js';

export interface ReforgedChoiceButtonOptions {
  readonly onSelect: () => void;
  readonly onPointerIntent: () => void;
  readonly detailFontSize?: number;
}

export class ReforgedChoiceButton extends Phaser.GameObjects.Container {
  private readonly chrome: Phaser.GameObjects.Graphics;
  private readonly modernChrome: Phaser.GameObjects.NineSlice | null;
  private readonly label: Phaser.GameObjects.Text;
  private readonly detail: Phaser.GameObjects.Text;
  private readonly hitZone: Phaser.GameObjects.Zone;
  private visualWidth = 1;
  private visualHeight = 1;
  private hovered = false;
  private pressed = false;
  private focused = false;
  private selected = false;
  private disabled = false;
  private soundEnabled = true;

  constructor(
    scene: Phaser.Scene,
    label: string,
    detail: string,
    private readonly options: ReforgedChoiceButtonOptions,
  ) {
    super(scene, 0, 0);
    const tokens = ReforgedMenuTokens;
    const modern = modernUiEnabledForScene(scene);
    this.chrome = scene.add.graphics().setVisible(!modern);
    this.modernChrome = modern
      ? scene.add
          .nineslice(0, 0, MODERN_UI_TEXTURE_KEY, modernUiCardFrame('idle'), 64, 64, 12, 12, 12, 12)
          .setOrigin(0)
      : null;
    this.label = scene.add
      .text(0, 0, label, {
        fontFamily: modern ? menuHeaderFont(scene) : MENU_FONTS.HEADER,
        fontSize: `${tokens.type.tab}px`,
        color: Phaser.Display.Color.IntegerToColor(tokens.color.text).rgba,
        align: 'center',
      })
      .setOrigin(0.5);
    this.detail = scene.add
      .text(0, 0, detail, {
        fontFamily: modern ? menuBodyFont(scene) : MENU_FONTS.BODY,
        fontSize: `${options.detailFontSize ?? tokens.type.eyebrow}px`,
        color: Phaser.Display.Color.IntegerToColor(tokens.color.textMuted).rgba,
        align: 'center',
        lineSpacing: 2,
      })
      .setOrigin(0.5);
    this.hitZone = scene.add.zone(0, 0, 1, 1).setInteractive({ useHandCursor: true });
    this.add(this.chrome);
    if (this.modernChrome) this.add(this.modernChrome);
    this.add([this.label, this.detail, this.hitZone]);

    this.hitZone.on('pointerover', () => {
      this.hovered = true;
      this.redraw();
    });
    this.hitZone.on('pointerout', () => {
      this.hovered = false;
      this.pressed = false;
      this.redraw();
    });
    this.hitZone.on('pointerdown', () => {
      if (this.disabled) return;
      this.options.onPointerIntent();
      this.pressed = true;
      if (this.soundEnabled) AudioManager.getInstance()?.play('menuSelect');
      this.redraw();
    });
    this.hitZone.on('pointerup', () => {
      if (!this.pressed || this.disabled) return;
      this.pressed = false;
      this.options.onSelect();
      this.redraw();
    });
    this.hitZone.on('pointerupoutside', () => {
      this.pressed = false;
      this.redraw();
    });

    scene.add.existing(this);
  }

  layout(x: number, y: number, width: number, height: number): this {
    this.setPosition(x, y);
    this.setSize(width, height);
    this.visualWidth = width;
    this.visualHeight = height;
    this.modernChrome?.setSize(width, height);
    const hasDetail = this.detail.text.length > 0;
    this.label.setPosition(width / 2, hasDetail ? height / 2 - 9 : height / 2);
    this.detail.setPosition(width / 2, height / 2 + 10).setVisible(hasDetail);
    this.hitZone
      .setPosition(width / 2, height / 2)
      .setSize(
        this.modernChrome ? Math.max(width, MODERN_UI_MIN_TOUCH_TARGET) : width,
        this.modernChrome ? Math.max(height, MODERN_UI_MIN_TOUCH_TARGET) : height,
      );
    this.redraw();
    return this;
  }

  isDisabled(): boolean {
    return this.disabled;
  }

  setDisabled(disabled: boolean): this {
    this.disabled = disabled;
    this.redraw();
    return this;
  }

  setLabel(label: string, detail = this.detail.text): this {
    this.label.setText(label);
    this.detail.setText(detail);
    this.layout(this.x, this.y, this.visualWidth, this.visualHeight);
    return this;
  }

  setSoundEnabled(enabled: boolean): this {
    this.soundEnabled = enabled;
    return this;
  }

  setFocused(focused: boolean): this {
    this.focused = focused;
    this.redraw();
    return this;
  }

  setSelected(selected: boolean): this {
    this.selected = selected;
    this.redraw();
    return this;
  }

  activate(): boolean {
    if (this.disabled) return false;
    this.pressed = true;
    if (this.soundEnabled) AudioManager.getInstance()?.play('menuSelect');
    this.redraw();
    this.scene.time.delayedCall(ReforgedMenuTokens.motion.activationMs, () => {
      if (!this.active) return;
      this.pressed = false;
      this.redraw();
    });
    this.options.onSelect();
    return true;
  }

  getChromeFrame(): string | null {
    return this.modernChrome?.frame.name ?? null;
  }

  private redraw(): void {
    const tokens = ReforgedMenuTokens;
    const fill =
      !this.disabled && (this.hovered || this.focused || this.selected)
        ? tokens.color.surfaceRaised
        : tokens.color.canvas;
    const border = this.disabled
      ? tokens.color.border
      : this.selected
        ? tokens.color.accentActive
        : this.hovered || this.focused
          ? tokens.color.borderStrong
          : tokens.color.border;
    const inset = this.pressed ? 3 : 0;
    this.label.setAlpha(this.disabled ? 0.5 : 1);
    this.detail.setAlpha(this.disabled ? 0.5 : 1);
    if (this.modernChrome) {
      const state: ModernUiControlState = this.disabled
        ? 'disabled'
        : this.pressed
          ? 'pressed'
          : this.selected
            ? 'selected'
            : this.hovered || this.focused
              ? 'focus'
              : 'idle';
      this.modernChrome.setFrame(modernUiCardFrame(state)).setPosition(0, inset);
      const foreground =
        state === 'pressed'
          ? tokens.color.canvas
          : state === 'disabled'
            ? tokens.color.textMuted
            : tokens.color.text;
      this.label.setColor(Phaser.Display.Color.IntegerToColor(foreground).rgba);
      this.detail.setColor(
        Phaser.Display.Color.IntegerToColor(
          state === 'pressed' ? tokens.color.canvas : tokens.color.textMuted,
        ).rgba,
      );
      const labelY = this.detail.visible ? this.visualHeight / 2 - 9 : this.visualHeight / 2;
      this.label.setY(labelY + inset);
      this.detail.setY(this.visualHeight / 2 + 10 + inset);
      return;
    }
    this.chrome.clear();
    this.chrome
      .fillStyle(fill, 1)
      .fillRect(0, inset, this.visualWidth, this.visualHeight - inset)
      .lineStyle(tokens.control.borderStroke, border, 1)
      .strokeRect(1, inset + 1, this.visualWidth - 2, this.visualHeight - inset - 2);
    if (this.focused) {
      const focusInset = tokens.control.focusStroke / 2;
      this.chrome
        .lineStyle(tokens.control.focusStroke, tokens.color.focus, 1)
        .strokeRect(
          focusInset,
          inset + focusInset,
          this.visualWidth - tokens.control.focusStroke,
          this.visualHeight - inset - tokens.control.focusStroke,
        );
    }
    const labelY = this.detail.visible ? this.visualHeight / 2 - 9 : this.visualHeight / 2;
    this.label.setY(labelY + inset);
    this.detail.setY(this.visualHeight / 2 + 10 + inset);
  }
}
