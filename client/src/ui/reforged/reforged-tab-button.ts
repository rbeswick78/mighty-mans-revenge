import Phaser from 'phaser';
import { AudioManager } from '../../audio/audio-manager.js';
import { MENU_FONTS } from '../menu/fonts.js';
import {
  MODERN_UI_TEXTURE_KEY,
  modernUiIconFrame,
  modernUiTabFrame,
  type ModernUiControlState,
  type ModernUiIcon,
} from '../modern-ui-contract.js';
import { menuHeaderFont, modernUiEnabledForScene } from '../modern-ui-runtime.js';
import { ReforgedMenuTokens } from './design-tokens.js';

export interface ReforgedTabButtonOptions {
  readonly onSelect: () => void;
  readonly onPointerIntent: () => void;
  readonly icon?: ModernUiIcon;
}

export class ReforgedTabButton extends Phaser.GameObjects.Container {
  private readonly chrome: Phaser.GameObjects.Graphics;
  private readonly modernChrome: Phaser.GameObjects.NineSlice | null;
  private readonly icon: Phaser.GameObjects.Image | null;
  private readonly label: Phaser.GameObjects.Text;
  private readonly hitZone: Phaser.GameObjects.Zone;
  private visualWidth = 1;
  private visualHeight = 1;
  private hovered = false;
  private pressed = false;
  private focused = false;
  private selected = false;

  constructor(
    scene: Phaser.Scene,
    label: string,
    private readonly options: ReforgedTabButtonOptions,
  ) {
    super(scene, 0, 0);
    const modern = modernUiEnabledForScene(scene);
    this.chrome = scene.add.graphics().setVisible(!modern);
    this.modernChrome = modern
      ? scene.add
          .nineslice(0, 0, MODERN_UI_TEXTURE_KEY, modernUiTabFrame('idle'), 64, 64, 12, 12, 12, 12)
          .setOrigin(0)
      : null;
    this.icon =
      modern && options.icon
        ? scene.add.image(0, 0, MODERN_UI_TEXTURE_KEY, modernUiIconFrame(options.icon))
        : null;
    this.label = scene.add
      .text(0, 0, label, {
        fontFamily: modern ? menuHeaderFont(scene) : MENU_FONTS.HEADER,
        fontSize: `${ReforgedMenuTokens.type.tab}px`,
        color: Phaser.Display.Color.IntegerToColor(ReforgedMenuTokens.color.text).rgba,
        align: 'center',
      })
      .setOrigin(0.5);
    this.hitZone = scene.add.zone(0, 0, 1, 1).setInteractive({ useHandCursor: true });
    this.add(this.chrome);
    if (this.modernChrome) this.add(this.modernChrome);
    if (this.icon) this.add(this.icon);
    this.add([this.label, this.hitZone]);

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
      this.options.onPointerIntent();
      this.pressed = true;
      AudioManager.getInstance()?.play('menuSelect');
      this.redraw();
    });
    this.hitZone.on('pointerup', () => {
      if (!this.pressed) return;
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
    this.icon?.setPosition(28, height / 2).setDisplaySize(28, 28);
    this.label.setPosition(this.icon ? width / 2 + 10 : width / 2, height / 2);
    this.hitZone.setPosition(width / 2, height / 2).setSize(width, height);
    this.redraw();
    return this;
  }

  isDisabled(): boolean {
    return false;
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
    this.pressed = true;
    AudioManager.getInstance()?.play('menuSelect');
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
    const fill = this.selected
      ? tokens.color.accent
      : this.hovered || this.focused
        ? tokens.color.surfaceRaised
        : tokens.color.surface;
    const border = this.selected ? tokens.color.accentActive : tokens.color.border;
    const inset = this.pressed ? 3 : 0;

    if (this.modernChrome) {
      const state: ModernUiControlState = this.pressed
        ? 'pressed'
        : this.selected
          ? 'selected'
          : this.hovered || this.focused
            ? 'focus'
            : 'idle';
      this.modernChrome.setFrame(modernUiTabFrame(state)).setPosition(0, inset);
      this.label
        .setColor(
          Phaser.Display.Color.IntegerToColor(
            state === 'selected' || state === 'pressed' ? tokens.color.canvas : tokens.color.text,
          ).rgba,
        )
        .setY(this.visualHeight / 2 + inset);
      this.icon?.setY(this.visualHeight / 2 + inset);
      return;
    }

    this.chrome.clear();
    this.chrome.fillStyle(fill, 1).fillRect(0, inset, this.visualWidth, this.visualHeight - inset);
    this.chrome
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
    this.label.setY(this.visualHeight / 2 + inset);
  }
}
