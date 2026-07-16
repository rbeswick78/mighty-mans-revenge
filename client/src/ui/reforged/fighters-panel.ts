import Phaser from 'phaser';
import { CHARACTERS, CHARACTER_IDS, type CharacterId } from '@shared/config/game.js';
import { cssHex } from '@shared/config/palette.js';
import { characterMasteryLabel } from '../character-mastery.js';
import { fighterAbilityName, fighterBriefing } from '../fighter-briefing.js';
import { menuBodyFont, menuHeaderFont } from '../modern-ui-runtime.js';
import { ReforgedMenuTokens } from './design-tokens.js';
import { MenuFocusNavigator } from './focus-navigation.js';
import { ReforgedChoiceButton } from './reforged-choice-button.js';

interface FightersPanelOptions {
  readonly initialFighterId: CharacterId;
  readonly characterWins: Readonly<Record<CharacterId, number>>;
  readonly onPointerIntent: () => void;
  readonly onSelectionChange: (fighterId: CharacterId) => void;
}

export interface FightersPanelSnapshot {
  readonly selectedFighterId: CharacterId;
  readonly optionLabels: readonly string[];
  readonly selectedDetail: string;
}

export class FightersPanel extends Phaser.GameObjects.Container {
  private readonly prompt: Phaser.GameObjects.Text;
  private readonly authorityNote: Phaser.GameObjects.Text;
  private readonly selectedDetail: Phaser.GameObjects.Text;
  private readonly fighterButtons: ReforgedChoiceButton[];
  private readonly focusNavigator: MenuFocusNavigator<ReforgedChoiceButton>;
  private selectedFighterId: CharacterId;
  private panelWidth = 1;
  private panelHeight = 1;

  constructor(
    scene: Phaser.Scene,
    private readonly options: FightersPanelOptions,
  ) {
    super(scene, 0, 0);
    const tokens = ReforgedMenuTokens;
    this.selectedFighterId = options.initialFighterId;
    this.prompt = scene.add.text(0, 0, 'BROWSE THE ROSTER', {
      fontFamily: menuHeaderFont(scene),
      fontSize: `${tokens.type.body}px`,
      color: cssHex(tokens.color.text),
    });
    this.authorityNote = scene.add
      .text(0, 2, 'SELECT YOUR PLAY FIGHTER  /  SERVER LOCK REMAINS AUTHORITATIVE', {
        fontFamily: menuBodyFont(scene),
        fontSize: `${tokens.type.eyebrow}px`,
        color: cssHex(tokens.color.textMuted),
      })
      .setOrigin(1, 0);
    this.selectedDetail = scene.add.text(0, 0, '', {
      fontFamily: menuHeaderFont(scene),
      fontSize: `${tokens.type.eyebrow}px`,
      color: cssHex(tokens.color.accentActive),
      lineSpacing: 5,
    });
    this.add([this.prompt, this.authorityNote, this.selectedDetail]);

    this.fighterButtons = CHARACTER_IDS.map((fighterId) => {
      const fighter = CHARACTERS[fighterId];
      const mastery = characterMasteryLabel(options.characterWins[fighterId]).replace(' · ', ' / ');
      const button = new ReforgedChoiceButton(
        scene,
        fighter.displayName.toUpperCase(),
        `${fighterAbilityName(fighterId)}  /  ${fighter.maxHealth} HP  /  ${fighter.speedMultiplier.toFixed(2)}X\n${mastery}`,
        {
          detailFontSize: 10,
          onPointerIntent: options.onPointerIntent,
          onSelect: () => this.selectFighter(fighterId),
        },
      );
      this.add(button);
      return button;
    });
    this.focusNavigator = new MenuFocusNavigator(this.fighterButtons);
    scene.add.existing(this);
    this.refreshSelection();
  }

  layout(x: number, y: number, width: number, height: number): this {
    this.setPosition(x, y);
    this.panelWidth = width;
    this.panelHeight = height;
    this.prompt.setPosition(0, 0);
    this.authorityNote.setPosition(width, 0);
    this.layoutOptions();
    return this;
  }

  setPanelVisible(visible: boolean): void {
    this.setVisible(visible);
    if (!visible) this.clearFocus();
  }

  focusFirst(): boolean {
    const selectedIndex = CHARACTER_IDS.indexOf(this.selectedFighterId);
    return this.focusNavigator.focus(Math.max(0, selectedIndex));
  }

  clearFocus(): void {
    this.focusNavigator.clear();
  }

  moveHorizontal(direction: -1 | 1): boolean {
    return this.moveFocus(direction);
  }

  moveVertical(direction: -1 | 1): boolean {
    return this.moveFocus(direction * 3);
  }

  activateFocused(): boolean {
    return this.focusNavigator.activateFocused();
  }

  getSnapshot(): FightersPanelSnapshot {
    return {
      selectedFighterId: this.selectedFighterId,
      optionLabels: CHARACTER_IDS.map((fighterId) =>
        CHARACTERS[fighterId].displayName.toUpperCase(),
      ),
      selectedDetail: this.selectedDetail.text,
    };
  }

  getOptionCenter(index: number): { x: number; y: number } | null {
    const button = this.fighterButtons[index];
    if (!button) return null;
    return {
      x: this.x + button.x + button.width / 2,
      y: this.y + button.y + button.height / 2,
    };
  }

  private moveFocus(delta: number): boolean {
    const current = this.focusNavigator.getFocusedIndex();
    if (current === null) return this.focusFirst();
    const count = this.fighterButtons.length;
    return this.focusNavigator.focus((current + delta + count * 2) % count);
  }

  private selectFighter(fighterId: CharacterId): void {
    if (fighterId === this.selectedFighterId) return;
    this.selectedFighterId = fighterId;
    this.refreshSelection();
    this.options.onSelectionChange(fighterId);
  }

  private refreshSelection(): void {
    this.fighterButtons.forEach((button, index) =>
      button.setSelected(CHARACTER_IDS[index] === this.selectedFighterId),
    );
    const briefing = fighterBriefing(this.selectedFighterId);
    this.selectedDetail.setText(
      [
        `SELECTED FOR PLAY  /  ${briefing.headline}`,
        briefing.detail,
        `MASTERY  /  ${characterMasteryLabel(this.options.characterWins[this.selectedFighterId])}`,
      ].join('\n'),
    );
  }

  private layoutOptions(): void {
    const columns = 3;
    const rows = 2;
    const gap = 8;
    const top = 38;
    const detailHeight = 76;
    const availableHeight = Math.max(1, this.panelHeight - top - detailHeight - gap);
    const buttonHeight = Math.min(84, (availableHeight - gap * (rows - 1)) / rows);
    const buttonWidth = (this.panelWidth - gap * (columns - 1)) / columns;
    this.fighterButtons.forEach((button, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      button.layout(
        column * (buttonWidth + gap),
        top + row * (buttonHeight + gap),
        buttonWidth,
        buttonHeight,
      );
    });
    this.selectedDetail.setPosition(0, top + rows * buttonHeight + rows * gap + 4);
  }
}
