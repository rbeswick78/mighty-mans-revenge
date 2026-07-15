import Phaser from 'phaser';
import { cssHex } from '@shared/config/palette.js';
import { AudioManager } from '../../audio/audio-manager.js';
import type { ConnectionState } from '../../network/types.js';
import {
  isCallsignReady,
  persistCallsign,
  readCallsign,
  sanitizeCallsignInput,
} from '../callsign.js';
import { lobbyConnectionPresentation } from '../lobby-connection.js';
import { MENU_FONTS } from '../menu/fonts.js';
import { ReforgedMenuTokens } from './design-tokens.js';
import { MenuFocusNavigator } from './focus-navigation.js';
import { ReforgedChoiceButton } from './reforged-choice-button.js';
import {
  REFORGED_SETTINGS_SECTIONS,
  buildReforgedSettingsSection,
  nextAudioVolumeStep,
  type ReforgedSettingsRuntimeSnapshot,
  type ReforgedSettingsSectionId,
} from './settings-model.js';

interface SettingsPanelOptions {
  readonly storage: Storage;
  readonly connectionState: ConnectionState;
  readonly fullscreenActive: boolean;
  readonly onPointerIntent: () => void;
  readonly onCallsignChange: (callsign: string) => void;
  readonly onRetryConnection: () => void;
  readonly onRequestFullscreen: () => void;
}

interface SettingsActionDefinition {
  readonly label: string;
  readonly detail: string;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}

export interface SettingsPanelSnapshot extends ReforgedSettingsRuntimeSnapshot {
  readonly selectedSectionId: ReforgedSettingsSectionId;
  readonly sectionLabels: readonly string[];
  readonly heading: string;
  readonly authority: string;
  readonly columns: readonly [readonly string[], readonly string[]];
  readonly actionLabels: readonly string[];
  readonly editingCallsign: boolean;
}

/** Capability-owned presentation over the established local settings and recovery actions. */
export class SettingsPanel extends Phaser.GameObjects.Container {
  private readonly prompt: Phaser.GameObjects.Text;
  private readonly authorityNote: Phaser.GameObjects.Text;
  private readonly detailBackground: Phaser.GameObjects.Graphics;
  private readonly detailHeading: Phaser.GameObjects.Text;
  private readonly detailAuthority: Phaser.GameObjects.Text;
  private readonly leftColumn: Phaser.GameObjects.Text;
  private readonly rightColumn: Phaser.GameObjects.Text;
  private readonly callsignBackground: Phaser.GameObjects.Graphics;
  private readonly callsignText: Phaser.GameObjects.Text;
  private readonly callsignDom: Phaser.GameObjects.DOMElement;
  private readonly callsignInput: HTMLInputElement;
  private readonly sectionButtons: ReforgedChoiceButton[];
  private readonly actionButtons: ReforgedChoiceButton[];
  private focusTargets: ReforgedChoiceButton[] = [];
  private focusNavigator: MenuFocusNavigator<ReforgedChoiceButton> | null = null;
  private selectedSectionId: ReforgedSettingsSectionId = 'profile';
  private connectionState: ConnectionState;
  private fullscreenActive: boolean;
  private callsign: string;
  private editingCallsign: boolean;
  private actionDefinitions: readonly SettingsActionDefinition[] = [];
  private panelWidth = 1;
  private panelHeight = 1;

