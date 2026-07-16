import Phaser from 'phaser';
import { cssHex } from '@shared/config/palette.js';
import { menuBodyFont, menuHeaderFont } from '../modern-ui-runtime.js';
import { ReforgedMenuTokens } from './design-tokens.js';
import { MenuFocusNavigator } from './focus-navigation.js';
import { ReforgedChoiceButton } from './reforged-choice-button.js';
import {
  buildReforgedRecordSections,
  readReforgedRecordsLocalValues,
  type ReforgedRecordSection,
  type ReforgedRecordSectionId,
  type ReforgedRecordsServerSnapshots,
} from './records-model.js';

interface RecordsPanelOptions {
  readonly storage: Storage;
  readonly snapshots: ReforgedRecordsServerSnapshots;
  readonly onPointerIntent: () => void;
}

export interface RecordsPanelSnapshot {
  readonly selectedSectionId: ReforgedRecordSectionId;
  readonly sectionLabels: readonly string[];
  readonly heading: string;
  readonly authority: string;
  readonly columns: readonly [readonly string[], readonly string[]];
}

/** Read-only capability-owned archive over established record sources. */
export class RecordsPanel extends Phaser.GameObjects.Container {
  private readonly prompt: Phaser.GameObjects.Text;
  private readonly authorityNote: Phaser.GameObjects.Text;
  private readonly detailBackground: Phaser.GameObjects.Graphics;
  private readonly detailHeading: Phaser.GameObjects.Text;
  private readonly detailAuthority: Phaser.GameObjects.Text;
  private readonly leftColumn: Phaser.GameObjects.Text;
  private readonly rightColumn: Phaser.GameObjects.Text;
  private snapshots: ReforgedRecordsServerSnapshots;
  private sections: readonly ReforgedRecordSection[] = [];
  private sectionButtons: ReforgedChoiceButton[] = [];
  private focusNavigator: MenuFocusNavigator<ReforgedChoiceButton> | null = null;
  private selectedSectionId: ReforgedRecordSectionId = 'career';
  private panelWidth = 1;
  private panelHeight = 1;

