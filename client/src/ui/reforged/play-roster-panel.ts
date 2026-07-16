import Phaser from 'phaser';
import { GAME_MODE_ROTATION, type CharacterId } from '@shared/config/game.js';
import type { PartyState } from '@shared/matchmaking/party.js';
import type { GameModeType } from '@shared/types/game.js';
import type { PlayerId } from '@shared/types/common.js';
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
  reconcilePlayRosterAvailability,
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
  readonly arenaStatusByMode?: Readonly<Partial<Record<GameModeType, string>>>;
  readonly fighterId: CharacterId;
  readonly entryEnabled: boolean;
  readonly onPointerIntent: () => void;
  readonly onSubmit: (draft: SerializedPlayRosterDraft) => boolean;
  readonly onCreateParty: (draft: SerializedPlayRosterDraft) => boolean;
  readonly onJoinParty: () => void;
  readonly onCopyPartyLink: (joinPath: string) => void;
  readonly onLeaveParty: () => void;
  readonly onKickPartyMember: (memberId: PlayerId) => void;
  readonly onUpdatePartyIntent: (draft: SerializedPlayRosterDraft) => boolean;
  readonly onCancel: () => void;
}

interface ChoiceDefinition {
  readonly label: string;
  readonly detail: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
}

export interface PlayRosterPanelSnapshot {
  readonly step: PlayRosterBuilderStep;
  readonly state: PlayRosterBuilderState;
  readonly serialized: SerializedPlayRosterDraft | null;
  readonly optionLabels: readonly string[];
  readonly arenaStatus: string | null;
  readonly entryEnabled: boolean;
  readonly queued: boolean;
  readonly partyState: Readonly<PartyState> | null;
  readonly partyError: string | null;
}

