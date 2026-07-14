import Phaser from 'phaser';

import { Wasteland, cssHex } from '@shared/config/palette.js';
import { isTouchDevice } from '../input/is-touch-device.js';
import { matchLeaveCopy, type MatchMenuContext } from './match-leave-copy.js';
import { MENU_FONTS } from './menu/fonts.js';
import { drawBeveledChrome } from './menu/menu-panel.js';
import { PixelButton } from './menu/pixel-button.js';

export type MatchMenuView = 'menu' | 'confirm';

export class MatchMenu {
  private readonly launcher: PixelButton;
  private readonly overlay: Phaser.GameObjects.Container;
  private readonly title: Phaser.GameObjects.Text;
  private readonly headline: Phaser.GameObjects.Text;
  private readonly detail: Phaser.GameObjects.Text;
  private readonly primaryButton: PixelButton;
  private readonly secondaryButton: PixelButton;
  private readonly context: MatchMenuContext;
  private readonly onLeave: () => void;
  private readonly onOpenChanged: (open: boolean) => void;
  private view: MatchMenuView = 'menu';
  private focusedIndex = 0;
  private available = true;
  private open = false;

  constructor(
    scene: Phaser.Scene,
    context: MatchMenuContext,
    onLeave: () => void,
    onOpenChanged: (open: boolean) => void,
  ) {
    this.context = context;
    this.onLeave = onLeave;
    this.onOpenChanged = onOpenChanged;
    const touch = isTouchDevice();

    this.launcher = new PixelButton(scene, 816, 14, 128, 42, 'MENU', {
      variant: 'secondary',
      fontSize: 9,
      subtitle: touch ? 'TAP TO OPEN' : 'ESC / START',
      subtitleFontSize: 6,
      hitPaddingY: 8,
      onClick: () => this.show(),
    });
    this.launcher.setDepth(24_000);

    const scrim = scene.add
      .rectangle(0, 0, 960, 720, Wasteland.CANVAS_BG, 0.86)
      .setOrigin(0)
      .setInteractive();
    const panel = scene.add.graphics();
    drawBeveledChrome(panel, 210, 145, 540, 430, {
      fillColor: Wasteland.HUD_STRIP_BG,
      fillAlpha: 0.98,
      strokeColor: Wasteland.CANVAS_BG,
      highlightColor: Wasteland.COVER_FILL,
      shadowColor: Wasteland.WALL_LINE,
    });

    this.title = scene.add
      .text(480, 190, 'MATCH MENU', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '22px',
        color: cssHex(Wasteland.TEXT_PRIMARY),
      })
      .setOrigin(0.5);
    this.headline = scene.add
      .text(480, 242, '', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '13px',
        color: cssHex(Wasteland.TEXT_RELOAD_WARNING),
        align: 'center',
      })
      .setOrigin(0.5);
    this.detail = scene.add
      .text(480, 286, '', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '16px',
        color: cssHex(Wasteland.COVER_FILL),
        align: 'center',
        wordWrap: { width: 440, useAdvancedWrap: true },
        lineSpacing: 4,
      })
      .setOrigin(0.5);

    this.primaryButton = new PixelButton(scene, 290, 350, 380, 58, 'RESUME', {
      variant: 'primary',
      fontSize: 11,
      hitPaddingY: 8,
      onClick: () => this.activatePrimary(),
    });
    this.secondaryButton = new PixelButton(scene, 290, 430, 380, 58, 'LEAVE MATCH', {
      variant: 'danger',
      fontSize: 11,
      hitPaddingY: 8,
      onClick: () => this.activateSecondary(),
    });
    const hint = scene.add
      .text(
        480,
        535,
        touch ? 'TAP A CHOICE  |  COMBAT STAYS LIVE' : 'ESC / B BACK  |  ENTER / A SELECT',
        {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '12px',
          color: cssHex(Wasteland.COVER_FILL),
        },
      )
      .setOrigin(0.5);

    this.overlay = scene.add.container(0, 0, [
      scrim,
      panel,
      this.title,
      this.headline,
      this.detail,
      this.primaryButton,
      this.secondaryButton,
      hint,
    ]);
    this.overlay.setDepth(25_000).setVisible(false);
    this.renderView();
  }

  show(): void {
    if (!this.available || this.open) return;
    this.open = true;
    this.view = 'menu';
    this.focusedIndex = 0;
    this.renderView();
    this.launcher.setVisible(false);
    this.overlay.setVisible(true);
    this.onOpenChanged(true);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.overlay.setVisible(false);
    this.launcher.setVisible(this.available);
    this.onOpenChanged(false);
  }

  back(): void {
    if (!this.open) return;
    if (this.view === 'confirm') {
      this.view = 'menu';
      this.focusedIndex = 0;
      this.renderView();
      return;
    }
    this.hide();
  }

  moveFocus(direction: -1 | 1): void {
    if (!this.open) return;
    this.focusedIndex = (this.focusedIndex + direction + 2) % 2;
    this.syncFocus();
  }

  activateFocused(): void {
    if (!this.open) return;
    if (this.focusedIndex === 0) this.primaryButton.activate();
    else this.secondaryButton.activate();
  }

  setAvailable(available: boolean): void {
    this.available = available;
    if (!available && this.open) {
      this.open = false;
      this.overlay.setVisible(false);
      this.onOpenChanged(false);
    }
    this.launcher.setVisible(available && !this.open);
    this.launcher.setDisabled(!available);
  }

  isOpen(): boolean {
    return this.open;
  }

  getView(): MatchMenuView {
    return this.view;
  }

  getFocusedIndex(): number {
    return this.focusedIndex;
  }

  destroy(): void {
    this.launcher.destroy();
    this.overlay.destroy(true);
  }

  private activatePrimary(): void {
    if (this.view === 'confirm') {
      this.view = 'menu';
      this.focusedIndex = 0;
      this.renderView();
    } else {
      this.hide();
    }
  }

  private activateSecondary(): void {
    if (this.view === 'confirm') {
      this.setAvailable(false);
      this.onLeave();
      return;
    }
    this.view = 'confirm';
    this.focusedIndex = 0;
    this.renderView();
  }

  private renderView(): void {
    if (this.view === 'menu') {
      this.title.setText('MATCH MENU');
      this.headline.setText('COMBAT DOES NOT PAUSE');
      this.detail.setText('THE FIGHT KEEPS MOVING WHILE THIS MENU IS OPEN.');
      this.primaryButton.setLabel('RESUME');
      this.secondaryButton.setLabel('LEAVE MATCH');
    } else {
      const copy = matchLeaveCopy(this.context);
      this.title.setText('CONFIRM LEAVE');
      this.headline.setText(copy.headline);
      this.detail.setText(copy.detail);
      this.primaryButton.setLabel('KEEP FIGHTING');
      this.secondaryButton.setLabel('CONFIRM LEAVE');
    }
    this.syncFocus();
  }

  private syncFocus(): void {
    this.primaryButton.setFocused(this.focusedIndex === 0);
    this.secondaryButton.setFocused(this.focusedIndex === 1);
  }
}
