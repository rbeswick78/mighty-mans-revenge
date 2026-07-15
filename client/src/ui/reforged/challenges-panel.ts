import Phaser from 'phaser';
import { cssHex } from '@shared/config/palette.js';
import { dailyChallengeKey } from '@shared/utils/practice-gauntlet.js';
import {
  DAILY_GAUNTLET_PROGRESS_STORAGE_KEY,
  dailyGauntletProgressForKey,
  dailyGauntletProgressLabel,
  normalizeDailyGauntletProgress,
} from '../daily-gauntlet.js';
import {
  GAUNTLET_BUILD_CODEX_STORAGE_KEY,
  gauntletBuildCodexCombinedBest,
  gauntletBuildCodexEntries,
  gauntletBuildCodexLabel,
  normalizeGauntletBuildCodex,
} from '../gauntlet-build-codex.js';
import { MENU_FONTS } from '../menu/fonts.js';
import {
  GAUNTLET_BEST_CLEAR_STORAGE_KEY,
  gauntletBestClearLabel,
  normalizeGauntletBestClear,
} from '../practice-gauntlet.js';
import { practiceModePreferenceLabel } from '../practice-mode.js';
import { practiceMutatorPreferenceLabel } from '../practice-mutator.js';
import { practiceRivalPreferenceLabel } from '../practice-rival.js';
import {
  SCRAP_PIT_RECORD_STORAGE_KEY,
  normalizeScrapPitRecord,
  scrapPitButtonLabel,
} from '../scrap-pit-record.js';
import {
  advanceReforgedChallengePreferences,
  persistReforgedChallengePreference,
  readReforgedChallengePreferences,
  reforgedChallengeStartRequest,
  type ReforgedChallengeKind,
  type ReforgedChallengePreferences,
  type ReforgedChallengeSetupField,
  type ReforgedChallengeStartRequest,
} from './challenge-menu.js';
import { ReforgedMenuTokens } from './design-tokens.js';
import { MenuFocusNavigator } from './focus-navigation.js';
import { ReforgedChoiceButton } from './reforged-choice-button.js';

interface ChallengesPanelOptions {
  readonly storage: Storage;
  readonly nickname: string;
  readonly onPointerIntent: () => void;
  readonly onStartChallenge: (request: ReforgedChallengeStartRequest) => void;
}

interface ChallengeChoiceDefinition {
  readonly label: string;
  readonly detail: string;
  readonly onSelect: () => void;
}

export type ChallengesPanelView = 'challenges' | 'setup' | 'codex';

export interface ChallengesPanelSnapshot {
  readonly view: ChallengesPanelView;
  readonly optionLabels: readonly string[];
  readonly optionDetails: readonly string[];
  readonly preferences: ReforgedChallengePreferences;
  readonly nicknameReady: boolean;
  readonly status: string;
}

/** Capability-owned access to the established challenge paths and local setup. */
export class ChallengesPanel extends Phaser.GameObjects.Container {
  private readonly prompt: Phaser.GameObjects.Text;
  private readonly authorityNote: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;
  private preferences: ReforgedChallengePreferences;
  private view: ChallengesPanelView = 'challenges';
  private optionButtons: ReforgedChoiceButton[] = [];
  private optionLabels: string[] = [];
  private optionDetails: string[] = [];
  private focusNavigator: MenuFocusNavigator<ReforgedChoiceButton> | null = null;
  private codexObjects: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Text> = [];
  private panelWidth = 1;
  private panelHeight = 1;

