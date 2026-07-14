import Phaser from 'phaser';

import { Wasteland, cssHex } from '@shared/config/palette.js';
import { isTouchDevice } from '../input/is-touch-device.js';
import { MENU_FONTS } from './menu/fonts.js';
import { drawBeveledChrome } from './menu/menu-panel.js';
import { PixelButton } from './menu/pixel-button.js';

interface PracticeSetupMenuOptions {
  difficultyLabel: string;
  rivalLabel: string;
  modeLabel: string;
  mutatorLabel: string;
  onCycleDifficulty: () => void;
  onCycleRival: () => void;
  onCycleMode: () => void;
  onCycleMutator: () => void;
  onOpenChanged: (open: boolean) => void;
}

/** Focused, touch-friendly practice customization without crowding the lobby. */
export class PracticeSetupMenu {
  readonly difficultyButton: PixelButton;
  readonly rivalButton: PixelButton;
  readonly modeButton: PixelButton;
  readonly mutatorButton: PixelButton;

  private readonly overlay: Phaser.GameObjects.Container;
  private readonly doneButton: PixelButton;
  private readonly onOpenChanged: (open: boolean) => void;
  private focusedIndex = 0;
  private open = false;

  constructor(scene: Phaser.Scene, options: PracticeSetupMenuOptions) {
    this.onOpenChanged = options.onOpenChanged;
    const touch = isTouchDevice();

    const scrim = scene.add
      .rectangle(0, 0, 960, 720, Wasteland.CANVAS_BG, 0.88)
      .setOrigin(0)
      .setInteractive();
    const panel = scene.add.graphics();
    drawBeveledChrome(panel, 200, 94, 560, 532, {
      fillColor: Wasteland.HUD_STRIP_BG,
      fillAlpha: 0.98,
      strokeColor: Wasteland.CANVAS_BG,
      highlightColor: Wasteland.COVER_FILL,
      shadowColor: Wasteland.WALL_LINE,
    });

    const title = scene.add
      .text(480, 140, 'PRACTICE SETUP', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '22px',
        color: cssHex(Wasteland.TEXT_PRIMARY),
      })
      .setOrigin(0.5);
    const detail = scene.add
      .text(
        480,
        184,
        'TUNE RUSTY SPAR, SCRAP PIT, AND CREW BATTLE.\nGAUNTLET AND DAILY RUN KEEP THEIR FIXED RULES.',
        {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '14px',
          color: cssHex(Wasteland.COVER_FILL),
          align: 'center',
          lineSpacing: 4,
        },
      )
      .setOrigin(0.5);

    const buttonX = 290;
    const buttonW = 380;
    const buttonH = 48;
    this.difficultyButton = new PixelButton(
      scene,
      buttonX,
      230,
      buttonW,
      buttonH,
      options.difficultyLabel,
      {
        variant: 'secondary',
        fontSize: 10,
        hitPaddingY: 5,
        onClick: options.onCycleDifficulty,
      },
    );
    this.rivalButton = new PixelButton(scene, buttonX, 290, buttonW, buttonH, options.rivalLabel, {
      variant: 'secondary',
      fontSize: 9,
      hitPaddingY: 5,
      onClick: options.onCycleRival,
    });
    this.modeButton = new PixelButton(scene, buttonX, 350, buttonW, buttonH, options.modeLabel, {
      variant: 'secondary',
      fontSize: 9,
      hitPaddingY: 5,
      onClick: options.onCycleMode,
    });
    this.mutatorButton = new PixelButton(
      scene,
      buttonX,
      410,
      buttonW,
      buttonH,
      options.mutatorLabel,
      {
        variant: 'secondary',
        fontSize: 9,
        hitPaddingY: 5,
        onClick: options.onCycleMutator,
      },
    );
    this.doneButton = new PixelButton(scene, buttonX, 486, buttonW, 54, 'DONE', {
      variant: 'primary',
      fontSize: 11,
      hitPaddingY: 6,
      onClick: () => this.hide(),
    });
    const hint = scene.add
      .text(
        480,
        588,
        touch
          ? 'TAP A SETTING TO CYCLE  |  TAP DONE'
          : 'ARROWS / D-PAD MOVE  |  ENTER / A SELECT  |  ESC / B BACK',
        {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '11px',
          color: cssHex(Wasteland.COVER_FILL),
        },
      )
      .setOrigin(0.5);

    this.overlay = scene.add.container(0, 0, [
      scrim,
      panel,
      title,
      detail,
      this.difficultyButton,
      this.rivalButton,
      this.modeButton,
      this.mutatorButton,
      this.doneButton,
      hint,
    ]);
    this.overlay.setDepth(25_000).setVisible(false);
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.focusedIndex = 0;
    this.overlay.setVisible(true);
    this.syncFocus();
    this.onOpenChanged(true);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.overlay.setVisible(false);
    this.syncFocus();
    this.onOpenChanged(false);
  }

  back(): void {
    this.hide();
  }

  moveFocus(direction: -1 | 1): void {
    if (!this.open) return;
    const buttons = this.buttons();
    this.focusedIndex = (this.focusedIndex + direction + buttons.length) % buttons.length;
    this.syncFocus();
  }

  activateFocused(): void {
    if (!this.open) return;
    this.buttons()[this.focusedIndex]?.activate();
  }

  isOpen(): boolean {
    return this.open;
  }

  getFocusedIndex(): number {
    return this.focusedIndex;
  }

  setDifficultyLabel(label: string): void {
    this.difficultyButton.setLabel(label);
  }

  setRivalLabel(label: string): void {
    this.rivalButton.setLabel(label);
  }

  setModeLabel(label: string): void {
    this.modeButton.setLabel(label);
  }

  setMutatorLabel(label: string): void {
    this.mutatorButton.setLabel(label);
  }

  private buttons(): PixelButton[] {
    return [
      this.difficultyButton,
      this.rivalButton,
      this.modeButton,
      this.mutatorButton,
      this.doneButton,
    ];
  }

  private syncFocus(): void {
    this.buttons().forEach((button, index) => {
      button.setFocused(this.open && index === this.focusedIndex);
    });
  }
}
