import Phaser from 'phaser';
import type { CharacterId } from '@shared/config/game.js';
import { cssHex } from '@shared/config/palette.js';
import { listMapNames } from '@shared/maps/registry.js';
import type {
  LeaderboardEntry,
  ServerCapabilities,
  ServerDailyGauntletLeaderboardMessage,
  ServerMatchmakingStatusMessage,
  ServerPartyErrorMessage,
  ServerPartyLeftMessage,
} from '@shared/types/network.js';
import type { MatchIntent } from '@shared/matchmaking/match-intent.js';
import type { PartyState } from '@shared/matchmaking/party.js';
import { MenuGamepadInput } from '../input/menu-gamepad.js';
import type { NormalizedArenaSchedule } from '../network/arena-schedule.js';
import type { ConnectionState } from '../network/types.js';
import { GameService, type MatchData } from '../services/game-service.js';
import { isCallsignReady, readCallsign } from '../ui/callsign.js';
import { MENU_FONTS } from '../ui/menu/fonts.js';
import type { ReforgedChallengeStartRequest } from '../ui/reforged/challenge-menu.js';
import { ChallengesPanel, type ChallengesPanelSnapshot } from '../ui/reforged/challenges-panel.js';
import { ReforgedMenuTokens } from '../ui/reforged/design-tokens.js';
import { persistFighterSelection, readFighterSelection } from '../ui/reforged/fighter-selection.js';
import { FightersPanel, type FightersPanelSnapshot } from '../ui/reforged/fighters-panel.js';
import { MenuFocusNavigator } from '../ui/reforged/focus-navigation.js';
import { menuSceneForCapabilities } from '../ui/reforged/menu-route.js';
import { PlayRosterPanel, type PlayRosterPanelSnapshot } from '../ui/reforged/play-roster-panel.js';
import type { SerializedPlayRosterDraft } from '../ui/reforged/play-roster-builder.js';
import { playSchedulePresentation } from '../ui/reforged/arena-schedule-presentation.js';
import { RecordsPanel, type RecordsPanelSnapshot } from '../ui/reforged/records-panel.js';
import type { ReforgedRecordsServerSnapshots } from '../ui/reforged/records-model.js';
import { ReforgedTabButton } from '../ui/reforged/reforged-tab-button.js';
import { SettingsPanel, type SettingsPanelSnapshot } from '../ui/reforged/settings-panel.js';
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

const SHELL_DEPTH = Object.freeze({
  background: 0,
  chrome: 10,
  panel: 20,
  controls: 30,
});

export class ReforgedShellScene extends Phaser.Scene {
  private gameService!: GameService;
  private menuGamepad: MenuGamepadInput | null = null;
  private tabButtons: ReforgedTabButton[] = [];
  private focusNavigator: MenuFocusNavigator<ReforgedTabButton> | null = null;
  private playRosterPanel: PlayRosterPanel | null = null;
  private fightersPanel: FightersPanel | null = null;
  private challengesPanel: ChallengesPanel | null = null;
  private recordsPanel: RecordsPanel | null = null;
  private settingsPanel: SettingsPanel | null = null;
  private selectedFighterId!: CharacterId;
  private nickname = '';
  private inputRegion: 'tabs' | 'play' | 'fighters' | 'challenges' | 'records' | 'settings' =
    'tabs';
  private activeTabId: ReforgedTabId = 'play';
  private safeArea: MenuSafeArea | null = null;
  private background!: Phaser.GameObjects.Rectangle;
  private eyebrow!: Phaser.GameObjects.Text;
  private title!: Phaser.GameObjects.Text;
  private contentPanel!: Phaser.GameObjects.Graphics;
  private contentTitle!: Phaser.GameObjects.Text;
  private contentState!: Phaser.GameObjects.Text;
  private inputHint!: Phaser.GameObjects.Text;
  private onMatchFound: ((matchData: MatchData) => void) | null = null;
  private onLeaderboard: ((entries: LeaderboardEntry[]) => void) | null = null;
  private onDailyLeaderboard: ((snapshot: ServerDailyGauntletLeaderboardMessage) => void) | null =
    null;
  private onCapabilitiesChanged: ((capabilities: Readonly<ServerCapabilities>) => void) | null =
    null;
  private onLobbyConfig: ((schedule: NormalizedArenaSchedule | null) => void) | null = null;
  private onMatchmakingStatus: ((status: ServerMatchmakingStatusMessage) => void) | null = null;
  private onPartyState: ((state: Readonly<PartyState> | null) => void) | null = null;
  private onPartyLeft: ((message: ServerPartyLeftMessage) => void) | null = null;
  private onPartyError: ((message: ServerPartyErrorMessage) => void) | null = null;
  private onReconnecting: (() => void) | null = null;
  private onDisconnected: (() => void) | null = null;
  private onFullscreenChange: (() => void) | null = null;
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
    this.selectedFighterId = persistFighterSelection(
      localStorage,
      readFighterSelection(localStorage),
    );
    this.nickname = readCallsign(localStorage);

