import Phaser from 'phaser';
import { GAME_MODE_ROTATION } from '@shared/config/game.js';
import { cssHex } from '@shared/config/palette.js';
import { listMapNames } from '@shared/maps/registry.js';
import type { ServerCapabilities } from '@shared/types/network.js';
import { MenuGamepadInput } from '../input/menu-gamepad.js';
import { GameService } from '../services/game-service.js';
import { MENU_FONTS } from '../ui/menu/fonts.js';
import { ReforgedMenuTokens } from '../ui/reforged/design-tokens.js';
import { MenuFocusNavigator } from '../ui/reforged/focus-navigation.js';
import { menuSceneForCapabilities } from '../ui/reforged/menu-route.js';
import { normalizePlayRosterAvailability } from '../ui/reforged/play-roster-builder.js';
import { PlayRosterPanel, type PlayRosterPanelSnapshot } from '../ui/reforged/play-roster-panel.js';
import { ReforgedTabButton } from '../ui/reforged/reforged-tab-button.js';
import {
  MENU_LOGICAL_HEIGHT,
  MENU_LOGICAL_WIDTH,
  currentMenuSafeArea,
  type MenuSafeArea,
  useLegacyLogicalSize,
  useReforgedMenuLogicalSize,
} from '../ui/reforged/responsive-menu-layout.js';

export const REFORGED_TABS = Object.freeze([
  Object.freeze({ id: 'play', label: 'PLAY' }),
  Object.freeze({ id: 'fighters', label: 'FIGHTERS' }),
  Object.freeze({ id: 'challenges', label: 'CHALLENGES' }),
  Object.freeze({ id: 'records', label: 'RECORDS' }),
  Object.freeze({ id: 'settings', label: 'SETTINGS' }),
] as const);

export type ReforgedTabId = (typeof REFORGED_TABS)[number]['id'];

function createBatch5RosterAvailability() {
  const arenaNames = listMapNames();
  // Batch 5 needs an injected, read-only arena value to prove the pure builder
  // boundary. This fixed preview has no clock, rotation, queue lock, network
  // emission, or authority; Batch 10 replaces the adapter with server truth.
  const preview = GAME_MODE_ROTATION.map((mode, index) => ({
    mode,
    arenaName: arenaNames[index % arenaNames.length],
  }));
  return normalizePlayRosterAvailability(preview, arenaNames);
}

export class ReforgedShellScene extends Phaser.Scene {
  private gameService!: GameService;
  private menuGamepad: MenuGamepadInput | null = null;
  private tabButtons: ReforgedTabButton[] = [];
  private focusNavigator: MenuFocusNavigator<ReforgedTabButton> | null = null;
  private playRosterPanel: PlayRosterPanel | null = null;
  private inputRegion: 'tabs' | 'play' = 'tabs';
  private activeTabId: ReforgedTabId = 'play';
  private safeArea: MenuSafeArea | null = null;
  private background!: Phaser.GameObjects.Rectangle;
  private eyebrow!: Phaser.GameObjects.Text;
  private title!: Phaser.GameObjects.Text;
  private contentPanel!: Phaser.GameObjects.Graphics;
  private contentTitle!: Phaser.GameObjects.Text;
  private contentState!: Phaser.GameObjects.Text;
  private inputHint!: Phaser.GameObjects.Text;
  private onCapabilitiesChanged: ((capabilities: Readonly<ServerCapabilities>) => void) | null =
    null;
  private onReconnecting: (() => void) | null = null;
  private onDisconnected: (() => void) | null = null;
  private leaving = false;

  constructor() {
    super({ key: 'ReforgedShellScene' });
  }