  constructor(
    scene: Phaser.Scene,
    private readonly options: SettingsPanelOptions,
  ) {
    super(scene, 0, 0);
    const tokens = ReforgedMenuTokens;
    this.connectionState = options.connectionState;
    this.fullscreenActive = options.fullscreenActive;
    this.callsign = readCallsign(options.storage);
    this.editingCallsign = this.callsign.length === 0;

    this.prompt = scene.add.text(0, 0, 'TUNE THE LOCAL RIG', {
      fontFamily: MENU_FONTS.HEADER,
      fontSize: `${tokens.type.body}px`,
      color: cssHex(tokens.color.text),
    });
    this.authorityNote = scene.add
      .text(0, 2, 'ESTABLISHED DEVICE SETTINGS / SERVER RECOVERY REMAINS AUTHORITATIVE', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: `${tokens.type.eyebrow}px`,
        color: cssHex(tokens.color.textMuted),
      })
      .setOrigin(1, 0);
    this.detailBackground = scene.add.graphics();
    this.detailHeading = scene.add.text(0, 0, '', {
      fontFamily: MENU_FONTS.HEADER,
      fontSize: `${tokens.type.body}px`,
      color: cssHex(tokens.color.accentActive),
    });
    this.detailAuthority = scene.add
      .text(0, 0, '', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '10px',
        color: cssHex(tokens.color.textMuted),
      })
      .setOrigin(1, 0);
    const columnStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: MENU_FONTS.HEADER,
      fontSize: '12px',
      color: cssHex(tokens.color.text),
      lineSpacing: 7,
    };
    this.leftColumn = scene.add.text(0, 0, '', columnStyle);
    this.rightColumn = scene.add.text(0, 0, '', columnStyle);
    this.callsignBackground = scene.add.graphics();
    this.callsignText = scene.add
      .text(0, 0, '', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '20px',
        color: cssHex(tokens.color.text),
      })
      .setOrigin(0.5);
    this.callsignInput = this.createCallsignInput();
    this.callsignDom = scene.add.dom(0, 0, this.callsignInput).setOrigin(0.5);

    this.add([
      this.prompt,
      this.authorityNote,
      this.detailBackground,
      this.detailHeading,
      this.detailAuthority,
      this.leftColumn,
      this.rightColumn,
      this.callsignBackground,
      this.callsignText,
      this.callsignDom,
    ]);

    this.sectionButtons = REFORGED_SETTINGS_SECTIONS.map((section) => {
      const button = new ReforgedChoiceButton(scene, section.label, '', {
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
    this.actionButtons = Array.from({ length: 4 }, (_, index) => {
      const button = new ReforgedChoiceButton(scene, '', '', {
        detailFontSize: 9,
        onPointerIntent: () => {
          this.options.onPointerIntent();
          this.rebuildFocusTargets();
          this.focusNavigator?.focus(this.sectionButtons.length + index);
        },
        onSelect: () => this.actionDefinitions[index]?.onSelect(),
      });
      this.add(button);
      return button;
    });
    scene.add.existing(this);
    this.refresh();
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
    if (!visible) {
      this.callsignInput.blur();
      this.clearFocus();
      return;
    }
    this.refreshCallsignVisibility();
    if (this.selectedSectionId === 'profile' && this.callsign.length === 0) {
      this.scene.time.delayedCall(0, () => this.callsignInput.focus());
    }
  }

  setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.refresh();
  }

  setFullscreenActive(active: boolean): void {
    this.fullscreenActive = active;
    this.refresh();
  }

  toggleAudioMute(): void {
    const audio = AudioManager.getInstance();
    if (!audio) return;
    audio.toggleMute();
    if (!audio.getIsMuted()) audio.play('menuSelect');
    this.refresh();
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
    return this.moveFocus(direction);
  }

  activateFocused(): boolean {
    return this.focusNavigator?.activateFocused() ?? false;
  }

  back(): boolean {
    if (this.editingCallsign && this.callsign.length > 0) {
      this.finishCallsignEditing();
      return true;
    }
    return false;
  }

  getSnapshot(): SettingsPanelSnapshot {
    const runtime = this.runtimeSnapshot();
    const presentation = buildReforgedSettingsSection(this.selectedSectionId, runtime);
    return {
      ...runtime,
      selectedSectionId: this.selectedSectionId,
      sectionLabels: REFORGED_SETTINGS_SECTIONS.map((section) => section.label),
      ...presentation,
      actionLabels: this.actionDefinitions.map((action) => action.label),
      editingCallsign: this.editingCallsign,
    };
  }

  getOptionCenter(index: number): { x: number; y: number } | null {
    const button = this.focusTargets[index];
    if (!button?.visible) return null;
    return {
      x: this.x + button.x + button.width / 2,
      y: this.y + button.y + button.height / 2,
    };
  }

  private createCallsignInput(): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'reforged-callsign-input';
    input.setAttribute('aria-label', 'Callsign');
    input.value = this.callsign;
    input.maxLength = 16;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('inputmode', 'text');
    Object.assign(input.style, {
      width: '520px',
      height: '42px',
      padding: '0',
      margin: '0',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      color: 'transparent',
      caretColor: 'transparent',
      fontSize: '16px',
      textAlign: 'center',
    } as Partial<CSSStyleDeclaration>);
    input.addEventListener('input', () => {
      const sanitized = sanitizeCallsignInput(input.value);
      if (sanitized !== input.value) input.value = sanitized;
      this.callsign = persistCallsign(this.options.storage, sanitized);
      this.options.onCallsignChange(this.callsign);
      this.refresh();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      if (isCallsignReady(this.callsign)) this.finishCallsignEditing();
    });
    return input;
  }

  private selectSection(sectionId: ReforgedSettingsSectionId): void {
    this.callsignInput.blur();
    this.selectedSectionId = sectionId;
    if (sectionId === 'profile' && this.callsign.length === 0) this.editingCallsign = true;
    this.refresh();
    if (sectionId === 'profile' && this.editingCallsign && this.visible) {
      this.scene.time.delayedCall(0, () => this.callsignInput.focus());
    }
  }

  private runtimeSnapshot(): ReforgedSettingsRuntimeSnapshot {
    const audio = AudioManager.getInstance();
    return {
      callsign: this.callsign,
      muted: audio?.getIsMuted() ?? false,
      masterVolume: audio?.getMasterVolume() ?? 1,
      sfxVolume: audio?.getSfxVolume() ?? 1,
      musicVolume: audio?.getMusicVolume() ?? 0.5,
      fullscreenActive: this.fullscreenActive,
      connectionState: this.connectionState,
    };
  }

  private actionChoices(): readonly SettingsActionDefinition[] {
    const audio = AudioManager.getInstance();
    if (this.selectedSectionId === 'profile') {
      return [
        {
          label: this.editingCallsign ? 'DONE EDITING' : 'EDIT CALLSIGN',
          detail: this.editingCallsign
            ? isCallsignReady(this.callsign)
              ? 'FUTURE ENTRIES USE THIS CALLSIGN'
              : 'ENTER AT LEAST 2 CHARACTERS'
            : 'NO ACCOUNT / DEVICE LOCAL',
          disabled: this.editingCallsign && !isCallsignReady(this.callsign),
          onSelect: () => {
            if (this.editingCallsign) this.finishCallsignEditing();
            else this.beginCallsignEditing();
          },
        },
      ];
    }
    if (this.selectedSectionId === 'audio') {
      return [
        {
          label: audio?.getIsMuted() ? 'AUDIO OFF' : 'AUDIO ON',
          detail: 'TOGGLE MUTE / F2',
          onSelect: () => this.toggleAudioMute(),
        },
        {
          label: `MASTER ${Math.round((audio?.getMasterVolume() ?? 1) * 100)}%`,
          detail: 'CYCLE 0 / 25 / 50 / 75 / 100',
          onSelect: () => {
            if (audio) audio.setMasterVolume(nextAudioVolumeStep(audio.getMasterVolume()));
            this.refresh();
          },
        },
        {
          label: `SFX ${Math.round((audio?.getSfxVolume() ?? 1) * 100)}%`,
          detail: 'CYCLE EXISTING SFX VOLUME',
          onSelect: () => {
            if (audio) audio.setSfxVolume(nextAudioVolumeStep(audio.getSfxVolume()));
            this.refresh();
          },
        },
        {
          label: `MUSIC ${Math.round((audio?.getMusicVolume() ?? 0.5) * 100)}%`,
          detail: 'CYCLE EXISTING MUSIC VOLUME',
          onSelect: () => {
            if (audio) audio.setMusicVolume(nextAudioVolumeStep(audio.getMusicVolume()));
            this.refresh();
          },
        },
      ];
    }
    if (this.selectedSectionId === 'display') {
      return [
        {
          label: this.fullscreenActive ? 'FULLSCREEN ACTIVE' : 'ENTER FULLSCREEN',
          detail: this.fullscreenActive ? 'PRESS ESC TO EXIT' : 'BEST-EFFORT USER GESTURE',
          disabled: this.fullscreenActive,
          onSelect: () => this.options.onRequestFullscreen(),
        },
      ];
    }
    if (this.selectedSectionId === 'signal') {
      const presentation = lobbyConnectionPresentation(this.connectionState);
      return [
        {
          label: presentation.retryVisible ? 'RETRY NOW' : 'SIGNAL ONLINE',
          detail: presentation.retryVisible ? 'RESET BACKOFF / CONNECT NOW' : 'RETRY NOT NEEDED',
          disabled: !presentation.retryVisible,
          onSelect: () => this.options.onRetryConnection(),
        },
      ];
    }
    return [];
  }

  private beginCallsignEditing(): void {
    this.editingCallsign = true;
    this.refresh();
    this.scene.time.delayedCall(0, () => this.callsignInput.focus());
  }

  private finishCallsignEditing(): void {
    if (!isCallsignReady(this.callsign)) return;
    this.editingCallsign = false;
    this.callsignInput.blur();
    this.refresh();
  }

  private refresh(): void {
    const presentation = buildReforgedSettingsSection(
      this.selectedSectionId,
      this.runtimeSnapshot(),
    );
    this.sectionButtons?.forEach((button, index) =>
      button.setSelected(REFORGED_SETTINGS_SECTIONS[index]?.id === this.selectedSectionId),
    );
    this.detailHeading?.setText(presentation.heading);
    this.detailAuthority?.setText(presentation.authority);
    this.leftColumn?.setText(presentation.columns[0].join('\n'));
    this.rightColumn?.setText(presentation.columns[1].join('\n'));
    this.callsignText?.setText(`${this.callsign}${this.editingCallsign ? '_' : ''}`);
    this.actionDefinitions = this.actionChoices();
    this.actionButtons?.forEach((button, index) => {
      const action = this.actionDefinitions[index];
      button
        .setVisible(Boolean(action))
        .setDisabled(action?.disabled ?? false)
        .setSoundEnabled(!(this.selectedSectionId === 'audio' && index === 0))
        .setLabel(action?.label ?? '', action?.detail ?? '');
    });
    this.rebuildFocusTargets();
    this.refreshCallsignVisibility();
    this.layoutContent();
  }

  private refreshCallsignVisibility(): void {
    const visible = this.visible && this.selectedSectionId === 'profile' && this.editingCallsign;
    this.callsignBackground.setVisible(this.visible && this.selectedSectionId === 'profile');
    this.callsignText.setVisible(this.visible && this.selectedSectionId === 'profile');
    this.callsignDom.setVisible(visible);
  }

  private rebuildFocusTargets(): void {
    const current = this.focusNavigator?.getFocusedIndex() ?? null;
    this.focusTargets = [
      ...this.sectionButtons,
      ...this.actionButtons.filter((button) => button.visible),
    ];
    this.focusNavigator = new MenuFocusNavigator(this.focusTargets);
    if (current !== null)
      this.focusNavigator.focus(Math.min(current, this.focusTargets.length - 1));
  }

  private moveFocus(delta: number): boolean {
    if (!this.focusNavigator || this.focusTargets.length === 0) return false;
    const current = this.focusNavigator.getFocusedIndex();
    if (current === null) return this.focusFirst();
    const count = this.focusTargets.length;
    return this.focusNavigator.focus((current + delta + count * 2) % count);
  }

  private layoutContent(): void {
    if (!this.sectionButtons?.length || this.panelWidth <= 1 || this.panelHeight <= 1) return;
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
    const columnHeight = Math.max(1, detailHeight - 110);
    this.leftColumn
      .setPosition(14, columnTop)
      .setWordWrapWidth(columnWidth, true)
      .setFixedSize(columnWidth, columnHeight);
    this.rightColumn
      .setPosition(14 + columnWidth + columnGap, columnTop)
      .setWordWrapWidth(columnWidth, true)
      .setFixedSize(columnWidth, columnHeight);

    const callsignWidth = Math.min(520, this.panelWidth - 80);
    const callsignX = this.panelWidth / 2;
    const callsignY = detailTop + Math.min(150, detailHeight - 105);
    this.callsignBackground
      .clear()
      .fillStyle(tokens.color.surfaceRaised, 1)
      .fillRect(callsignX - callsignWidth / 2, callsignY - 21, callsignWidth, 42)
      .lineStyle(tokens.control.borderStroke, tokens.color.borderStrong, 1)
      .strokeRect(callsignX - callsignWidth / 2, callsignY - 21, callsignWidth, 42);
    this.callsignText.setPosition(callsignX, callsignY);
    this.callsignDom.setPosition(callsignX, callsignY);

    const actionCount = this.actionDefinitions.length;
    const actionGap = 8;
    const actionWidth =
      actionCount > 0
        ? Math.min(260, (this.panelWidth - 28 - actionGap * (actionCount - 1)) / actionCount)
        : 1;
    const actionTotal = actionCount * actionWidth + Math.max(0, actionCount - 1) * actionGap;
    const actionStart = (this.panelWidth - actionTotal) / 2;
    const actionTop = detailTop + detailHeight - 52;
    this.actionButtons.forEach((button, index) => {
      if (index >= actionCount) return;
      button.layout(actionStart + index * (actionWidth + actionGap), actionTop, actionWidth, 42);
    });
  }
}
