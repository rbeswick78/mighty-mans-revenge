import Phaser from 'phaser';
import { CHARACTER_IDS } from '@shared/config/game.js';
import { cssHex } from '@shared/config/palette.js';
import { MENU_FONTS } from '../menu/fonts.js';
import { ReforgedMenuTokens } from './design-tokens.js';
import { MenuFocusNavigator } from './focus-navigation.js';
import {
  EMPTY_PLAY_ROSTER_STATE,
  PLAY_FORMATS,
  applyPlayRosterChoice,
  backPlayRosterBuilder,
  compositionLabel,
  currentPlayRosterArena,
  fighterLabel,
  modeLabel,
  playRosterBuilderStep,
  playRosterCompositions,
  playRosterModes,
  serializePlayRosterDraft,
  type PlayRosterAvailability,
  type PlayRosterBuilderState,
  type PlayRosterBuilderStep,
  type PlayRosterChoice,
  type SerializedPlayRosterDraft,
} from './play-roster-builder.js';
import { ReforgedChoiceButton } from './reforged-choice-button.js';

interface PlayRosterPanelOptions {
  readonly availability: PlayRosterAvailability;
  readonly onPointerIntent: () => void;
}

interface ChoiceDefinition {
  readonly label: string;
  readonly detail: string;
  readonly choice: PlayRosterChoice;
}

export interface PlayRosterPanelSnapshot {
  readonly step: PlayRosterBuilderStep;
  readonly state: PlayRosterBuilderState;
  readonly serialized: SerializedPlayRosterDraft | null;
  readonly optionLabels: readonly string[];
}

const STEP_NUMBER: Readonly<Record<PlayRosterBuilderStep, number>> = Object.freeze({
  format: 1,
  composition: 2,
  mode: 3,
  arena: 4,
  fighter: 5,
  review: 6,
});

export class PlayRosterPanel extends Phaser.GameObjects.Container {
  private readonly stageLabel: Phaser.GameObjects.Text;
  private readonly prompt: Phaser.GameObjects.Text;
  private readonly trail: Phaser.GameObjects.Text;
  private readonly reviewText: Phaser.GameObjects.Text;
  private builderState: PlayRosterBuilderState = EMPTY_PLAY_ROSTER_STATE;
  private optionButtons: ReforgedChoiceButton[] = [];
  private optionLabels: string[] = [];
  private focusNavigator: MenuFocusNavigator<ReforgedChoiceButton> | null = null;
  private panelWidth = 1;
  private panelHeight = 1;

  constructor(
    scene: Phaser.Scene,
    private readonly options: PlayRosterPanelOptions,
  ) {
    super(scene, 0, 0);
    const tokens = ReforgedMenuTokens;
    this.stageLabel = scene.add.text(0, 0, '', {
      fontFamily: MENU_FONTS.HEADER,
      fontSize: `${tokens.type.eyebrow}px`,
      color: cssHex(tokens.color.accentActive),
    });
    this.prompt = scene.add.text(0, 0, '', {
      fontFamily: MENU_FONTS.HEADER,
      fontSize: `${tokens.type.body}px`,
      color: cssHex(tokens.color.text),
    });
    this.trail = scene.add.text(0, 0, '', {
      fontFamily: MENU_FONTS.BODY,
      fontSize: `${tokens.type.eyebrow}px`,
      color: cssHex(tokens.color.textMuted),
    });
    this.reviewText = scene.add.text(0, 0, '', {
      fontFamily: MENU_FONTS.HEADER,
      fontSize: `${tokens.type.body}px`,
      color: cssHex(tokens.color.text),
      lineSpacing: 8,
    });
    this.add([this.stageLabel, this.prompt, this.trail, this.reviewText]);
    scene.add.existing(this);
    this.rebuild();
  }

  layout(x: number, y: number, width: number, height: number): this {
    this.setPosition(x, y);
    this.panelWidth = width;
    this.panelHeight = height;
    this.stageLabel.setPosition(0, 0);
    this.prompt.setPosition(0, 18);
    this.trail.setPosition(width, 2).setOrigin(1, 0);
    this.reviewText.setPosition(0, 62);
    this.layoutOptions();
    return this;
  }

  setPanelVisible(visible: boolean): void {
    this.setVisible(visible);
    if (!visible) this.clearFocus();
  }

  focusFirst(): boolean {
    return this.focusNavigator?.focus(0) ?? false;
  }

  clearFocus(): void {
    this.focusNavigator?.clear();
  }

  moveHorizontal(direction: -1 | 1): boolean {
    return this.moveFocus(direction);
  }

  moveVertical(direction: -1 | 1): boolean {
    return this.moveFocus(direction * 3);
  }

  activateFocused(): boolean {
    return this.focusNavigator?.activateFocused() ?? false;
  }

  back(): boolean {
    const next = backPlayRosterBuilder(this.builderState);
    if (next === this.builderState) return false;
    this.builderState = next;
    this.rebuild();
    this.focusFirst();
    return true;
  }

  getSnapshot(): PlayRosterPanelSnapshot {
    return {
      step: playRosterBuilderStep(this.builderState),
      state: this.builderState,
      serialized: serializePlayRosterDraft(this.builderState, this.options.availability),
      optionLabels: [...this.optionLabels],
    };
  }

  getOptionCenter(index: number): { x: number; y: number } | null {
    const button = this.optionButtons[index];
    if (!button) return null;
    return {
      x: this.x + button.x + button.width / 2,
      y: this.y + button.y + button.height / 2,
    };
  }