const STEP_NUMBER: Readonly<Record<PlayRosterBuilderStep, number>> = Object.freeze({
  format: 1,
  composition: 2,
  mode: 3,
  arena: 4,
  fighter: 5,
  review: 5,
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
  private persistedFighterId: CharacterId;
  private availability: PlayRosterAvailability;
  private arenaStatusByMode: Readonly<Partial<Record<GameModeType, string>>>;
  private entryEnabled: boolean;
  private queued = false;
  private partyState: Readonly<PartyState> | null = null;
  private localPlayerId: PlayerId | null = null;
  private partyError: string | null = null;
  private panelWidth = 1;
  private panelHeight = 1;

  constructor(
    scene: Phaser.Scene,
    private readonly options: PlayRosterPanelOptions,
  ) {
    super(scene, 0, 0);
    this.persistedFighterId = options.fighterId;
    this.availability = options.availability;
    this.arenaStatusByMode = options.arenaStatusByMode ?? Object.freeze({});
    this.entryEnabled = options.entryEnabled;
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
    this.reviewText.setPosition(0, this.partyState ? 56 : 62);
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
    if (this.queued || this.partyState) return false;
    let next = backPlayRosterBuilder(this.builderState);
    // Fighter choice now belongs to Fighters. Editing a reviewed Play draft
    // skips that internal pure-reducer dependency and returns to arena.
    if (playRosterBuilderStep(this.builderState) === 'review') {
      next = backPlayRosterBuilder(next);
    }
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
      serialized: serializePlayRosterDraft(this.builderState, this.availability),
      optionLabels: [...this.optionLabels],
      arenaStatus:
        this.builderState.mode === null
          ? null
          : (this.arenaStatusByMode[this.builderState.mode] ?? null),
      entryEnabled: this.entryEnabled,
      queued: this.queued,
      partyState: this.partyState,
      partyError: this.partyError,
    };
  }

  setEntryEnabled(enabled: boolean): void {
    if (this.entryEnabled === enabled) return;
    this.entryEnabled = enabled;
    this.rebuild();
  }

  setQueued(queued: boolean): void {
    if (this.queued === queued) return;
    this.queued = queued;
    this.rebuild();
  }

  setPartyState(state: Readonly<PartyState> | null, localPlayerId: PlayerId | null): void {
    this.partyState = state;
    this.localPlayerId = localPlayerId;
    this.partyError = null;
    this.rebuild();
  }

  setPartyError(error: string | null): void {
    this.partyError = error;
    this.rebuild();
  }

  setArenaSchedule(
    availability: PlayRosterAvailability,
    arenaStatusByMode: Readonly<Partial<Record<GameModeType, string>>> = Object.freeze({}),
  ): void {
    const availabilityChanged = GAME_MODE_ROTATION.some(
      (mode) =>
        availability.currentArenaByMode[mode] !== this.availability.currentArenaByMode[mode],
    );
    this.availability = availability;
    this.arenaStatusByMode = arenaStatusByMode;
    if (availabilityChanged) {
      this.builderState = reconcilePlayRosterAvailability(this.builderState, availability);
      this.rebuild();
      return;
    }
    this.refreshScheduleCopy();
  }

  setPersistedFighterSelection(fighterId: CharacterId): void {
    this.persistedFighterId = fighterId;
    if (playRosterBuilderStep(this.builderState) !== 'review') return;
    const fighterStep = backPlayRosterBuilder(this.builderState);
    this.builderState = applyPlayRosterChoice(fighterStep, this.availability, {
      kind: 'fighter',
      fighterId,
    });
    this.rebuild();
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
    let next = applyPlayRosterChoice(this.builderState, this.availability, choice);
    if (next === this.builderState) return;
    if (playRosterBuilderStep(next) === 'fighter') {
      next = applyPlayRosterChoice(next, this.availability, {
        kind: 'fighter',
        fighterId: this.persistedFighterId,
      });
    }
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
        onSelect: () => this.choose({ kind: 'format', format: format.id }),
      }));
    }
    if (step === 'composition' && this.builderState.format !== null) {
      return playRosterCompositions(this.builderState.format).map((composition) => ({
        label: compositionLabel(composition),
        detail: 'EXACT REQUEST',
        onSelect: () => this.choose({ kind: 'composition', composition }),
      }));
    }
    if (step === 'mode' && this.builderState.format !== null) {
      return playRosterModes(this.builderState.format, this.availability).map((mode) => ({
        label: modeLabel(mode),
        detail: 'EXPLICIT MODE',
        onSelect: () => this.choose({ kind: 'mode', mode }),
      }));
    }
    if (step === 'arena' && this.builderState.mode !== null) {
      const arenaName = currentPlayRosterArena(this.builderState.mode, this.availability);
      return arenaName === null
        ? []
        : [
            {
              label: arenaName.toUpperCase(),
              detail: this.arenaStatusByMode[this.builderState.mode] ?? 'CONFIRM CURRENT ARENA',
              onSelect: () => this.choose({ kind: 'arena' }),
            },
          ];
    }
    if (step === 'review') {
      if (this.partyState) {
        const isLeader = this.partyState.leaderId === this.localPlayerId;
        const definitions: ChoiceDefinition[] = [
          {
            label: 'COPY JOIN LINK',
            detail: `ROOM ${this.partyState.code}`,
            onSelect: () => this.options.onCopyPartyLink(this.partyState?.joinPath ?? ''),
          },
          {
            label: 'LEAVE PARTY',
            detail: isLeader ? 'CLOSE ROOM - NO TRANSFER YET' : 'LEAVE OPEN SLOT',
            onSelect: this.options.onLeaveParty,
          },
        ];
        if (isLeader) {
          definitions.unshift({
            label: 'UPDATE PARTY',
            detail: 'SERVER REVALIDATES INTENT',
            onSelect: () => {
              const draft = serializePlayRosterDraft(this.builderState, this.availability);
              if (draft) this.options.onUpdatePartyIntent(draft);
            },
          });
          for (const member of this.partyState.members) {
            if (member.playerId === this.localPlayerId) continue;
            definitions.push({
              label: `KICK ${member.nickname.toUpperCase()}`,
              detail: fighterLabel(member.fighterId),
              onSelect: () => this.options.onKickPartyMember(member.playerId),
            });
          }
        }
        return definitions;
      }
      return [
        {
          label: this.queued ? 'CANCEL QUEUE' : 'ENTER MATCH',
          detail: this.queued
            ? 'RELEASE SERVER ARENA LOCK'
            : this.entryEnabled
              ? 'SERVER-VALIDATED INTENT'
              : 'REQUIRES LIVE SERVER SCHEDULE',
          onSelect: () => {
            if (this.queued) {
              this.options.onCancel();
              return;
            }
            const draft = serializePlayRosterDraft(this.builderState, this.availability);
            if (this.entryEnabled && draft) this.options.onSubmit(draft);
          },
        },
        {
          label: 'CREATE PARTY',
          detail: 'SERVER-OWNED ROOM CODE',
          disabled: !this.entryEnabled || (this.builderState.composition?.humanCount ?? 0) < 2,
          onSelect: () => {
            const draft = serializePlayRosterDraft(this.builderState, this.availability);
            if (draft) this.options.onCreateParty(draft);
          },
        },
        {
          label: 'JOIN PARTY',
          detail: 'ENTER CODE OR SHARE LINK',
          disabled: !this.entryEnabled,
          onSelect: this.options.onJoinParty,
        },
      ];
    }
    return [];
  }

  private rebuild(): void {
    for (const button of this.optionButtons) button.destroy(true);
    this.optionButtons = [];
    this.optionLabels = [];
    this.focusNavigator = null;

    const step = playRosterBuilderStep(this.builderState);
    this.reviewText.setPosition(0, this.partyState ? 56 : 62);
    const number = STEP_NUMBER[step];
    this.stageLabel.setText(`PLAY ROSTER  /  STEP ${number} OF 5`);
    this.prompt.setText(this.promptFor(step));
    this.trail.setText(this.trailText());
    const serialized = serializePlayRosterDraft(this.builderState, this.availability);
    this.reviewText
      .setText(serialized ? this.reviewCopy(serialized) : '')
      .setVisible(serialized !== null);

    const choices = this.choiceDefinitions();
    this.optionLabels = choices.map(({ label }) => label);
    this.optionButtons = choices.map((definition) => {
      const button = new ReforgedChoiceButton(this.scene, definition.label, definition.detail, {
        onPointerIntent: this.options.onPointerIntent,
        onSelect: definition.onSelect,
      });
      if (
        definition.disabled ||
        (step === 'review' &&
          !this.queued &&
          !this.partyState &&
          definition.label === 'ENTER MATCH')
      ) {
        button.setDisabled(definition.disabled ?? !this.entryEnabled);
      }
      this.add(button);
      return button;
    });
    this.focusNavigator = new MenuFocusNavigator(this.optionButtons);
    this.layoutOptions();
  }

  private refreshScheduleCopy(): void {
    const step = playRosterBuilderStep(this.builderState);
    if (step === 'arena') {
      const definition = this.choiceDefinitions()[0];
      const button = this.optionButtons[0];
      if (definition && button) button.setLabel(definition.label, definition.detail);
    }
    if (step === 'review') {
      const serialized = serializePlayRosterDraft(this.builderState, this.availability);
      this.reviewText.setText(serialized ? this.reviewCopy(serialized) : '');
    }
  }

  private layoutOptions(): void {
    if (this.optionButtons.length === 0) return;
    const columns = Math.min(3, this.optionButtons.length);
    const rows = Math.ceil(this.optionButtons.length / columns);
    const gap = 8;
    const top = this.partyState ? 210 : 56;
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
        return 'READING YOUR PERSISTED FIGHTERS TAB SELECTION';
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
    if (this.partyState) {
      const members = this.partyState.members
        .map(
          (member) =>
            `${member.playerId === this.partyState?.leaderId ? 'LEADER' : 'MEMBER'}  /  ${member.nickname.toUpperCase()}  /  ${fighterLabel(member.fighterId)}`,
        )
        .join('\n');
      return [
        `PARTY ${this.partyState.code}  /  ${this.partyState.format.toUpperCase()}  /  ${this.partyState.members.length} OF ${this.partyState.capacity} HUMAN SLOTS`,
        members,
        `${modeLabel(this.partyState.intent.mode)}  /  ${this.partyState.intent.scheduledArena.mapName.toUpperCase()}`,
        this.partyError
          ? `REQUEST REJECTED  /  ${this.partyError.toUpperCase()}`
          : 'SERVER-OWNED PARTY STATE',
        'READINESS AND PARTY QUEUEING ARRIVE IN BATCH 13',
      ].join('\n');
    }
    return [
      `${draft.format.toUpperCase()}  /  ${compositionLabel(draft.composition)}`,
      `${modeLabel(draft.mode)}  /  ${draft.arenaName.toUpperCase()}`,
      this.arenaStatusByMode[draft.mode] ?? 'READ-ONLY ARENA PREVIEW',
      `FIGHTER  /  ${fighterLabel(draft.fighterId)}`,
      '',
      this.queued
        ? 'QUEUED  -  SERVER ARENA LOCK HELD'
        : this.entryEnabled
          ? 'ROSTER INTENT READY  -  SERVER VALIDATES EVERY FIELD'
          : 'ROSTER DRAFT VALID  -  MATCH ENTRY REMAINS DISABLED',
      this.partyError ? `PARTY REQUEST REJECTED  /  ${this.partyError.toUpperCase()}` : '',
      'ESC / BACKSPACE / GAMEPAD B TO EDIT',
    ].join('\n');
  }
}