  constructor(
    scene: Phaser.Scene,
    private readonly options: ChallengesPanelOptions,
  ) {
    super(scene, 0, 0);
    const tokens = ReforgedMenuTokens;
    this.preferences = readReforgedChallengePreferences(options.storage);
    this.prompt = scene.add.text(0, 0, '', {
      fontFamily: MENU_FONTS.HEADER,
      fontSize: `${tokens.type.body}px`,
      color: cssHex(tokens.color.text),
    });
    this.authorityNote = scene.add
      .text(0, 2, '', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: `${tokens.type.eyebrow}px`,
        color: cssHex(tokens.color.textMuted),
      })
      .setOrigin(1, 0);
    this.statusText = scene.add.text(0, 0, '', {
      fontFamily: MENU_FONTS.BODY,
      fontSize: `${tokens.type.eyebrow}px`,
      color: cssHex(tokens.color.accentActive),
    });
    this.add([this.prompt, this.authorityNote, this.statusText]);
    scene.add.existing(this);
    this.rebuild();
  }

  layout(x: number, y: number, width: number, height: number): this {
    this.setPosition(x, y);
    this.panelWidth = width;
    this.panelHeight = height;
    this.prompt.setPosition(0, 0);
    this.authorityNote.setPosition(width, 0);
    this.statusText.setPosition(0, height - 17);
    this.layoutContent();
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
    const columns = this.view === 'challenges' ? 3 : this.view === 'setup' ? 2 : 1;
    return this.moveFocus(direction * columns);
  }

  activateFocused(): boolean {
    return this.focusNavigator?.activateFocused() ?? false;
  }

  back(): boolean {
    if (this.view === 'challenges') return false;
    this.view = 'challenges';
    this.rebuild(4);
    return true;
  }

  getSnapshot(): ChallengesPanelSnapshot {
    return {
      view: this.view,
      optionLabels: [...this.optionLabels],
      optionDetails: [...this.optionDetails],
      preferences: { ...this.preferences },
      nicknameReady: this.options.nickname.length >= 2,
      status: this.statusText.text,
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
    if (current === null) {
      return this.focusNavigator.focus(delta < 0 ? this.optionButtons.length - 1 : 0);
    }
    const next = (current + delta + this.optionButtons.length * 3) % this.optionButtons.length;
    return this.focusNavigator.focus(next);
  }

  private choiceDefinitions(): readonly ChallengeChoiceDefinition[] {
    if (this.view === 'setup') return this.setupChoices();
    if (this.view === 'codex') {
      return [
        {
          label: 'BACK TO CHALLENGES',
          detail: 'RETURN TO THE ACTIVITY GRID',
          onSelect: () => this.back(),
        },
      ];
    }

    const scrapPit = scrapPitButtonLabel(
      normalizeScrapPitRecord(this.options.storage.getItem(SCRAP_PIT_RECORD_STORAGE_KEY)),
    ).split('\n');
    const dailyProgress = dailyGauntletProgressForKey(
      normalizeDailyGauntletProgress(
        this.options.storage.getItem(DAILY_GAUNTLET_PROGRESS_STORAGE_KEY),
      ),
      dailyChallengeKey(),
    );
    const codex = normalizeGauntletBuildCodex(
      this.options.storage.getItem(GAUNTLET_BUILD_CODEX_STORAGE_KEY),
    );
    return [
      {
        label: 'SPAR',
        detail: 'VS RUSTY  /  SAVED PRACTICE SETUP',
        onSelect: () => this.startChallenge('sparring'),
      },
      {
        label: scrapPit[0] ?? 'SCRAP PIT',
        detail: `${scrapPit[1] ?? 'NO WINS YET'}  /  RUSTY CREW RUMBLE`,
        onSelect: () => this.startChallenge('rusty_rumble'),
      },
      {
        label: 'GAUNTLET',
        detail: `${gauntletBestClearLabel(
          normalizeGauntletBestClear(this.options.storage.getItem(GAUNTLET_BEST_CLEAR_STORAGE_KEY)),
        )}  /  SERVER ROUTES`,
        onSelect: () => this.startChallenge('gauntlet'),
      },
      {
        label: 'DAILY RUN',
        detail: `${dailyGauntletProgressLabel(dailyProgress)}  /  UTC SEED`,
        onSelect: () => this.startChallenge('daily'),
      },
      {
        label: 'PRACTICE SETUP',
        detail: `${this.preferences.difficulty.toUpperCase()}  /  ${
          this.preferences.mode === null ? 'RANDOM MODE' : 'MODE LOCKED'
        }  /  RIVAL + CHAOS`,
        onSelect: () => this.openView('setup'),
      },
      {
        label: 'BUILD CODEX',
        detail: `${gauntletBuildCodexLabel(codex).replace('BUILD CODEX: ', '')}  /  VIEW BUILDS`,
        onSelect: () => this.openView('codex'),
      },
    ];
  }

  private setupChoices(): readonly ChallengeChoiceDefinition[] {
    return [
      {
        label: `LEVEL: ${this.preferences.difficulty.toUpperCase()}`,
        detail: 'AIM + DECISION TIMING ONLY',
        onSelect: () => this.cyclePreference('difficulty', 0),
      },
      {
        label: practiceRivalPreferenceLabel(this.preferences.rival),
        detail: 'SPAR + SCRAP PIT',
        onSelect: () => this.cyclePreference('rival', 1),
      },
      {
        label: practiceModePreferenceLabel(this.preferences.mode),
        detail: 'ORDINARY SERVER MODE RULES',
        onSelect: () => this.cyclePreference('mode', 2),
      },
      {
        label: practiceMutatorPreferenceLabel(this.preferences.mutator),
        detail: 'COMPATIBILITY FILTERED',
        onSelect: () => this.cyclePreference('mutator', 3),
      },
      {
        label: 'DONE',
        detail: 'SAVE AND RETURN',
        onSelect: () => this.back(),
      },
    ];
  }

  private startChallenge(kind: ReforgedChallengeKind): void {
    if (this.options.nickname.length < 2) {
      this.statusText.setText('CALLSIGN REQUIRED BEFORE CHALLENGE ENTRY');
      return;
    }
    const request = reforgedChallengeStartRequest(kind, this.preferences);
    this.statusText.setText(`${this.challengeLabel(kind)} REQUESTED  /  SERVER OWNS THE FIGHT`);
    this.options.onStartChallenge(request);
  }

  private challengeLabel(kind: ReforgedChallengeKind): string {
    if (kind === 'rusty_rumble') return 'SCRAP PIT';
    if (kind === 'daily') return 'DAILY RUN';
    return kind.toUpperCase();
  }

  private cyclePreference(field: ReforgedChallengeSetupField, focusIndex: number): void {
    const previous = this.preferences;
    const next = advanceReforgedChallengePreferences(previous, field);
    persistReforgedChallengePreference(this.options.storage, previous, next, field);
    this.preferences = next;
    this.rebuild(focusIndex);
  }

  private openView(view: Exclude<ChallengesPanelView, 'challenges'>): void {
    this.view = view;
    this.rebuild(0);
  }

  private rebuild(focusIndex?: number): void {
    this.clearDynamicObjects();
    const codex = normalizeGauntletBuildCodex(
      this.options.storage.getItem(GAUNTLET_BUILD_CODEX_STORAGE_KEY),
    );
    this.prompt.setText(
      this.view === 'challenges'
        ? 'CHOOSE A CHALLENGE'
        : this.view === 'setup'
          ? 'PRACTICE SETUP'
          : `BUILD CODEX  /  ${gauntletBuildCodexLabel(codex).replace('BUILD CODEX: ', '')}`,
    );
    this.authorityNote.setText(
      this.view === 'setup'
        ? 'GAUNTLET + DAILY KEEP FIXED SERVER RULES'
        : this.view === 'codex'
          ? `DEVICE LOCAL  /  COMBINED BEST ${gauntletBuildCodexCombinedBest(codex).toLocaleString('en-US')}`
          : 'SERVER RULES  /  SCORING  /  RANDOMNESS UNCHANGED',
    );
    this.statusText
      .setText(
        this.view === 'challenges'
          ? this.options.nickname.length >= 2
            ? `CALLSIGN ${this.options.nickname.toUpperCase()}  /  SERVER-AUTHORITATIVE ENTRY`
            : 'CALLSIGN REQUIRED BEFORE CHALLENGE ENTRY'
          : this.view === 'setup'
            ? 'TUNE SPAR + SCRAP PIT  /  SAVED ON THIS DEVICE'
            : '',
      )
      .setVisible(this.view !== 'codex');

    if (this.view === 'codex') this.createCodexCards();
    const choices = this.choiceDefinitions();
    this.optionLabels = choices.map(({ label }) => label);
    this.optionDetails = choices.map(({ detail }) => detail);
    this.optionButtons = choices.map((choice) => {
      const button = new ReforgedChoiceButton(this.scene, choice.label, choice.detail, {
        detailFontSize: this.view === 'setup' ? 10 : 11,
        onPointerIntent: this.options.onPointerIntent,
        onSelect: choice.onSelect,
      });
      this.add(button);
      return button;
    });
    this.focusNavigator = new MenuFocusNavigator(this.optionButtons);
    this.layoutContent();
    if (focusIndex !== undefined) this.focusNavigator.focus(focusIndex);
  }

  private createCodexCards(): void {
    const tokens = ReforgedMenuTokens;
    const codex = normalizeGauntletBuildCodex(
      this.options.storage.getItem(GAUNTLET_BUILD_CODEX_STORAGE_KEY),
    );
    gauntletBuildCodexEntries(codex).forEach((entry, index) => {
      const card = this.scene.add.graphics();
      const heading = this.scene.add.text(
        0,
        0,
        `${String(index + 1).padStart(2, '0')}  /  ${entry.discovered ? entry.name.toUpperCase() : 'LOCKED BUILD'}`,
        {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: `${tokens.type.eyebrow}px`,
          color: cssHex(entry.discovered ? tokens.color.accentActive : tokens.color.textMuted),
        },
      );
      const recipe = this.scene.add.text(0, 0, entry.recipe, {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '10px',
        color: cssHex(tokens.color.text),
      });
      const detail = this.scene.add.text(
        0,
        0,
        entry.discovered ? entry.description : 'CLEAR THIS PAIR TO DISCOVER',
        {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '9px',
          color: cssHex(tokens.color.textMuted),
        },
      );
      const best = this.scene.add.text(
        0,
        0,
        entry.bestScore === null
          ? 'BEST CLEAR --'
          : `BEST CLEAR ${entry.bestScore.toLocaleString('en-US')}`,
        {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '10px',
          color: cssHex(tokens.color.textMuted),
        },
      );
      this.codexObjects.push(card, heading, recipe, detail, best);
      this.add([card, heading, recipe, detail, best]);
    });
  }

  private clearDynamicObjects(): void {
    for (const button of this.optionButtons) this.remove(button, true);
    for (const object of this.codexObjects) this.remove(object, true);
    this.optionButtons = [];
    this.optionLabels = [];
    this.optionDetails = [];
    this.codexObjects = [];
    this.focusNavigator = null;
  }

  private layoutContent(): void {
    if (this.view === 'codex') {
      this.layoutCodex();
      return;
    }
    const columns = this.view === 'challenges' ? 3 : 2;
    const rows = this.view === 'challenges' ? 2 : 3;
    const gap = 8;
    const top = 34;
    const bottomReserve = 30;
    const buttonHeight = (this.panelHeight - top - bottomReserve - gap * (rows - 1)) / rows;
    const buttonWidth = (this.panelWidth - gap * (columns - 1)) / columns;
    this.optionButtons.forEach((button, index) => {
      if (this.view === 'setup' && index === 4) {
        button.layout(0, top + 2 * (buttonHeight + gap), this.panelWidth, buttonHeight);
        return;
      }
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

  private layoutCodex(): void {
    const tokens = ReforgedMenuTokens;
    const columns = 3;
    const rows = 2;
    const gap = 8;
    const top = 34;
    const backHeight = 42;
    const backTop = this.panelHeight - backHeight;
    const cardHeight = (backTop - top - gap * 2) / rows;
    const cardWidth = (this.panelWidth - gap * (columns - 1)) / columns;
    for (let index = 0; index < 6; index++) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = column * (cardWidth + gap);
      const y = top + row * (cardHeight + gap);
      const offset = index * 5;
      const card = this.codexObjects[offset] as Phaser.GameObjects.Graphics | undefined;
      const heading = this.codexObjects[offset + 1] as Phaser.GameObjects.Text | undefined;
      const recipe = this.codexObjects[offset + 2] as Phaser.GameObjects.Text | undefined;
      const detail = this.codexObjects[offset + 3] as Phaser.GameObjects.Text | undefined;
      const best = this.codexObjects[offset + 4] as Phaser.GameObjects.Text | undefined;
      card
        ?.clear()
        .fillStyle(tokens.color.canvas, 1)
        .fillRect(x, y, cardWidth, cardHeight)
        .lineStyle(tokens.control.borderStroke, tokens.color.border, 1)
        .strokeRect(x + 1, y + 1, cardWidth - 2, cardHeight - 2);
      heading?.setPosition(x + 10, y + 8);
      recipe?.setPosition(x + 10, y + 31);
      detail?.setPosition(x + 10, y + 51);
      best?.setPosition(x + 10, y + cardHeight - 20);
    }
    this.optionButtons[0]?.layout(0, backTop, this.panelWidth, backHeight);
  }
}