  create(): void {
    this.gameService = GameService.getInstance();
    if (menuSceneForCapabilities(this.gameService.getServerCapabilities()) !== this.scene.key) {
      useLegacyLogicalSize(this.scale);
      this.scene.start('LobbyScene');
      return;
    }

    useReforgedMenuLogicalSize(this.scale);
    this.cameras.main.setViewport(0, 0, MENU_LOGICAL_WIDTH, MENU_LOGICAL_HEIGHT);
    this.menuGamepad = new MenuGamepadInput();
    this.leaving = false;

    const tokens = ReforgedMenuTokens;
    this.background = this.add
      .rectangle(0, 0, MENU_LOGICAL_WIDTH, MENU_LOGICAL_HEIGHT, tokens.color.canvas)
      .setOrigin(0);
    this.eyebrow = this.add.text(0, 0, "MIGHTY MAN'S REVENGE  /  REFORGED", {
      fontFamily: MENU_FONTS.HEADER,
      fontSize: `${tokens.type.eyebrow}px`,
      color: cssHex(tokens.color.accentActive),
    });
    this.title = this.add.text(0, 0, 'WASTELAND COMMAND', {
      fontFamily: MENU_FONTS.HEADER,
      fontSize: `${tokens.type.title}px`,
      color: cssHex(tokens.color.text),
    });
    this.contentPanel = this.add.graphics();
    this.contentTitle = this.add.text(0, 0, 'PLAY', {
      fontFamily: MENU_FONTS.HEADER,
      fontSize: `${tokens.type.section}px`,
      color: cssHex(tokens.color.text),
    });
    this.contentState = this.add.text(0, 0, 'NAVIGATION FOUNDATION READY', {
      fontFamily: MENU_FONTS.BODY,
      fontSize: `${tokens.type.body}px`,
      color: cssHex(tokens.color.textMuted),
    });
    this.inputHint = this.add
      .text(0, 0, 'POINTER / TOUCH  /  ARROWS + ENTER  /  D-PAD + A', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: `${tokens.type.eyebrow}px`,
        color: cssHex(tokens.color.textMuted),
      })
      .setOrigin(0.5, 1);

    this.playRosterPanel = new PlayRosterPanel(this, {
      availability: createBatch5RosterAvailability(),
      onPointerIntent: () => this.enterPlayInput(false),
    });