  private moveFocus(delta: number): boolean {
    if (!this.focusNavigator || this.optionButtons.length === 0) return false;
    const current = this.focusNavigator.getFocusedIndex();
    if (current === null)
      return this.focusNavigator.focus(delta < 0 ? this.optionButtons.length - 1 : 0);
    const next = (current + delta + this.optionButtons.length * 4) % this.optionButtons.length;
    return this.focusNavigator.focus(next);
  }

  private choose(choice: PlayRosterChoice): void {
    const next = applyPlayRosterChoice(this.builderState, this.options.availability, choice);
    if (next === this.builderState) return;
    this.builderState = next;
    this.rebuild();
    this.focusFirst();
  }

  private choiceDefinitions(): readonly ChoiceDefinition[] {
    const step = playRosterBuilderStep(this.builderState);
    if (step === 'format') {
      return PLAY_FORMATS.map((format) => ({
        label: format.label,
        detail: format.detail,
        choice: { kind: 'format', format: format.id },
      }));
    }
    if (step === 'composition' && this.builderState.format !== null) {
      return playRosterCompositions(this.builderState.format).map((composition) => ({
        label: compositionLabel(composition),
        detail: 'EXACT REQUEST',
        choice: { kind: 'composition', composition },
      }));
    }
    if (step === 'mode' && this.builderState.format !== null) {
      return playRosterModes(this.builderState.format, this.options.availability).map((mode) => ({
        label: modeLabel(mode),
        detail: 'EXPLICIT MODE',
        choice: { kind: 'mode', mode },
      }));
    }
    if (step === 'arena' && this.builderState.mode !== null) {
      const arenaName = currentPlayRosterArena(this.builderState.mode, this.options.availability);
      return arenaName === null
        ? []
        : [
            {
              label: arenaName.toUpperCase(),
              detail: 'CONFIRM CURRENT ARENA',
              choice: { kind: 'arena' },
            },
          ];
    }
    if (step === 'fighter') {
      return CHARACTER_IDS.map((fighterId) => ({
        label: fighterLabel(fighterId),
        detail: 'THIS PLAY DRAFT',
        choice: { kind: 'fighter', fighterId },
      }));
    }
    return [];
  }

  private rebuild(): void {
    for (const button of this.optionButtons) button.destroy(true);
    this.optionButtons = [];
    this.optionLabels = [];
    this.focusNavigator = null;

    const step = playRosterBuilderStep(this.builderState);
    const number = STEP_NUMBER[step];
    this.stageLabel.setText(`PLAY ROSTER  /  STEP ${number} OF 6`);
    this.prompt.setText(this.promptFor(step));
    this.trail.setText(this.trailText());
    const serialized = serializePlayRosterDraft(this.builderState, this.options.availability);
    this.reviewText
      .setText(serialized ? this.reviewCopy(serialized) : '')
      .setVisible(serialized !== null);

    const choices = this.choiceDefinitions();
    this.optionLabels = choices.map(({ label }) => label);
    this.optionButtons = choices.map((definition) => {
      const button = new ReforgedChoiceButton(this.scene, definition.label, definition.detail, {
        onPointerIntent: this.options.onPointerIntent,
        onSelect: () => this.choose(definition.choice),
      });
      this.add(button);
      return button;
    });
    this.focusNavigator = new MenuFocusNavigator(this.optionButtons);
    this.layoutOptions();
  }

  private layoutOptions(): void {
    if (this.optionButtons.length === 0) return;
    const columns = Math.min(3, this.optionButtons.length);
    const rows = Math.ceil(this.optionButtons.length / columns);
    const gap = 8;
    const top = 56;
    const availableHeight = Math.max(1, this.panelHeight - top);
    const buttonHeight = Math.min(78, (availableHeight - gap * (rows - 1)) / rows);
    const buttonWidth = (this.panelWidth - gap * (columns - 1)) / columns;
    this.optionButtons.forEach((button, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      button.layout(
        column * (buttonWidth + gap),
        top + row * (buttonHeight + gap),
        buttonWidth,
        buttonHeight,
      );
    });
  }

  private promptFor(step: PlayRosterBuilderStep): string {
    switch (step) {
      case 'format':
        return 'CHOOSE A STANDARD FORMAT';
      case 'composition':
        return 'CHOOSE EXACT HUMAN AND BOT SLOTS';
      case 'mode':
        return 'CHOOSE A COMPATIBLE MODE';
      case 'arena':
        return 'CONFIRM THE READ-ONLY ARENA SNAPSHOT';
      case 'fighter':
        return 'CHOOSE YOUR FIGHTER FOR THIS DRAFT';
      case 'review':
        return 'REVIEWED ROSTER DRAFT';
    }
  }

  private trailText(): string {
    const parts: string[] = [];
    if (this.builderState.format) parts.push(this.builderState.format.toUpperCase());
    if (this.builderState.composition) parts.push(compositionLabel(this.builderState.composition));
    if (this.builderState.mode) parts.push(modeLabel(this.builderState.mode));
    return parts.join('  /  ');
  }

  private reviewCopy(draft: SerializedPlayRosterDraft): string {
    return [
      `${draft.format.toUpperCase()}  /  ${compositionLabel(draft.composition)}`,
      `${modeLabel(draft.mode)}  /  ${draft.arenaName.toUpperCase()}`,
      `FIGHTER  /  ${fighterLabel(draft.fighterId)}`,
      '',
      'ROSTER DRAFT VALID  -  MATCH ENTRY REMAINS DISABLED',
      'ESC / BACKSPACE / GAMEPAD B TO EDIT',
    ].join('\n');
  }
}