    const tokens = ReforgedMenuTokens;
    this.background = this.add
      .rectangle(0, 0, MENU_LOGICAL_WIDTH, MENU_LOGICAL_HEIGHT, tokens.color.canvas)
      .setOrigin(0)
      .setDepth(SHELL_DEPTH.background);
    this.eyebrow = this.add
      .text(0, 0, "MIGHTY MAN'S REVENGE  /  REFORGED", {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: `${tokens.type.eyebrow}px`,
        color: cssHex(tokens.color.accentActive),
      })
      .setDepth(SHELL_DEPTH.chrome);
    this.title = this.add
      .text(0, 0, 'WASTELAND COMMAND', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: `${tokens.type.title}px`,
        color: cssHex(tokens.color.text),
      })
      .setDepth(SHELL_DEPTH.chrome);
    this.contentPanel = this.add.graphics().setDepth(SHELL_DEPTH.chrome);
    this.contentTitle = this.add
      .text(0, 0, 'PLAY', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: `${tokens.type.section}px`,
        color: cssHex(tokens.color.text),
      })
      .setDepth(SHELL_DEPTH.chrome);
    this.contentState = this.add
      .text(0, 0, 'NAVIGATION FOUNDATION READY', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: `${tokens.type.body}px`,
        color: cssHex(tokens.color.textMuted),
      })
      .setDepth(SHELL_DEPTH.chrome);
    this.inputHint = this.add
      .text(0, 0, 'POINTER / TOUCH  /  ARROWS + ENTER  /  D-PAD + A', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: `${tokens.type.eyebrow}px`,
        color: cssHex(tokens.color.textMuted),
      })
      .setOrigin(0.5, 1)
      .setDepth(SHELL_DEPTH.controls);

    const playSchedule = playSchedulePresentation(
      this.gameService.getServerCapabilities(),
      this.gameService.getArenaSchedule(),
      listMapNames(),
    );
    this.playRosterPanel = new PlayRosterPanel(this, {
      availability: playSchedule.availability,
      arenaStatusByMode: playSchedule.arenaStatusByMode,
      fighterId: this.selectedFighterId,
      entryEnabled: this.canSubmitMatchIntent(),
      onPointerIntent: () => this.enterPlayInput(false),
      onSubmit: (draft) => this.submitPlayIntent(draft),
      onCreateParty: (draft) => this.createParty(draft),
      onJoinParty: () => this.joinParty(),
      onCopyPartyLink: (joinPath) => this.copyPartyLink(joinPath),
      onLeaveParty: () => this.gameService.leaveParty(),
      onKickPartyMember: (memberId) => this.gameService.kickPartyMember(memberId),
      onUpdatePartyIntent: (draft) => this.updatePartyIntent(draft),
      onSetPartyReady: (ready) => this.gameService.setPartyReady(ready),
      onCancelPartyQueue: () => this.gameService.cancelPartyQueue(),
      onConfirmPartyBotFill: () => this.gameService.confirmPartyBotFill(),
      onCancel: () => this.gameService.cancelMatchmaking(),
    }).setDepth(SHELL_DEPTH.panel);
    this.playRosterPanel.setPartyState(
      this.gameService.getPartyState(),
      this.gameService.getPlayerId(),
    );
    this.fightersPanel = new FightersPanel(this, {
      initialFighterId: this.selectedFighterId,
      characterWins: this.gameService.getLatestCharacterWins(),
      onPointerIntent: () => this.enterFightersInput(false),
      onSelectionChange: (fighterId) => this.selectFighter(fighterId),
    }).setDepth(SHELL_DEPTH.panel);
    this.challengesPanel = new ChallengesPanel(this, {
      storage: localStorage,
      nickname: this.nickname,
      onPointerIntent: () => this.enterChallengesInput(false),
      onStartChallenge: (request) => this.startChallenge(request),
    }).setDepth(SHELL_DEPTH.panel);
    this.recordsPanel = new RecordsPanel(this, {
      storage: localStorage,
      snapshots: this.currentRecordsSnapshots(),
      onPointerIntent: () => this.enterRecordsInput(false),
    }).setDepth(SHELL_DEPTH.panel);
    this.settingsPanel = new SettingsPanel(this, {
      storage: localStorage,
      connectionState: this.gameService.getNetworkManager().getConnectionState(),
      fullscreenActive: Boolean(document.fullscreenElement),
      onPointerIntent: () => this.enterSettingsInput(false),
      onCallsignChange: (callsign) => this.updateCallsign(callsign),
      onRetryConnection: () => this.gameService.retryConnection(),
      onRequestFullscreen: () => this.tryStartFullscreen(),
    }).setDepth(SHELL_DEPTH.panel);

    this.tabButtons = REFORGED_TABS.map((tab) =>
      new ReforgedTabButton(this, tab.label, {
        onPointerIntent: () => {
          this.inputRegion = 'tabs';
          this.playRosterPanel?.clearFocus();
          this.fightersPanel?.clearFocus();
          this.challengesPanel?.clearFocus();
          this.recordsPanel?.clearFocus();
          this.settingsPanel?.clearFocus();
          this.focusNavigator?.clear();
        },
        onSelect: () => this.selectTab(tab.id),
      }).setDepth(SHELL_DEPTH.controls),
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
    if (actions.back && this.inputRegion !== 'tabs') {
      this.backPanelInput();
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
    if (this.inputRegion === 'fighters') {
      if (actions.left) this.fightersPanel?.moveHorizontal(-1);
      else if (actions.right) this.fightersPanel?.moveHorizontal(1);
      else if (actions.up) this.fightersPanel?.moveVertical(-1);
      else if (actions.down) this.fightersPanel?.moveVertical(1);
      if (actions.confirm) this.fightersPanel?.activateFocused();
      return;
    }
    if (this.inputRegion === 'challenges') {
      if (actions.left) this.challengesPanel?.moveHorizontal(-1);
      else if (actions.right) this.challengesPanel?.moveHorizontal(1);
      else if (actions.up) this.challengesPanel?.moveVertical(-1);
      else if (actions.down) this.challengesPanel?.moveVertical(1);
      if (actions.confirm) this.challengesPanel?.activateFocused();
      return;
    }
    if (this.inputRegion === 'records') {
      if (actions.left || actions.up) this.recordsPanel?.moveHorizontal(-1);
      else if (actions.right || actions.down) this.recordsPanel?.moveHorizontal(1);
      if (actions.confirm) this.recordsPanel?.activateFocused();
      return;
    }
    if (this.inputRegion === 'settings') {
      if (actions.left || actions.up) this.settingsPanel?.moveHorizontal(-1);
      else if (actions.right || actions.down) this.settingsPanel?.moveHorizontal(1);
      if (actions.confirm) this.settingsPanel?.activateFocused();
      return;
    }
    if (actions.down && this.activeTabId === 'play') this.enterPlayInput(true);
    else if (actions.down && this.activeTabId === 'fighters') this.enterFightersInput(true);
    else if (actions.down && this.activeTabId === 'challenges') this.enterChallengesInput(true);
    else if (actions.down && this.activeTabId === 'records') this.enterRecordsInput(true);
    else if (actions.down && this.activeTabId === 'settings') this.enterSettingsInput(true);
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

  getFightersSnapshot(): FightersPanelSnapshot | null {
    return this.fightersPanel?.getSnapshot() ?? null;
  }

  getChallengesSnapshot(): ChallengesPanelSnapshot | null {
    return this.challengesPanel?.getSnapshot() ?? null;
  }

  getRecordsSnapshot(): RecordsPanelSnapshot | null {
    return this.recordsPanel?.getSnapshot() ?? null;
  }

  getSettingsSnapshot(): SettingsPanelSnapshot | null {
    return this.settingsPanel?.getSnapshot() ?? null;
  }

  getFighterOptionCenter(index: number): { x: number; y: number } | null {
    return this.activeTabId === 'fighters'
      ? (this.fightersPanel?.getOptionCenter(index) ?? null)
      : null;
  }

  getPlayRosterOptionCenter(index: number): { x: number; y: number } | null {
    return this.activeTabId === 'play'
      ? (this.playRosterPanel?.getOptionCenter(index) ?? null)
      : null;
  }

  getChallengeOptionCenter(index: number): { x: number; y: number } | null {
    return this.activeTabId === 'challenges'
      ? (this.challengesPanel?.getOptionCenter(index) ?? null)
      : null;
  }

  getRecordOptionCenter(index: number): { x: number; y: number } | null {
    return this.activeTabId === 'records'
      ? (this.recordsPanel?.getOptionCenter(index) ?? null)
      : null;
  }

  getSettingsOptionCenter(index: number): { x: number; y: number } | null {
    return this.activeTabId === 'settings'
      ? (this.settingsPanel?.getOptionCenter(index) ?? null)
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
      this.fightersPanel?.clearFocus();
      this.challengesPanel?.clearFocus();
      this.recordsPanel?.clearFocus();
      this.settingsPanel?.clearFocus();
      this.focusNavigator?.move(direction);
    };
    this.input.keyboard?.on('keydown-TAB', (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (this.inputRegion === 'tabs' && !event.shiftKey && this.enterActivePanelInput(true)) {
        return;
      }
      this.inputRegion = 'tabs';
      this.playRosterPanel?.clearFocus();
      this.fightersPanel?.clearFocus();
      this.challengesPanel?.clearFocus();
      this.recordsPanel?.clearFocus();
      this.settingsPanel?.clearFocus();
      this.focusNavigator?.move(event.shiftKey ? -1 : 1);
    });
    this.input.keyboard?.on('keydown-LEFT', (event: KeyboardEvent) => {
      if (this.inputRegion !== 'tabs') this.movePanel(event, 'left');
      else moveTabs(event, -1);
    });
    this.input.keyboard?.on('keydown-UP', (event: KeyboardEvent) => {
      if (this.inputRegion !== 'tabs') this.movePanel(event, 'up');
      else moveTabs(event, -1);
    });
    this.input.keyboard?.on('keydown-RIGHT', (event: KeyboardEvent) => {
      if (this.inputRegion !== 'tabs') this.movePanel(event, 'right');
      else moveTabs(event, 1);
    });
    this.input.keyboard?.on('keydown-DOWN', (event: KeyboardEvent) => {
      if (this.inputRegion !== 'tabs') this.movePanel(event, 'down');
      else if (this.enterActivePanelInput(true)) {
        event.preventDefault();
      } else moveTabs(event, 1);
    });
    this.input.keyboard?.on('keydown-ENTER', () => this.activateFocusedRegion());
    this.input.keyboard?.on('keydown-SPACE', (event: KeyboardEvent) => {
      event.preventDefault();
      this.activateFocusedRegion();
    });
    this.input.keyboard?.on('keydown-ESC', () => this.backPanelInput());
    this.input.keyboard?.on('keydown-BACKSPACE', () => this.backPanelInput());
    this.input.keyboard?.on('keydown-F2', () => this.settingsPanel?.toggleAudioMute());
    this.input.on('pointerdown', () => this.focusNavigator?.clear());
  }

  private bindConnectionLifecycle(): void {
    this.onMatchFound = (matchData) => this.openCharacterSelect(matchData);
    this.onLeaderboard = () => this.refreshRecordsSnapshots();
    this.onDailyLeaderboard = () => this.refreshRecordsSnapshots();
    this.onCapabilitiesChanged = (capabilities) => {
      if (menuSceneForCapabilities(capabilities) !== 'ReforgedShellScene') this.returnToLobby();
    };
    this.onLobbyConfig = (schedule) => {
      const presentation = playSchedulePresentation(
        this.gameService.getServerCapabilities(),
        schedule,
        listMapNames(),
      );
      this.playRosterPanel?.setArenaSchedule(
        presentation.availability,
        presentation.arenaStatusByMode,
      );
      this.playRosterPanel?.setEntryEnabled(this.canSubmitMatchIntent(schedule));
    };
    this.onMatchmakingStatus = (status) => {
      if (status.status === 'queued') this.playRosterPanel?.setQueued(true);
      if (status.status === 'cancelled') this.playRosterPanel?.setQueued(false);
    };
    this.onPartyState = (state) =>
      this.playRosterPanel?.setPartyState(state, this.gameService.getPlayerId());
    this.onPartyLeft = () =>
      this.playRosterPanel?.setPartyState(null, this.gameService.getPlayerId());
    this.onPartyError = (message) => this.playRosterPanel?.setPartyError(message.code);
    this.onReconnecting = () => this.handleShellConnectionLoss('reconnecting');
    this.onDisconnected = () => this.handleShellConnectionLoss('disconnected');
    this.onFullscreenChange = () =>
      this.settingsPanel?.setFullscreenActive(Boolean(document.fullscreenElement));
    this.gameService.on('matchFound', this.onMatchFound);
    this.gameService.on('leaderboard', this.onLeaderboard);
    this.gameService.on('dailyGauntletLeaderboard', this.onDailyLeaderboard);
    this.gameService.on('capabilitiesChanged', this.onCapabilitiesChanged);
    this.gameService.on('lobbyConfig', this.onLobbyConfig);
    this.gameService.on('matchmakingStatus', this.onMatchmakingStatus);
    this.gameService.on('partyState', this.onPartyState);
    this.gameService.on('partyLeft', this.onPartyLeft);
    this.gameService.on('partyError', this.onPartyError);
    this.gameService.on('reconnecting', this.onReconnecting);
    this.gameService.on('disconnected', this.onDisconnected);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
  }

  private handleShellConnectionLoss(
    state: Extract<ConnectionState, 'reconnecting' | 'disconnected'>,
  ): void {
    this.settingsPanel?.setConnectionState(state);
    // Capability state fails closed on loss, so the complete legacy Lobby
    // remains the live recovery surface until a fresh welcome re-advertises the shell.
    this.returnToLobby();
  }

  private selectTab(tabId: ReforgedTabId): void {
    this.activeTabId = tabId;
    this.tabButtons.forEach((button, index) =>
      button.setSelected(REFORGED_TABS[index]?.id === tabId),
    );
    const tab = REFORGED_TABS.find((candidate) => candidate.id === tabId);
    this.contentTitle?.setText(tab?.label ?? 'PLAY');
    const playActive = tabId === 'play';
    const fightersActive = tabId === 'fighters';
    const challengesActive = tabId === 'challenges';
    const recordsActive = tabId === 'records';
    const settingsActive = tabId === 'settings';
    this.playRosterPanel?.setPanelVisible(playActive);
    this.fightersPanel?.setPanelVisible(fightersActive);
    this.challengesPanel?.setPanelVisible(challengesActive);
    this.recordsPanel?.setPanelVisible(recordsActive);
    this.settingsPanel?.setPanelVisible(settingsActive);
    this.contentState?.setVisible(
      !playActive && !fightersActive && !challengesActive && !recordsActive && !settingsActive,
    );
    this.inputHint?.setText(
      playActive
        ? 'TAP / CLICK  /  ARROWS + ENTER  /  D-PAD + A  /  ESC / B TO EDIT'
        : fightersActive
          ? 'TAP / CLICK  /  ARROWS + ENTER  /  D-PAD + A  /  SELECTION PERSISTS'
          : challengesActive
            ? 'TAP / CLICK  /  ARROWS + ENTER  /  D-PAD + A  /  ESC / B BACK'
            : recordsActive
              ? 'TAP / CLICK  /  ARROWS + ENTER  /  D-PAD + A  /  READ ONLY'
              : settingsActive
                ? 'TAP / CLICK  /  ARROWS + ENTER  /  D-PAD + A  /  F2 AUDIO'
                : 'POINTER / TOUCH  /  ARROWS + ENTER  /  D-PAD + A',
    );
    if (!playActive && !fightersActive && !challengesActive && !recordsActive && !settingsActive) {
      this.inputRegion = 'tabs';
    }
    if (!playActive) this.playRosterPanel?.clearFocus();
    if (!fightersActive) this.fightersPanel?.clearFocus();
    if (!challengesActive) this.challengesPanel?.clearFocus();
    if (!recordsActive) this.recordsPanel?.clearFocus();
    if (!settingsActive) this.settingsPanel?.clearFocus();
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
    this.fightersPanel?.layout(
      safe.left + tokens.space.lg,
      panelTop + tokens.space.lg + 46,
      safe.width - tokens.space.lg * 2,
      panelHeight - tokens.space.lg * 2 - 46,
    );
    this.challengesPanel?.layout(
      safe.left + tokens.space.lg,
      panelTop + tokens.space.lg + 46,
      safe.width - tokens.space.lg * 2,
      panelHeight - tokens.space.lg * 2 - 46,
    );
    this.recordsPanel?.layout(
      safe.left + tokens.space.lg,
      panelTop + tokens.space.lg + 46,
      safe.width - tokens.space.lg * 2,
      panelHeight - tokens.space.lg * 2 - 46,
    );
    this.settingsPanel?.layout(
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

  private enterFightersInput(focusFirst: boolean): void {
    if (this.activeTabId !== 'fighters') return;
    this.inputRegion = 'fighters';
    this.focusNavigator?.clear();
    if (focusFirst) this.fightersPanel?.focusFirst();
  }

  private enterChallengesInput(focusFirst: boolean): void {
    if (this.activeTabId !== 'challenges') return;
    this.inputRegion = 'challenges';
    this.focusNavigator?.clear();
    if (focusFirst) this.challengesPanel?.focusFirst();
  }

  private enterRecordsInput(focusFirst: boolean): void {
    if (this.activeTabId !== 'records') return;
    this.inputRegion = 'records';
    this.focusNavigator?.clear();
    if (focusFirst) this.recordsPanel?.focusFirst();
  }

  private enterSettingsInput(focusFirst: boolean): void {
    if (this.activeTabId !== 'settings') return;
    this.inputRegion = 'settings';
    this.focusNavigator?.clear();
    if (focusFirst) this.settingsPanel?.focusFirst();
  }

  private enterActivePanelInput(focusFirst: boolean): boolean {
    if (this.activeTabId === 'play') {
      this.enterPlayInput(focusFirst);
      return true;
    }
    if (this.activeTabId === 'fighters') {
      this.enterFightersInput(focusFirst);
      return true;
    }
    if (this.activeTabId === 'challenges') {
      this.enterChallengesInput(focusFirst);
      return true;
    }
    if (this.activeTabId === 'records') {
      this.enterRecordsInput(focusFirst);
      return true;
    }
    if (this.activeTabId === 'settings') {
      this.enterSettingsInput(focusFirst);
      return true;
    }
    return false;
  }

  private movePanel(event: KeyboardEvent, direction: 'left' | 'right' | 'up' | 'down'): void {
    if (event.defaultPrevented) return;
    event.preventDefault();
    const panel =
      this.inputRegion === 'play'
        ? this.playRosterPanel
        : this.inputRegion === 'fighters'
          ? this.fightersPanel
          : this.inputRegion === 'challenges'
            ? this.challengesPanel
            : this.inputRegion === 'records'
              ? this.recordsPanel
              : this.settingsPanel;
    if (direction === 'left') panel?.moveHorizontal(-1);
    else if (direction === 'right') panel?.moveHorizontal(1);
    else if (direction === 'up') panel?.moveVertical(-1);
    else panel?.moveVertical(1);
  }

  private activateFocusedRegion(): void {
    if (this.inputRegion === 'play') this.playRosterPanel?.activateFocused();
    else if (this.inputRegion === 'fighters') this.fightersPanel?.activateFocused();
    else if (this.inputRegion === 'challenges') this.challengesPanel?.activateFocused();
    else if (this.inputRegion === 'records') this.recordsPanel?.activateFocused();
    else if (this.inputRegion === 'settings') this.settingsPanel?.activateFocused();
    else this.focusNavigator?.activateFocused();
  }

  private backPanelInput(): void {
    if (this.inputRegion === 'play') this.playRosterPanel?.back();
    else if (this.inputRegion === 'fighters') {
      this.fightersPanel?.clearFocus();
      this.inputRegion = 'tabs';
    } else if (this.inputRegion === 'challenges' && !this.challengesPanel?.back()) {
      this.challengesPanel?.clearFocus();
      this.inputRegion = 'tabs';
    } else if (this.inputRegion === 'records') {
      this.recordsPanel?.clearFocus();
      this.inputRegion = 'tabs';
    } else if (this.inputRegion === 'settings' && !this.settingsPanel?.back()) {
      this.settingsPanel?.clearFocus();
      this.inputRegion = 'tabs';
    }
  }

  private currentRecordsSnapshots(): ReforgedRecordsServerSnapshots {
    return {
      nickname: this.nickname,
      localPlayerId: this.gameService.getPlayerId(),
      leaderboard: this.gameService.getLeaderboard(),
      dailyLeaderboard: this.gameService.getDailyGauntletLeaderboard(),
      characterWins: this.gameService.getLatestCharacterWins(),
      arenaWins: this.gameService.getLatestArenaWins(),
      lastMatchResult: this.gameService.getLastMatchResult(),
    };
  }

  private refreshRecordsSnapshots(): void {
    this.recordsPanel?.setServerSnapshots(this.currentRecordsSnapshots());
  }

  private updateCallsign(callsign: string): void {
    this.nickname = callsign;
    this.challengesPanel?.setNickname(callsign);
    this.refreshRecordsSnapshots();
    this.playRosterPanel?.setEntryEnabled(this.canSubmitMatchIntent());
  }

  private selectFighter(fighterId: CharacterId): void {
    this.selectedFighterId = persistFighterSelection(localStorage, fighterId);
    this.playRosterPanel?.setPersistedFighterSelection(this.selectedFighterId);
    if (this.gameService.getPartyState())
      this.gameService.updatePartyFighter(this.selectedFighterId);
  }

  private canSubmitMatchIntent(
    schedule: NormalizedArenaSchedule | null = this.gameService.getArenaSchedule(),
  ): boolean {
    const capabilities = this.gameService.getServerCapabilities();
    return (
      capabilities.newShell &&
      capabilities.schedules &&
      schedule !== null &&
      schedule.lockedArena === null &&
      isCallsignReady(this.nickname) &&
      this.gameService.getNetworkManager().getConnectionState() === 'connected'
    );
  }

  private submitPlayIntent(draft: SerializedPlayRosterDraft): boolean {
    const intent = this.matchIntentForDraft(draft);
    if (!intent) return false;
    this.tryStartFullscreen();
    this.gameService.submitMatchIntent(this.nickname, intent);
    return true;
  }

  private matchIntentForDraft(draft: SerializedPlayRosterDraft): MatchIntent | null {
    if (this.leaving || !this.canSubmitMatchIntent()) return null;
    const schedule = this.gameService.getArenaSchedule();
    const scheduledArena = schedule?.schedules.find((entry) => entry.mode === draft.mode);
    if (
      !schedule ||
      !scheduledArena ||
      scheduledArena.mapName !== draft.arenaName ||
      scheduledArena.rotationEndsAt <= schedule.serverTime
    ) {
      return null;
    }
    return Object.freeze({
      intentId: crypto.randomUUID(),
      format: draft.format,
      composition: Object.freeze({ ...draft.composition }),
      mode: draft.mode,
      fighterId: draft.fighterId,
      scheduledArena: Object.freeze({ ...scheduledArena }),
    });
  }

  private createParty(draft: SerializedPlayRosterDraft): boolean {
    const intent = this.matchIntentForDraft(draft);
    if (!intent || intent.composition.humanCount < 2) return false;
    this.gameService.createParty(this.nickname, intent);
    return true;
  }

  private updatePartyIntent(draft: SerializedPlayRosterDraft): boolean {
    const intent = this.matchIntentForDraft(draft);
    if (!intent) return false;
    this.gameService.updatePartyIntent(intent);
    return true;
  }

  private joinParty(): void {
    if (!this.canSubmitMatchIntent()) return;
    const fromLink = new URLSearchParams(window.location.search).get('party') ?? '';
    const target = window.prompt('Enter a party code or share link', fromLink);
    if (!target) return;
    this.gameService.joinParty(this.nickname, target, this.selectedFighterId);
  }

  private copyPartyLink(joinPath: string): void {
    if (!joinPath) return;
    const link = new URL(joinPath, window.location.origin).toString();
    void navigator.clipboard?.writeText(link).catch(() => {
      // Clipboard permission is best effort; the visible room code remains shareable.
    });
  }

  private startChallenge(request: ReforgedChallengeStartRequest): void {
    if (this.leaving || this.nickname.length < 2) return;
    this.tryStartFullscreen();
    this.gameService.startPractice(
      this.nickname,
      request.difficulty,
      request.kind,
      request.gameMode,
      request.opponentCharacterId,
      request.mutatorId,
    );
  }

  private openCharacterSelect(matchData: MatchData): void {
    if (this.leaving) return;
    this.leaving = true;
    let transitioned = false;
    const go = (): void => {
      if (transitioned) return;
      transitioned = true;
      this.cleanupEvents();
      useLegacyLogicalSize(this.scale);
      this.scene.start('CharacterSelectScene', { nickname: this.nickname, matchData });
    };
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', go);
    this.time.delayedCall(500, go);
  }

  /** Preserve the established best-effort challenge-entry fullscreen gesture. */
  private tryStartFullscreen(): void {
    if (!document.fullscreenEnabled || document.fullscreenElement) return;
    const target = document.getElementById('game-container');
    if (!target?.requestFullscreen) return;
    void target.requestFullscreen().catch(() => {
      // Embedded browsers and automation may deny it; challenge entry continues.
    });
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
    if (this.onMatchFound) {
      this.gameService.off('matchFound', this.onMatchFound);
      this.onMatchFound = null;
    }
    if (this.onLeaderboard) {
      this.gameService.off('leaderboard', this.onLeaderboard);
      this.onLeaderboard = null;
    }
    if (this.onDailyLeaderboard) {
      this.gameService.off('dailyGauntletLeaderboard', this.onDailyLeaderboard);
      this.onDailyLeaderboard = null;
    }
    if (this.onCapabilitiesChanged) {
      this.gameService.off('capabilitiesChanged', this.onCapabilitiesChanged);
      this.onCapabilitiesChanged = null;
    }
    if (this.onLobbyConfig) {
      this.gameService.off('lobbyConfig', this.onLobbyConfig);
      this.onLobbyConfig = null;
    }
    if (this.onMatchmakingStatus) {
      this.gameService.off('matchmakingStatus', this.onMatchmakingStatus);
      this.onMatchmakingStatus = null;
    }
    if (this.onPartyState) {
      this.gameService.off('partyState', this.onPartyState);
      this.onPartyState = null;
    }
    if (this.onPartyLeft) {
      this.gameService.off('partyLeft', this.onPartyLeft);
      this.onPartyLeft = null;
    }
    if (this.onPartyError) {
      this.gameService.off('partyError', this.onPartyError);
      this.onPartyError = null;
    }
    if (this.onReconnecting) {
      this.gameService.off('reconnecting', this.onReconnecting);
      this.onReconnecting = null;
    }
    if (this.onDisconnected) {
      this.gameService.off('disconnected', this.onDisconnected);
      this.onDisconnected = null;
    }
    if (this.onFullscreenChange) {
      document.removeEventListener('fullscreenchange', this.onFullscreenChange);
      this.onFullscreenChange = null;
    }
  }

  private handleShutdown(): void {
    this.cleanupEvents();
    this.menuGamepad = null;
    this.playRosterPanel = null;
    this.fightersPanel = null;
    this.challengesPanel = null;
    this.recordsPanel = null;
    this.settingsPanel = null;
    useLegacyLogicalSize(this.scale);
  }
}