    this.tabButtons = REFORGED_TABS.map(
      (tab) =>
        new ReforgedTabButton(this, tab.label, {
          onPointerIntent: () => {
            this.inputRegion = 'tabs';
            this.playRosterPanel?.clearFocus();
            this.focusNavigator?.clear();
          },
          onSelect: () => this.selectTab(tab.id),
        }),
    );
    this.focusNavigator = new MenuFocusNavigator(this.tabButtons);
    this.selectTab('play');
    this.bindInput();
    this.bindConnectionLifecycle();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutShell, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.layoutShell();
    this.cameras.main.fadeIn(tokens.motion.fadeMs, 0, 0, 0);
  }

  update(): void {
    const actions = this.menuGamepad?.poll();
    if (!actions?.hasAction || !this.focusNavigator) return;
    if (actions.back && this.inputRegion === 'play') {
      this.playRosterPanel?.back();
      return;
    }
    if (this.inputRegion === 'play') {
      if (actions.left) this.playRosterPanel?.moveHorizontal(-1);
      else if (actions.right) this.playRosterPanel?.moveHorizontal(1);
      else if (actions.up) this.playRosterPanel?.moveVertical(-1);
      else if (actions.down) this.playRosterPanel?.moveVertical(1);
      if (actions.confirm) this.playRosterPanel?.activateFocused();
      return;
    }
    if (actions.down && this.activeTabId === 'play') this.enterPlayInput(true);
    else if (actions.left || actions.up) this.focusNavigator.move(-1);
    else if (actions.right || actions.down) this.focusNavigator.move(1);
    if (actions.confirm) this.focusNavigator.activateFocused();
  }

  getActiveTabId(): ReforgedTabId {
    return this.activeTabId;
  }

  getSafeArea(): MenuSafeArea | null {
    return this.safeArea;
  }

  getTabCenter(tabId: ReforgedTabId): { x: number; y: number } | null {
    const index = REFORGED_TABS.findIndex((tab) => tab.id === tabId);
    const button = this.tabButtons[index];
    if (!button) return null;
    return { x: button.x + button.width / 2, y: button.y + button.height / 2 };
  }

  getPlayRosterSnapshot(): PlayRosterPanelSnapshot | null {
    return this.playRosterPanel?.getSnapshot() ?? null;
  }

  getPlayRosterOptionCenter(index: number): { x: number; y: number } | null {
    return this.activeTabId === 'play'
      ? (this.playRosterPanel?.getOptionCenter(index) ?? null)
      : null;
  }

  isPlayRosterVisible(): boolean {
    return this.activeTabId === 'play' && (this.playRosterPanel?.visible ?? false);
  }

  private bindInput(): void {
    const moveTabs = (event: KeyboardEvent, direction: -1 | 1): void => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      this.inputRegion = 'tabs';
      this.playRosterPanel?.clearFocus();
      this.focusNavigator?.move(direction);
    };
    this.input.keyboard?.on('keydown-TAB', (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (this.activeTabId === 'play' && this.inputRegion === 'tabs' && !event.shiftKey) {
        this.enterPlayInput(true);
        return;
      }
      this.inputRegion = 'tabs';
      this.playRosterPanel?.clearFocus();
      this.focusNavigator?.move(event.shiftKey ? -1 : 1);
    });
    this.input.keyboard?.on('keydown-LEFT', (event: KeyboardEvent) => {
      if (this.inputRegion === 'play') this.movePlay(event, 'left');
      else moveTabs(event, -1);
    });
    this.input.keyboard?.on('keydown-UP', (event: KeyboardEvent) => {
      if (this.inputRegion === 'play') this.movePlay(event, 'up');
      else moveTabs(event, -1);
    });
    this.input.keyboard?.on('keydown-RIGHT', (event: KeyboardEvent) => {
      if (this.inputRegion === 'play') this.movePlay(event, 'right');
      else moveTabs(event, 1);
    });
    this.input.keyboard?.on('keydown-DOWN', (event: KeyboardEvent) => {
      if (this.inputRegion === 'play') this.movePlay(event, 'down');
      else if (this.activeTabId === 'play') {
        event.preventDefault();
        this.enterPlayInput(true);
      } else moveTabs(event, 1);
    });
    this.input.keyboard?.on('keydown-ENTER', () => this.activateFocusedRegion());
    this.input.keyboard?.on('keydown-SPACE', (event: KeyboardEvent) => {
      event.preventDefault();
      this.activateFocusedRegion();
    });
    this.input.keyboard?.on('keydown-ESC', () => this.backPlayInput());
    this.input.keyboard?.on('keydown-BACKSPACE', () => this.backPlayInput());
    this.input.on('pointerdown', () => this.focusNavigator?.clear());
  }

  private bindConnectionLifecycle(): void {
    this.onCapabilitiesChanged = (capabilities) => {
      if (menuSceneForCapabilities(capabilities) !== 'ReforgedShellScene') this.returnToLobby();
    };
    this.onReconnecting = () => this.returnToLobby();
    this.onDisconnected = () => this.returnToLobby();
    this.gameService.on('capabilitiesChanged', this.onCapabilitiesChanged);
    this.gameService.on('reconnecting', this.onReconnecting);
    this.gameService.on('disconnected', this.onDisconnected);
  }

  private selectTab(tabId: ReforgedTabId): void {
    this.activeTabId = tabId;
    this.tabButtons.forEach((button, index) =>
      button.setSelected(REFORGED_TABS[index]?.id === tabId),
    );
    const tab = REFORGED_TABS.find((candidate) => candidate.id === tabId);
    this.contentTitle?.setText(tab?.label ?? 'PLAY');
    const playActive = tabId === 'play';
    this.playRosterPanel?.setPanelVisible(playActive);
    this.contentState?.setVisible(!playActive);
    this.inputHint?.setText(
      playActive
        ? 'TAP / CLICK  /  ARROWS + ENTER  /  D-PAD + A  /  ESC / B TO EDIT'
        : 'POINTER / TOUCH  /  ARROWS + ENTER  /  D-PAD + A',
    );
    if (!playActive) {
      this.inputRegion = 'tabs';
      this.playRosterPanel?.clearFocus();
    }
  }

  private layoutShell(): void {
    if (!this.background) return;
    const safe = currentMenuSafeArea(this.game.canvas);
    this.safeArea = safe;
    const tokens = ReforgedMenuTokens;
    const tabTop = safe.top + 108;
    const tabWidth =
      (safe.width - tokens.control.tabGap * (this.tabButtons.length - 1)) / this.tabButtons.length;

    this.background.setSize(MENU_LOGICAL_WIDTH, MENU_LOGICAL_HEIGHT);
    this.eyebrow.setPosition(safe.left, safe.top + 4);
    this.title.setPosition(safe.left, safe.top + 34);
    this.tabButtons.forEach((button, index) => {
      button.layout(
        safe.left + index * (tabWidth + tokens.control.tabGap),
        tabTop,
        tabWidth,
        tokens.control.tabHeight,
      );
    });

    const panelTop = tabTop + tokens.control.tabHeight + tokens.space.md;
    const panelHeight = safe.bottom - panelTop - 46;
    this.contentPanel.clear();
    this.contentPanel
      .fillStyle(tokens.color.surface, 1)
      .fillRect(safe.left, panelTop, safe.width, panelHeight)
      .lineStyle(tokens.control.borderStroke, tokens.color.border, 1)
      .strokeRect(safe.left + 1, panelTop + 1, safe.width - 2, panelHeight - 2);
    this.contentTitle.setPosition(safe.left + tokens.space.lg, panelTop + tokens.space.lg);
    this.contentState.setPosition(safe.left + tokens.space.lg, panelTop + tokens.space.lg + 52);
    this.playRosterPanel?.layout(
      safe.left + tokens.space.lg,
      panelTop + tokens.space.lg + 46,
      safe.width - tokens.space.lg * 2,
      panelHeight - tokens.space.lg * 2 - 46,
    );
    this.inputHint.setPosition((safe.left + safe.right) / 2, safe.bottom);
  }

  private enterPlayInput(focusFirst: boolean): void {
    if (this.activeTabId !== 'play') return;
    this.inputRegion = 'play';
    this.focusNavigator?.clear();
    if (focusFirst) this.playRosterPanel?.focusFirst();
  }

  private movePlay(event: KeyboardEvent, direction: 'left' | 'right' | 'up' | 'down'): void {
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (direction === 'left') this.playRosterPanel?.moveHorizontal(-1);
    else if (direction === 'right') this.playRosterPanel?.moveHorizontal(1);
    else if (direction === 'up') this.playRosterPanel?.moveVertical(-1);
    else this.playRosterPanel?.moveVertical(1);
  }

  private activateFocusedRegion(): void {
    if (this.inputRegion === 'play') this.playRosterPanel?.activateFocused();
    else this.focusNavigator?.activateFocused();
  }

  private backPlayInput(): void {
    if (this.inputRegion === 'play') this.playRosterPanel?.back();
  }

  private returnToLobby(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cleanupEvents();
    useLegacyLogicalSize(this.scale);
    this.scene.start('LobbyScene');
  }

  private cleanupEvents(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutShell, this);
    if (this.onCapabilitiesChanged) {
      this.gameService.off('capabilitiesChanged', this.onCapabilitiesChanged);
      this.onCapabilitiesChanged = null;
    }
    if (this.onReconnecting) {
      this.gameService.off('reconnecting', this.onReconnecting);
      this.onReconnecting = null;
    }
    if (this.onDisconnected) {
      this.gameService.off('disconnected', this.onDisconnected);
      this.onDisconnected = null;
    }
  }

  private handleShutdown(): void {
    this.cleanupEvents();
    this.menuGamepad = null;
    this.playRosterPanel = null;
    useLegacyLogicalSize(this.scale);
  }
}