  constructor(
    scene: Phaser.Scene,
    private readonly options: RecordsPanelOptions,
  ) {
    super(scene, 0, 0);
    const tokens = ReforgedMenuTokens;
    this.snapshots = options.snapshots;
    this.prompt = scene.add.text(0, 0, 'BROWSE THE ARCHIVE', {
      fontFamily: menuHeaderFont(scene),
      fontSize: `${tokens.type.body}px`,
      color: cssHex(tokens.color.text),
    });
    this.authorityNote = scene.add
      .text(0, 2, 'READ ONLY / SERVER SNAPSHOTS + ESTABLISHED DEVICE RECORDS', {
        fontFamily: menuBodyFont(scene),
        fontSize: `${tokens.type.eyebrow}px`,
        color: cssHex(tokens.color.textMuted),
      })
      .setOrigin(1, 0);
    this.detailBackground = scene.add.graphics();
    this.detailHeading = scene.add.text(0, 0, '', {
      fontFamily: menuHeaderFont(scene),
      fontSize: `${tokens.type.body}px`,
      color: cssHex(tokens.color.accentActive),
    });
    this.detailAuthority = scene.add
      .text(0, 0, '', {
        fontFamily: menuBodyFont(scene),
        fontSize: '10px',
        color: cssHex(tokens.color.textMuted),
      })
      .setOrigin(1, 0);
    const columnStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: menuHeaderFont(scene),
      fontSize: '12px',
      color: cssHex(tokens.color.text),
      lineSpacing: 7,
    };
    this.leftColumn = scene.add.text(0, 0, '', columnStyle);
    this.rightColumn = scene.add.text(0, 0, '', columnStyle);
    this.add([
      this.prompt,
      this.authorityNote,
      this.detailBackground,
      this.detailHeading,
      this.detailAuthority,
      this.leftColumn,
      this.rightColumn,
    ]);
    scene.add.existing(this);
    this.rebuildSections();
  }

  layout(x: number, y: number, width: number, height: number): this {
    this.setPosition(x, y);
    this.panelWidth = width;
    this.panelHeight = height;
    this.prompt.setPosition(0, 0);
    this.authorityNote.setPosition(width, 0);
    this.layoutContent();
    return this;
  }

  setPanelVisible(visible: boolean): void {
    this.setVisible(visible);
    if (!visible) this.clearFocus();
  }

  setServerSnapshots(snapshots: ReforgedRecordsServerSnapshots): void {
    this.snapshots = snapshots;
    this.rebuildSections();
  }

  focusFirst(): boolean {
    const index = this.sections.findIndex((section) => section.id === this.selectedSectionId);
    return this.focusNavigator?.focus(Math.max(0, index)) ?? false;
  }

  clearFocus(): void {
    this.focusNavigator?.clear();
  }

  moveHorizontal(direction: -1 | 1): boolean {
    return this.moveFocus(direction);
  }

  moveVertical(direction: -1 | 1): boolean {
    return this.moveFocus(direction);
  }

  activateFocused(): boolean {
    return this.focusNavigator?.activateFocused() ?? false;
  }

  getSnapshot(): RecordsPanelSnapshot {
    const selected = this.selectedSection();
    return {
      selectedSectionId: selected.id,
      sectionLabels: this.sections.map((section) => section.label),
      heading: selected.heading,
      authority: selected.authority,
      columns: selected.columns,
    };
  }

  getOptionCenter(index: number): { x: number; y: number } | null {
    const button = this.sectionButtons[index];
    if (!button) return null;
    return {
      x: this.x + button.x + button.width / 2,
      y: this.y + button.y + button.height / 2,
    };
  }

  private rebuildSections(): void {
    this.sections = buildReforgedRecordSections(
      this.snapshots,
      readReforgedRecordsLocalValues(this.options.storage),
    );
    if (!this.sections.some((section) => section.id === this.selectedSectionId)) {
      this.selectedSectionId = 'career';
    }
    for (const button of this.sectionButtons) this.remove(button, true);
    this.sectionButtons = this.sections.map((section) => {
      const button = new ReforgedChoiceButton(this.scene, section.label, section.summary, {
        detailFontSize: 9,
        onPointerIntent: () => {
          this.clearFocus();
          this.options.onPointerIntent();
        },
        onSelect: () => this.selectSection(section.id),
      });
      this.add(button);
      return button;
    });
    this.focusNavigator = new MenuFocusNavigator(this.sectionButtons);
    this.refreshSelection();
    this.layoutContent();
  }

  private selectedSection(): ReforgedRecordSection {
    return (
      this.sections.find((section) => section.id === this.selectedSectionId) ?? this.sections[0]
    );
  }

  private selectSection(sectionId: ReforgedRecordSectionId): void {
    this.selectedSectionId = sectionId;
    this.refreshSelection();
  }

  private refreshSelection(): void {
    const selected = this.selectedSection();
    this.sectionButtons.forEach((button, index) =>
      button.setSelected(this.sections[index]?.id === selected.id),
    );
    this.detailHeading.setText(selected.heading);
    this.detailAuthority.setText(selected.authority);
    this.leftColumn.setText(selected.columns[0].join('\n'));
    this.rightColumn.setText(selected.columns[1].join('\n'));
  }

  private moveFocus(delta: number): boolean {
    if (!this.focusNavigator || this.sectionButtons.length === 0) return false;
    const current = this.focusNavigator.getFocusedIndex();
    if (current === null) return this.focusFirst();
    const count = this.sectionButtons.length;
    return this.focusNavigator.focus((current + delta + count * 2) % count);
  }

  private layoutContent(): void {
    if (this.sectionButtons.length === 0 || this.panelWidth <= 1 || this.panelHeight <= 1) return;
    const tokens = ReforgedMenuTokens;
    const gap = 6;
    const buttonTop = 34;
    const buttonHeight = 56;
    const buttonWidth =
      (this.panelWidth - gap * (this.sectionButtons.length - 1)) / this.sectionButtons.length;
    this.sectionButtons.forEach((button, index) =>
      button.layout(index * (buttonWidth + gap), buttonTop, buttonWidth, buttonHeight),
    );

    const detailTop = buttonTop + buttonHeight + 10;
    const detailHeight = Math.max(1, this.panelHeight - detailTop);
    this.detailBackground
      .clear()
      .fillStyle(tokens.color.canvas, 1)
      .fillRect(0, detailTop, this.panelWidth, detailHeight)
      .lineStyle(tokens.control.borderStroke, tokens.color.border, 1)
      .strokeRect(1, detailTop + 1, this.panelWidth - 2, detailHeight - 2);
    this.detailHeading.setPosition(14, detailTop + 12);
    this.detailAuthority.setPosition(this.panelWidth - 14, detailTop + 15);
    const columnTop = detailTop + 48;
    const columnGap = 24;
    const columnWidth = (this.panelWidth - 28 - columnGap) / 2;
    this.leftColumn
      .setPosition(14, columnTop)
      .setWordWrapWidth(columnWidth, true)
      .setFixedSize(columnWidth, Math.max(1, detailHeight - 58));
    this.rightColumn
      .setPosition(14 + columnWidth + columnGap, columnTop)
      .setWordWrapWidth(columnWidth, true)
      .setFixedSize(columnWidth, Math.max(1, detailHeight - 58));
  }
}
