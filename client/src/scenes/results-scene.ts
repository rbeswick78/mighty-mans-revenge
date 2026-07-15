import Phaser from 'phaser';
import type { PlayerId } from '@shared/types/common.js';
import type { PlayerStats } from '@shared/types/player.js';
import type { MatchResult, PracticeGauntletRouteId, TeamId } from '@shared/types/game.js';
import type { ServerMatchmakingStatusMessage } from '@shared/types/network.js';
import {
  AWARD_DEFS,
  CHARACTERS,
  createEmptyKillsByWeapon,
  crewBattleObjective,
  crewBattleScoreUnit,
  gameModeDisplayName,
  type CharacterId,
} from '@shared/config/game.js';
import type { CharacterDef } from '@shared/types/character.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { AudioManager } from '../audio/audio-manager.js';
import { isTouchDevice } from '../input/is-touch-device.js';
import { MenuGamepadInput } from '../input/menu-gamepad.js';
import { GameService, type MatchData } from '../services/game-service.js';
import { WastelandStreet, type Outcome } from '../ui/menu/wasteland-street.js';
import { MenuPanel } from '../ui/menu/menu-panel.js';
import { PixelButton } from '../ui/menu/pixel-button.js';
import { TitleLogo } from '../ui/menu/title-logo.js';
import { MENU_FONTS } from '../ui/menu/fonts.js';
import { formatRivalrySummary, nextDraftTeaser, rematchButtonLabel } from '../ui/rivalry-set.js';
import { careerRankPresentation } from '../ui/career-rank.js';
import { winStreakPresentation, type WinStreakTone } from '../ui/win-streak.js';
import { arenaMasteryResultPresentation } from '../ui/arena-mastery.js';
import { rumbleCrownResultPresentation } from '../ui/rumble-crown.js';
import { rumbleGrudgeResultLabel } from '../ui/rumble-grudge.js';
import {
  GAUNTLET_BEST_CLEAR_STORAGE_KEY,
  gauntletBestClearLabel,
  gauntletBestClearUpdate,
  gauntletActionLabel,
  gauntletNextTeaser,
  gauntletOutcomeTitle,
  gauntletResultSummary,
  gauntletRouteButtonLabel,
  gauntletRouteChoices,
  gauntletStageScoreSummary,
  normalizeGauntletBestClear,
} from '../ui/practice-gauntlet.js';
import {
  DAILY_GAUNTLET_PROGRESS_STORAGE_KEY,
  dailyGauntletStandingLabel,
  dailyGauntletProgressUpdate,
  normalizeDailyGauntletProgress,
  type DailyGauntletProgress,
} from '../ui/daily-gauntlet.js';
import {
  GAUNTLET_BUILD_CODEX_STORAGE_KEY,
  gauntletBuildCodexLabel,
  gauntletBuildCodexUpdate,
  normalizeGauntletBuildCodex,
  type GauntletBuildCodex,
  type GauntletBuildDefinition,
} from '../ui/gauntlet-build-codex.js';
import {
  SCRAP_PIT_RECORD_STORAGE_KEY,
  normalizeScrapPitRecord,
  scrapPitRecordResultLabel,
  scrapPitRecordUpdate,
  type ScrapPitRecordUpdate,
} from '../ui/scrap-pit-record.js';
import {
  CREW_TOUR_STORAGE_KEY,
  crewTourResultLabel,
  crewTourUpdate,
  normalizeCrewTourRecord,
  type CrewTourUpdate,
} from '../ui/crew-tour.js';

interface ResultsSceneData {
  result?: MatchResult;
  nickname?: string;
  matchData?: MatchData;
}

// Outcome → primary banner color (matches WastelandStreet's wash family).
const VICTORY_COLOR = Wasteland.HEALTH_GOOD; // dusty mint
const DEFEAT_COLOR = Wasteland.HIT_FLASH; // dried blood
const DRAW_COLOR = Wasteland.HEALTH_WARNING; // amber warning
const DIVIDER_COLOR = Wasteland.LOADING_BAR_FILL; // hot orange accent
const LABEL_COLOR = Wasteland.COVER_FILL; // weathered tan
const VALUE_COLOR = Wasteland.TEXT_PRIMARY; // bone-white
const WINNER_NICK_COLOR = Wasteland.HEALTH_GOOD; // mint
const LOSER_NICK_COLOR = Wasteland.HIT_FLASH; // blood
const REMATCH_STATUS_COLOR = Wasteland.HEALTH_WARNING;
const OPPONENT_LEFT_COLOR = Wasteland.HIT_FLASH;
const FOOTER_COLOR = Wasteland.WALL_LINE;
const NO_DATA_COLOR = Wasteland.COVER_FILL;
const LOSER_TINT = 0x55454f;
const FROST_WIZARD_TINT_TOP = 0xffffff;
const FROST_WIZARD_TINT_BOTTOM = 0x4aa3ff;
const RUMBLE_PORTRAIT_BG = Wasteland.CANVAS_BG;
const AWARD_NAME_COLOR = Wasteland.LOADING_BAR_FILL; // hot orange accent
const RIVALRY_COLOR = Wasteland.HEALTH_WARNING; // amber
const NEXT_DRAFT_COLOR = Wasteland.LOADING_BAR_FILL; // hot orange accent
const CONTRACT_COLOR = Wasteland.LOADING_BAR_FILL;
const CONTRACT_COMPLETE_COLOR = Wasteland.HEALTH_GOOD;
const CAREER_RANK_COLOR = Wasteland.COVER_FILL;
const CAREER_RANK_UP_COLOR = Wasteland.HEALTH_WARNING;
const WIN_STREAK_ACTIVE_COLOR = Wasteland.HEALTH_GOOD;
const WIN_STREAK_RECORD_COLOR = Wasteland.HEALTH_WARNING;
const WIN_STREAK_ENDED_COLOR = Wasteland.HIT_FLASH;

// Rivalry, contract, reputation, and awards sit between the stats panel
// (ends at y=460) and the rematch status line at y=604 on the 960x720 canvas.
const RIVALRY_Y = 476;
const CONTRACT_Y = 496;
const CAREER_RANK_Y = 516;
const AWARDS_START_Y = 536;
const AWARD_ROW_H = 20;
// Stat values align away from the centered label column. Centering every
// value in its half lets four- and five-digit damage totals bleed inward
// until CRT bloom visually joins them to labels such as DMG TAKEN.
const STAT_VALUE_GAP = 78;

export class ResultsScene extends Phaser.Scene {
  private gameService!: GameService;
  private result: MatchResult | null = null;
  private nickname = '';
  private matchData: MatchData | null = null;
  private rematchStatusText: Phaser.GameObjects.Text | null = null;
  private rematchButton: PixelButton | null = null;
  private alternateRouteButton: PixelButton | null = null;
  private lobbyButton: PixelButton | null = null;
  private rematchUnavailable = false;
  private menuGamepad: MenuGamepadInput | null = null;
  private gamepadFocusActive = false;
  private gamepadFocusIndex = 0;
  private gauntletBestClear = 0;
  private isNewGauntletBest = false;
  private dailyGauntletProgress: DailyGauntletProgress = {
    challengeKey: '',
    bestScore: 0,
    lastClearKey: null,
    streak: 0,
  };
  private isNewDailyBest = false;
  private gauntletBuildCodex: GauntletBuildCodex = { discovered: [], bestScores: {} };
  private gauntletBuild: GauntletBuildDefinition | null = null;
  private isNewGauntletBuild = false;
  private isNewGauntletBuildBest = false;
  private scrapPitRecordUpdate: ScrapPitRecordUpdate | null = null;
  private crewTourUpdate: CrewTourUpdate | null = null;

  // Event handler references for cleanup
  private onRematchStatus: ((opponentWantsRematch: boolean) => void) | null = null;
  private onMatchFound: ((matchData: MatchData) => void) | null = null;
  private onDraftState: (() => void) | null = null;
  private onOpponentDisconnected: ((playerId: PlayerId) => void) | null = null;
  private onMatchmakingStatus: ((msg: ServerMatchmakingStatusMessage) => void) | null = null;
  private onConnectionLost: (() => void) | null = null;

  constructor() {
    super({ key: 'ResultsScene' });
  }

  init(data: ResultsSceneData): void {
    this.result = data.result ?? null;
    this.nickname = data.nickname ?? 'Player';
    this.matchData = data.matchData ?? null;
    this.rematchUnavailable = false;
    this.rematchButton = null;
    this.alternateRouteButton = null;
    this.lobbyButton = null;
    this.menuGamepad = null;
    this.gamepadFocusActive = false;
    this.gamepadFocusIndex = 0;
    this.gauntletBestClear = 0;
    this.isNewGauntletBest = false;
    this.dailyGauntletProgress = {
      challengeKey: '',
      bestScore: 0,
      lastClearKey: null,
      streak: 0,
    };
    this.isNewDailyBest = false;
    this.gauntletBuildCodex = { discovered: [], bestScores: {} };
    this.gauntletBuild = null;
    this.isNewGauntletBuild = false;
    this.isNewGauntletBuildBest = false;
    this.scrapPitRecordUpdate = null;
    this.crewTourUpdate = null;
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.gameService = GameService.getInstance();
    this.menuGamepad = new MenuGamepadInput();

    if (this.matchData?.practiceKind === 'rusty_rumble' && this.result) {
      this.scrapPitRecordUpdate = scrapPitRecordUpdate(
        this.result,
        this.gameService.getPlayerId(),
        normalizeScrapPitRecord(localStorage.getItem(SCRAP_PIT_RECORD_STORAGE_KEY)),
      );
      if (this.scrapPitRecordUpdate) {
        localStorage.setItem(
          SCRAP_PIT_RECORD_STORAGE_KEY,
          JSON.stringify(this.scrapPitRecordUpdate.record),
        );
      }
    }

    if (this.matchData?.practiceKind === 'crew_battle' && this.result) {
      this.crewTourUpdate = crewTourUpdate(
        this.result,
        this.gameService.getPlayerId(),
        normalizeCrewTourRecord(localStorage.getItem(CREW_TOUR_STORAGE_KEY)),
      );
      if (this.crewTourUpdate) {
        localStorage.setItem(CREW_TOUR_STORAGE_KEY, JSON.stringify(this.crewTourUpdate.record));
      }
    }

    if (this.result?.gauntlet) {
      const previousBest = normalizeGauntletBestClear(
        localStorage.getItem(GAUNTLET_BEST_CLEAR_STORAGE_KEY),
      );
      const update = gauntletBestClearUpdate(this.result, previousBest);
      this.gauntletBestClear = update.bestScore;
      this.isNewGauntletBest = update.isNewBest;
      if (update.isNewBest) {
        localStorage.setItem(GAUNTLET_BEST_CLEAR_STORAGE_KEY, String(update.bestScore));
      }

      const buildUpdate = gauntletBuildCodexUpdate(
        this.result,
        normalizeGauntletBuildCodex(localStorage.getItem(GAUNTLET_BUILD_CODEX_STORAGE_KEY)),
      );
      this.gauntletBuildCodex = buildUpdate.codex;
      this.gauntletBuild = buildUpdate.build;
      this.isNewGauntletBuild = buildUpdate.isNewDiscovery;
      this.isNewGauntletBuildBest = buildUpdate.isNewBest;
      if (buildUpdate.isNewDiscovery || buildUpdate.isNewBest) {
        localStorage.setItem(GAUNTLET_BUILD_CODEX_STORAGE_KEY, JSON.stringify(buildUpdate.codex));
      }

      if (this.result.gauntlet.challengeKey) {
        const dailyUpdate = dailyGauntletProgressUpdate(
          this.result,
          normalizeDailyGauntletProgress(localStorage.getItem(DAILY_GAUNTLET_PROGRESS_STORAGE_KEY)),
        );
        this.dailyGauntletProgress = dailyUpdate.progress;
        this.isNewDailyBest = dailyUpdate.isNewBest;
        localStorage.setItem(
          DAILY_GAUNTLET_PROGRESS_STORAGE_KEY,
          JSON.stringify(dailyUpdate.progress),
        );
      }
    }

    const centerX = this.cameras.main.width / 2;
    const camHeight = this.cameras.main.height;
    const localPlayerId = this.gameService.getPlayerId();

    const localTeam = localPlayerId ? this.result?.playerTeams?.[localPlayerId] : undefined;
    const isTeamMatch = this.result?.matchKind === 'duos';
    const isWinner = isTeamMatch
      ? localTeam !== undefined && this.result?.winnerTeamId === localTeam
      : this.result?.winnerId === localPlayerId;
    const isDraw = isTeamMatch
      ? this.result?.winnerTeamId === null || this.result?.winnerTeamId === undefined
      : this.result?.winnerId === null || this.result?.winnerId === undefined;
    const outcome: Outcome = isDraw ? 'draw' : isWinner ? 'victory' : 'defeat';

    // ────────────────────────────────────────────────────────────────────
    // Backdrop — same wasteland street as the lobby, tinted by outcome.
    // Embers retune to the outcome mood (orange for victory, slow ash for
    // defeat, dust for draw).
    // ────────────────────────────────────────────────────────────────────
    const street = new WastelandStreet(this, { lowDetail: this.isLikelyMobile() });
    street.setOutcomeWash(outcome);

    // Win/lose music keyed off result. Draws fall through to the lose
    // track — there's no dedicated "draw" track, and silence on the
    // results screen feels broken.
    AudioManager.getInstance()?.playMusic(isWinner ? 'music-win' : 'music-lose');
    // One-shot stinger (silently skipped if asset unloaded).
    if (isWinner) AudioManager.getInstance()?.play('victoryFanfare');
    else if (!isDraw) AudioManager.getInstance()?.play('defeatSound');

    // ────────────────────────────────────────────────────────────────────
    // Outcome banner (Press Start 2P, big)
    // ────────────────────────────────────────────────────────────────────
    const titleText =
      gauntletOutcomeTitle(this.result) ?? (isDraw ? 'DRAW' : isWinner ? 'VICTORY' : 'DEFEAT');
    const titleColor = isDraw ? DRAW_COLOR : isWinner ? VICTORY_COLOR : DEFEAT_COLOR;
    new TitleLogo(this, centerX, 70, [titleText], {
      fontSize: 44,
      fillColor: titleColor,
      strokeThickness: 4,
    }).setDepth(WastelandStreet.DEPTH.UI);

    // Mode label above the banner: what was just played, plus a sudden-
    // death callout when the match needed overtime to settle.
    if (this.result?.gameMode) {
      const modeLabel = this.result.wentToOvertime
        ? `${gameModeDisplayName(this.result.gameMode)} - OVERTIME`
        : gameModeDisplayName(this.result.gameMode);
      this.add
        .text(centerX, 26, modeLabel, {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: '10px',
          color: cssHex(this.result.wentToOvertime ? DRAW_COLOR : LABEL_COLOR),
        })
        .setOrigin(0.5)
        .setDepth(WastelandStreet.DEPTH.UI);
    }

    // Draft teaser under the banner. A rematch's map+mode are decided by
    // the pre-match draft now, so the old rotation promise ("NEXT: <MODE>
    // ON <MAP>") can no longer be known at results time —
    // MatchResult.nextMapName/nextGameMode stay populated for wire compat
    // but only the FORCE/no-draft path honors them.
    const arenaMastery = arenaMasteryResultPresentation(this.result, localPlayerId);
    if (arenaMastery) {
      const masteryText = this.add
        .text(centerX, 104, arenaMastery.text, {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: arenaMastery.tierUp ? '9px' : '8px',
          color: cssHex(arenaMastery.tierUp ? CAREER_RANK_UP_COLOR : LABEL_COLOR),
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setScale(arenaMastery.tierUp ? 1.15 : 1)
        .setDepth(WastelandStreet.DEPTH.UI);
      this.tweens.add({
        targets: masteryText,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 450,
        delay: 100,
        ease: arenaMastery.tierUp ? 'Back.easeOut' : 'Quad.easeOut',
      });
    }

    const nextTeaser = this.add
      .text(
        centerX,
        arenaMastery ? 120 : 112,
        this.result
          ? this.result.matchKind === 'duos'
            ? `SAME CREWS // NEXT: ${gameModeDisplayName(this.result.nextGameMode ?? this.result.gameMode)} @ ${this.result.nextMapName?.toUpperCase() ?? 'RANDOM'}`
            : (gauntletNextTeaser(this.result) ?? nextDraftTeaser(this.result))
          : 'NEXT: COIN TOSS PICKS WHO DRAFTS MAP + MODE',
        {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: arenaMastery ? '8px' : '10px',
          color: cssHex(NEXT_DRAFT_COLOR),
        },
      )
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(WastelandStreet.DEPTH.UI);
    this.tweens.add({ targets: nextTeaser, alpha: 1, duration: 400, delay: 200 });

    // ────────────────────────────────────────────────────────────────────
    // Winner / loser sprite tableau. Winner stands tall on the left,
    // loser is tinted darker and rotated forward on the right. For draws,
    // both stand upright at full color.
    // New results use the authoritative locked roster; old payloads retain
    // the original Mighty Man/Bruce fallback pair.
    // ────────────────────────────────────────────────────────────────────
    if (this.result?.matchKind !== 'rumble' && this.result?.matchKind !== 'duos') {
      this.renderTableau(isWinner, isDraw, camHeight, localPlayerId);
    }

    // ────────────────────────────────────────────────────────────────────
    // Stats panel (center)
    // ────────────────────────────────────────────────────────────────────
    const panelW = 380;
    const panelH = 330;
    const panelX = centerX - panelW / 2;
    const panelY = 130;
    const panel = new MenuPanel(this, panelX, panelY, panelW, panelH, {
      fillAlpha: 0.92,
    });
    panel.setName('result-stats-panel');
    panel.setDepth(WastelandStreet.DEPTH.UI);

    if (this.result) {
      if (this.result.matchKind === 'rumble') {
        this.renderRumbleStandings(panel, localPlayerId);
      } else if (this.result.matchKind === 'duos') {
        this.renderCrewBattleStandings(panel, localPlayerId);
      } else {
        this.renderStats(panel, localPlayerId, isWinner, isDraw);
      }
      this.renderAwardsAndRivalry(centerX, localPlayerId);
    } else {
      const noData = this.add
        .text(panel.centerX, panel.centerY, 'No match data available', {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '16px',
          color: cssHex(NO_DATA_COLOR),
        })
        .setOrigin(0.5);
      panel.add(noData);
    }

    // ────────────────────────────────────────────────────────────────────
    // Rematch status text + action buttons
    // ────────────────────────────────────────────────────────────────────
    this.rematchStatusText = this.add
      .text(centerX, camHeight - 116, '', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '11px',
        color: cssHex(REMATCH_STATUS_COLOR),
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(WastelandStreet.DEPTH.UI);

    const btnY = camHeight - 90;
    const routeChoices = gauntletRouteChoices(this.result);
    const hasRouteDraft = routeChoices.length > 1;
    const hasRivalPreview =
      hasRouteDraft && routeChoices.some((route) => route.opponentCharacterId !== undefined);
    const hasChaosForecast =
      hasRouteDraft && routeChoices.some((route) => route.forecastMutatorId !== undefined);
    const hasBoonDraft = hasRouteDraft && routeChoices.some((route) => route.boonId !== undefined);
    const btnW = hasRouteDraft ? 250 : 200;
    const btnH = hasBoonDraft || hasChaosForecast ? 64 : hasRivalPreview ? 54 : 46;
    const adjustedBtnY =
      hasBoonDraft || hasChaosForecast ? camHeight - 99 : hasRivalPreview ? camHeight - 94 : btnY;
    const btnGap = 14;
    const totalButtons = hasRouteDraft ? 3 : 2;
    const firstBtnX = centerX - (btnW * totalButtons + btnGap * (totalButtons - 1)) / 2;
    const requestNextFight = (gauntletRouteId?: PracticeGauntletRouteId): void => {
      if (this.rematchUnavailable) {
        this.showRematchUnavailable();
        return;
      }
      this.gameService.requestRematch(gauntletRouteId);
      if (hasRouteDraft) this.setRematchButtonsDisabled(true);
      this.rematchStatusText
        ?.setText(
          hasRouteDraft
            ? 'Route locked. Preparing next fight...'
            : this.result?.gauntlet
              ? 'Preparing next fight...'
              : 'Waiting for opponent...',
        )
        .setVisible(true);
    };

    this.rematchButton = new PixelButton(
      this,
      firstBtnX,
      adjustedBtnY,
      btnW,
      btnH,
      hasRouteDraft
        ? gauntletRouteButtonLabel(routeChoices[0])
        : (gauntletActionLabel(this.result) ?? rematchButtonLabel(this.result)),
      {
        variant: 'primary',
        fontSize: hasBoonDraft
          ? 7
          : hasChaosForecast
            ? 8
            : hasRivalPreview
              ? 8
              : hasRouteDraft
                ? 9
                : 13,
        onClick: () => requestNextFight(hasRouteDraft ? routeChoices[0].id : undefined),
      },
    );
    this.rematchButton.setDepth(WastelandStreet.DEPTH.UI);

    if (hasRouteDraft) {
      this.alternateRouteButton = new PixelButton(
        this,
        firstBtnX + btnW + btnGap,
        adjustedBtnY,
        btnW,
        btnH,
        gauntletRouteButtonLabel(routeChoices[1]),
        {
          variant: 'primary',
          fontSize: hasBoonDraft ? 7 : hasChaosForecast ? 8 : hasRivalPreview ? 8 : 9,
          onClick: () => requestNextFight(routeChoices[1].id),
        },
      );
      this.alternateRouteButton.setDepth(WastelandStreet.DEPTH.UI);
    }

    this.lobbyButton = new PixelButton(
      this,
      firstBtnX + (btnW + btnGap) * (totalButtons - 1),
      adjustedBtnY,
      btnW,
      btnH,
      'BACK TO LOBBY',
      {
        variant: 'secondary',
        fontSize: 13,
        onClick: () => {
          this.gameService.returnToLobby();
          this.cameras.main.fadeOut(300, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.cleanupEvents();
            this.scene.start('LobbyScene');
          });
        },
      },
    );
    this.lobbyButton.setDepth(WastelandStreet.DEPTH.UI);

    // Footer
    this.add
      .text(
        centerX,
        camHeight - 24,
        isTouchDevice() ? 'TAP REMATCH, ROUTE, OR LOBBY' : 'TAB / ARROWS + ENTER  •  ESC / B LOBBY',
        {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '12px',
          color: cssHex(FOOTER_COLOR),
        },
      )
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    this.input.keyboard?.on('keydown-ENTER', () => {
      const buttons = this.actionButtons();
      if (!this.gamepadFocusActive) {
        this.gamepadFocusActive = true;
        this.gamepadFocusIndex = 0;
        this.syncGamepadFocus();
      }
      buttons[this.gamepadFocusIndex]?.activate();
    });
    this.input.keyboard?.on('keydown-TAB', (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      this.moveKeyboardFocus(event.shiftKey ? -1 : 1);
    });
    this.input.keyboard?.on('keydown-UP', () => this.moveKeyboardFocus(-1));
    this.input.keyboard?.on('keydown-LEFT', () => this.moveKeyboardFocus(-1));
    this.input.keyboard?.on('keydown-DOWN', () => this.moveKeyboardFocus(1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.moveKeyboardFocus(1));
    this.input.keyboard?.on('keydown-ESC', () => this.lobbyButton?.activate());
    this.input.on('pointerdown', () => {
      if (!this.gamepadFocusActive) return;
      this.gamepadFocusActive = false;
      this.syncGamepadFocus();
    });

    this.wireGameServiceEvents();
  }

  shutdown(): void {
    this.cleanupEvents();
    this.menuGamepad = null;
  }

  update(): void {
    const actions = this.menuGamepad?.poll();
    if (!actions?.hasAction) return;
    this.gamepadFocusActive = true;
    const actionButtons = this.actionButtons();
    if (actions.left || actions.up) {
      this.gamepadFocusIndex =
        (this.gamepadFocusIndex - 1 + actionButtons.length) % actionButtons.length;
    } else if (actions.right || actions.down) {
      this.gamepadFocusIndex = (this.gamepadFocusIndex + 1) % actionButtons.length;
    }
    this.syncGamepadFocus();

    if (actions.back) {
      this.lobbyButton?.activate();
    } else if (actions.confirm || actions.alternate) {
      actionButtons[this.gamepadFocusIndex]?.activate();
    }
  }

  private syncGamepadFocus(): void {
    const focusedButton = this.actionButtons()[this.gamepadFocusIndex] ?? null;
    this.rematchButton?.setFocused(this.gamepadFocusActive && focusedButton === this.rematchButton);
    this.alternateRouteButton?.setFocused(
      this.gamepadFocusActive && focusedButton === this.alternateRouteButton,
    );
    this.lobbyButton?.setFocused(this.gamepadFocusActive && focusedButton === this.lobbyButton);
  }

  private actionButtons(): PixelButton[] {
    return [this.rematchButton, this.alternateRouteButton, this.lobbyButton].filter(
      (button): button is PixelButton => button !== null && !button.isDisabled(),
    );
  }

  private setRematchButtonsDisabled(disabled: boolean): void {
    this.rematchButton?.setDisabled(disabled);
    this.alternateRouteButton?.setDisabled(disabled);
    this.gamepadFocusIndex = Math.min(
      this.gamepadFocusIndex,
      Math.max(0, this.actionButtons().length - 1),
    );
    this.syncGamepadFocus();
  }

  private moveKeyboardFocus(direction: -1 | 1): void {
    const buttons = this.actionButtons();
    if (buttons.length === 0) return;
    if (!this.gamepadFocusActive) {
      this.gamepadFocusIndex = direction > 0 ? 0 : buttons.length - 1;
      this.gamepadFocusActive = true;
    } else {
      this.gamepadFocusIndex =
        (this.gamepadFocusIndex + direction + buttons.length) % buttons.length;
    }
    this.syncGamepadFocus();
  }

  private renderTableau(
    isWinner: boolean,
    isDraw: boolean,
    camHeight: number,
    localPlayerId: PlayerId | null,
  ): void {
    const groundY = camHeight - 130;
    const tableauY = groundY - 14;
    const playerIds = this.result ? this.resultPlayerIds(this.result.playerStats) : [];
    const opponentId = playerIds.find((playerId) => playerId !== localPlayerId) ?? null;
    const localCharacter = this.resultCharacter(localPlayerId, 'mighty_man');
    const opponentCharacter = this.resultCharacter(opponentId, 'bruce');
    const leftX = 130;
    const rightX = this.cameras.main.width - 130;

    if (isDraw) {
      // Both stand, both face center
      this.spawnResultFighter(leftX, tableauY, localCharacter, false, false, 6);
      this.spawnResultFighter(rightX, tableauY, opponentCharacter, true, false, 6);
      return;
    }

    if (isWinner) {
      // Local on left as winner, opponent on right as loser
      this.spawnResultFighter(leftX, tableauY, localCharacter, false, false, 6);
      this.spawnResultFighter(rightX, tableauY, opponentCharacter, true, true, 6);
    } else {
      // Opponent on left as winner, local on right as loser
      this.spawnResultFighter(leftX, tableauY, opponentCharacter, false, false, 6);
      this.spawnResultFighter(rightX, tableauY, localCharacter, true, true, 6);
    }
  }

  private resultPlayerIds(playerStats: MatchResult['playerStats']): PlayerId[] {
    return playerStats instanceof Map
      ? [...playerStats.keys()]
      : Object.keys(playerStats as unknown as Record<PlayerId, PlayerStats>);
  }

  private resultCharacter(playerId: PlayerId | null, fallback: CharacterId): CharacterId {
    return this.resultCharacterOrNull(playerId) ?? fallback;
  }

  private resultCharacterOrNull(playerId: PlayerId | null): CharacterId | null {
    const candidate = playerId ? this.result?.playerCharacters?.[playerId] : undefined;
    return candidate && candidate in CHARACTERS ? candidate : null;
  }

  // Registry-aware result fighter. `flipX` faces the sprite inward and
  // `slumped` creates the defeated pose. Frost tint and Rook's synchronized
  // helmet keep shared-body roster members identifiable outside live play.
  private spawnResultFighter(
    x: number,
    y: number,
    characterId: CharacterId,
    flipX: boolean,
    slumped: boolean,
    standingScale: number,
    parent?: MenuPanel,
    name?: string,
  ): Phaser.GameObjects.Sprite {
    const character: CharacterDef = CHARACTERS[characterId];
    const animKey = `${character.spritePrefix}_side_idle`;
    const scale = slumped ? standingScale * (5 / 6) : standingScale;
    const slumpRotation = slumped ? (flipX ? -0.35 : 0.35) : 0;
    const bodyY = slumped ? y + 14 : y;
    const sprite = this.add
      .sprite(x, bodyY, animKey)
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setDepth(WastelandStreet.DEPTH.CHARACTERS)
      .setFlipX(flipX)
      .setData('resultCharacterId', characterId);
    if (name) sprite.setName(name);
    sprite.play(animKey);
    if (characterId === 'frost_wizard') {
      sprite.setTint(
        FROST_WIZARD_TINT_TOP,
        FROST_WIZARD_TINT_TOP,
        FROST_WIZARD_TINT_BOTTOM,
        FROST_WIZARD_TINT_BOTTOM,
      );
    }
    if (slumped) {
      sprite.setTint(LOSER_TINT);
      sprite.setRotation(slumpRotation);
    }
    if (parent) parent.add(sprite);

    const overlay = character.bodyOverlay;
    if (overlay) {
      const overlayKey = `${overlay.spritePrefix}_side_idle`;
      const overlayOffset = (character.idleFrames.side.h - overlay.idleFrames.side.h) * scale;
      const overlayX = slumped ? x + overlayOffset * Math.sin(slumpRotation) : x;
      const overlayY = slumped
        ? bodyY - overlayOffset * Math.cos(slumpRotation)
        : bodyY - overlayOffset;
      const overlaySprite = this.add
        .sprite(overlayX, overlayY, overlayKey)
        .setOrigin(0.5, 1)
        .setScale(scale)
        .setDepth(WastelandStreet.DEPTH.CHARACTERS + 1)
        .setFlipX(flipX)
        .setData('resultCharacterId', characterId);
      overlaySprite.play(overlayKey);
      if (slumped) {
        overlaySprite.setTint(LOSER_TINT);
        overlaySprite.setRotation(slumpRotation);
      }
      if (parent) parent.add(overlaySprite);
    }
    return sprite;
  }

  private renderStats(
    panel: MenuPanel,
    localPlayerId: PlayerId | null,
    isWinner: boolean,
    isDraw: boolean,
  ): void {
    if (!this.result) return;

    // Normalize map (server payload may serialize to plain object)
    let statsMap: Map<PlayerId, PlayerStats>;
    if (this.result.playerStats instanceof Map) {
      statsMap = this.result.playerStats;
    } else {
      statsMap = new Map(
        Object.entries(this.result.playerStats as unknown as Record<string, PlayerStats>),
      );
    }

    // Order columns: winner first (left), loser second (right). For draws,
    // local player goes on the left.
    let leftId: PlayerId | null = null;
    let rightId: PlayerId | null = null;
    const playerIds = [...statsMap.keys()];
    if (isDraw) {
      leftId = localPlayerId ?? playerIds[0] ?? null;
      rightId = playerIds.find((id) => id !== leftId) ?? null;
    } else {
      leftId = this.result.winnerId;
      rightId = playerIds.find((id) => id !== leftId) ?? null;
    }

    const localNick = this.nickname.toUpperCase();
    const opponentNick = (this.matchData?.opponents[0]?.nickname ?? 'OPPONENT').toUpperCase();
    const leftNick = leftId === localPlayerId ? localNick : opponentNick;
    const rightNick = rightId === localPlayerId ? localNick : opponentNick;

    const col1X = panel.contentWidth * 0.32;
    const col2X = panel.contentWidth * 0.68;
    const labelX = panel.centerX;

    // Player nickname headers
    const leftNickColor = isDraw
      ? VALUE_COLOR
      : isWinner && leftId === localPlayerId
        ? WINNER_NICK_COLOR
        : !isWinner && leftId !== localPlayerId
          ? WINNER_NICK_COLOR
          : LOSER_NICK_COLOR;
    const rightNickColor = isDraw
      ? VALUE_COLOR
      : leftNickColor === WINNER_NICK_COLOR
        ? LOSER_NICK_COLOR
        : WINNER_NICK_COLOR;

    panel.add(
      this.add
        .text(col1X, 26, leftNick, {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: '12px',
          color: cssHex(leftNickColor),
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(col2X, 26, rightNick, {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: '12px',
          color: cssHex(rightNickColor),
        })
        .setOrigin(0.5),
    );

    this.renderWinStreakStory(panel, leftId, col1X, isDraw);
    this.renderWinStreakStory(panel, rightId, col2X, isDraw);

    // Header divider
    const headerDivider = this.add.graphics();
    headerDivider.fillStyle(DIVIDER_COLOR, 0.55);
    headerDivider.fillRect(20, 58, panel.contentWidth - 40, 1);
    panel.add(headerDivider);

    // Stat rows
    const leftStats = leftId ? statsMap.get(leftId) : null;
    const rightStats = rightId ? statsMap.get(rightId) : null;
    const rows = this.buildStatRows(leftStats ?? null, rightStats ?? null);
    const startY = 78;
    const rowH = 25;

    rows.forEach((row, i) => {
      const localY = startY + i * rowH;
      const delay = i * 220;

      const label = this.add
        .text(labelX, localY, row.label, {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '13px',
          color: cssHex(LABEL_COLOR),
        })
        .setOrigin(0.5)
        .setName(`result-stat-label-${i}`)
        .setAlpha(0);

      const leftVal = this.add
        .text(labelX - STAT_VALUE_GAP, localY, row.left, {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '16px',
          color: cssHex(VALUE_COLOR),
        })
        .setOrigin(1, 0.5)
        .setName(`result-stat-left-${i}`)
        .setAlpha(0);

      const rightVal = this.add
        .text(labelX + STAT_VALUE_GAP, localY, row.right, {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '16px',
          color: cssHex(VALUE_COLOR),
        })
        .setOrigin(0, 0.5)
        .setName(`result-stat-right-${i}`)
        .setAlpha(0);

      panel.add(label);
      panel.add(leftVal);
      panel.add(rightVal);

      this.tweens.add({
        targets: [label, leftVal, rightVal],
        alpha: 1,
        y: { from: localY + 10, to: localY },
        duration: 400,
        delay,
        ease: 'Back.easeOut',
      });
    });
  }

  private renderCrewBattleStandings(panel: MenuPanel, localPlayerId: PlayerId | null): void {
    if (!this.result?.playerTeams) return;
    const statsMap =
      this.result.playerStats instanceof Map
        ? this.result.playerStats
        : new Map(
            Object.entries(this.result.playerStats as unknown as Record<string, PlayerStats>),
          );
    const localTeam = localPlayerId ? this.result.playerTeams[localPlayerId] : undefined;
    const teamIds = [...new Set(Object.values(this.result.playerTeams))] as TeamId[];
    teamIds.sort((left, right) => {
      if (left === localTeam) return -1;
      if (right === localTeam) return 1;
      return left.localeCompare(right);
    });

    panel.add(
      this.add
        .text(panel.centerX, 22, 'CREW BATTLE // 2V2', {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: '13px',
          color: cssHex(NEXT_DRAFT_COLOR),
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(panel.centerX, 48, crewBattleObjective(this.result.gameMode), {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: '8px',
          color: cssHex(LABEL_COLOR),
        })
        .setOrigin(0.5),
    );

    let rowIndex = 0;
    for (const teamId of teamIds) {
      const isLocalTeam = teamId === localTeam;
      const isWinner = teamId === this.result.winnerTeamId;
      const color = isWinner ? WINNER_NICK_COLOR : isLocalTeam ? VALUE_COLOR : LABEL_COLOR;
      const scoreUnit = crewBattleScoreUnit(this.result.gameMode);
      const members = [...statsMap.entries()]
        .filter(([playerId]) => this.result?.playerTeams?.[playerId] === teamId)
        .sort(([, left], [, right]) => right.kills - left.kills || left.deaths - right.deaths);

      members.forEach(([playerId, stats], memberIndex) => {
        const y = 78 + rowIndex * 58;
        const isLocal = playerId === localPlayerId;
        const characterId = this.resultCharacterOrNull(playerId);
        const nickname =
          this.result?.playerNicknames?.[playerId]?.toUpperCase() ??
          (isLocal ? this.nickname.toUpperCase() : 'FIGHTER');
        if (memberIndex === 0) {
          const teamLabel = isLocalTeam ? 'YOUR CREW' : 'RIVALS';
          panel.add(
            this.add.text(
              24,
              y + 4,
              `${isWinner ? '★ ' : ''}${teamLabel}\n${this.result?.teamScores?.[teamId] ?? 0} ${scoreUnit}`,
              {
                fontFamily: MENU_FONTS.HEADER,
                fontSize: '9px',
                color: cssHex(color),
                align: 'center',
              },
            ),
          );
        }
        if (characterId) {
          const frame = this.add.graphics();
          frame.fillStyle(RUMBLE_PORTRAIT_BG, 0.74);
          frame.fillRect(94, y - 7, 40, 50);
          frame.lineStyle(1, color, 0.9);
          frame.strokeRect(94.5, y - 6.5, 39, 49);
          panel.add(frame);
          this.spawnResultFighter(
            114,
            y + 40,
            characterId,
            false,
            false,
            1.8,
            panel,
            `result-fighter-${playerId}`,
          );
        }
        panel.add(
          this.add.text(144, y, `${nickname}${isLocal ? '  (YOU)' : ''}`, {
            fontFamily: MENU_FONTS.HEADER,
            fontSize: '10px',
            color: cssHex(isLocal ? VALUE_COLOR : color),
          }),
        );
        panel.add(
          this.add.text(
            144,
            y + 22,
            `${stats.kills} K  //  ${stats.assists} A  //  ${stats.deaths} D`,
            {
              fontFamily: MENU_FONTS.BODY,
              fontSize: '10px',
              color: cssHex(LABEL_COLOR),
            },
          ),
        );
        rowIndex++;
      });
    }
  }

  private renderRumbleStandings(panel: MenuPanel, localPlayerId: PlayerId | null): void {
    if (!this.result) return;
    const statsMap =
      this.result.playerStats instanceof Map
        ? this.result.playerStats
        : new Map(
            Object.entries(this.result.playerStats as unknown as Record<string, PlayerStats>),
          );
    const scores = this.result.scores ?? {};
    const departed = new Set(this.result.departedPlayerIds ?? []);
    const standings = [...statsMap.entries()].sort(([idA, a], [idB, b]) => {
      if (idA === this.result?.winnerId) return -1;
      if (idB === this.result?.winnerId) return 1;
      const scoreDelta = (scores[idB] ?? 0) - (scores[idA] ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      if (b.kills !== a.kills) return b.kills - a.kills;
      if (a.deaths !== b.deaths) return a.deaths - b.deaths;
      return idA.localeCompare(idB);
    });
    const crownStory = rumbleCrownResultPresentation(this.result.rumbleCrown, localPlayerId);
    const grudgeStory = rumbleGrudgeResultLabel(this.result.rumbleGrudges, localPlayerId);

    panel.add(
      this.add
        .text(panel.centerX, 24, 'WASTELAND RUMBLE STANDINGS', {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: '12px',
          color: cssHex(NEXT_DRAFT_COLOR),
        })
        .setOrigin(0.5),
    );
    if (crownStory) {
      panel.add(
        this.add
          .text(panel.centerX, 49, crownStory.text, {
            fontFamily: MENU_FONTS.HEADER,
            fontSize: '9px',
            color: cssHex(crownStory.localOwnsCrown ? WINNER_NICK_COLOR : RIVALRY_COLOR),
          })
          .setOrigin(0.5),
      );
    }
    if (grudgeStory) {
      panel.add(
        this.add
          .text(panel.centerX, crownStory ? 67 : 49, grudgeStory, {
            fontFamily: MENU_FONTS.HEADER,
            fontSize: '8px',
            color: cssHex(RIVALRY_COLOR),
          })
          .setOrigin(0.5),
      );
    }
    const storyCount = Number(crownStory !== null) + Number(grudgeStory !== null);
    const headingsY = storyCount === 0 ? 54 : storyCount === 1 ? 72 : 88;
    const rowStartY = storyCount === 0 ? 84 : storyCount === 1 ? 98 : 114;
    const hasCharacterRows = standings.some(([playerId]) =>
      Boolean(this.resultCharacterOrNull(playerId)),
    );
    const headings = [
      { x: 28, text: '#' },
      { x: hasCharacterRows ? 90 : 62, text: 'FIGHTER' },
      { x: 270, text: 'SCORE' },
      { x: 326, text: 'K/A/D' },
    ];
    for (const heading of headings) {
      panel.add(
        this.add.text(heading.x, headingsY, heading.text, {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '10px',
          color: cssHex(LABEL_COLOR),
        }),
      );
    }

    standings.forEach(([playerId, stats], index) => {
      const y = rowStartY + index * 52;
      const isLocal = playerId === localPlayerId;
      const isWinner = playerId === this.result?.winnerId;
      const color = isWinner ? WINNER_NICK_COLOR : isLocal ? VALUE_COLOR : LABEL_COLOR;
      const nickname =
        this.result?.playerNicknames?.[playerId]?.toUpperCase() ??
        (isLocal ? this.nickname.toUpperCase() : 'FIGHTER');
      const characterId = this.resultCharacterOrNull(playerId);
      const character = characterId ? CHARACTERS[characterId] : null;
      const status = departed.has(playerId) ? 'LEFT' : `${scores[playerId] ?? 0}`;
      const rowTextY = character ? y + 10 : y;
      if (character && characterId) {
        const portraitX = 64;
        const portraitGroundY = y + 42;
        const portraitScale = isWinner ? 2.05 : 1.8;
        const portraitFrame = this.add.graphics();
        portraitFrame.fillStyle(RUMBLE_PORTRAIT_BG, 0.74);
        portraitFrame.fillRect(44, y - 4, 40, 48);
        portraitFrame.lineStyle(1, isWinner ? WINNER_NICK_COLOR : Wasteland.WALL_LINE, 0.9);
        portraitFrame.strokeRect(44.5, y - 3.5, 39, 47);
        panel.add(portraitFrame);
        this.spawnResultFighter(
          portraitX,
          portraitGroundY,
          characterId,
          false,
          false,
          portraitScale,
          panel,
          `result-fighter-${playerId}`,
        );
      }
      panel.add(
        this.add.text(28, rowTextY, `${index + 1}`, {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: '13px',
          color: cssHex(color),
        }),
      );
      panel.add(
        this.add.text(
          character ? 92 : 62,
          character ? y + 2 : y,
          `${isWinner ? '★ ' : ''}${nickname}${isLocal ? '  (YOU)' : ''}`,
          {
            fontFamily: MENU_FONTS.HEADER,
            fontSize: character ? '10px' : '11px',
            color: cssHex(color),
          },
        ),
      );
      if (character) {
        panel.add(
          this.add.text(92, y + 23, character.displayName.toUpperCase(), {
            fontFamily: MENU_FONTS.BODY,
            fontSize: '8px',
            color: cssHex(LABEL_COLOR),
          }),
        );
      }
      panel.add(
        this.add
          .text(292, rowTextY, status, {
            fontFamily: MENU_FONTS.HEADER,
            fontSize: '12px',
            color: cssHex(departed.has(playerId) ? OPPONENT_LEFT_COLOR : color),
          })
          .setOrigin(1, 0),
      );
      panel.add(
        this.add
          .text(360, rowTextY, `${stats.kills}/${stats.assists ?? 0}/${stats.deaths}`, {
            fontFamily: MENU_FONTS.BODY,
            fontSize: '12px',
            color: cssHex(VALUE_COLOR),
          })
          .setOrigin(1, 0),
      );
    });
  }

  private renderWinStreakStory(
    panel: MenuPanel,
    playerId: PlayerId | null,
    x: number,
    isDraw: boolean,
  ): void {
    if (!this.result || !playerId) return;
    const outcome = isDraw ? 'draw' : this.result.winnerId === playerId ? 'win' : 'loss';
    const presentation = winStreakPresentation(this.result.winStreaks?.[playerId], outcome);
    if (!presentation) return;

    const colorForTone = (tone: WinStreakTone): number => {
      switch (tone) {
        case 'active':
          return WIN_STREAK_ACTIVE_COLOR;
        case 'new_best':
          return WIN_STREAK_RECORD_COLOR;
        case 'ended':
          return WIN_STREAK_ENDED_COLOR;
        case 'quiet':
          return LABEL_COLOR;
      }
    };
    const text = this.add
      .text(x, 44, presentation.text, {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '7px',
        color: cssHex(colorForTone(presentation.tone)),
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(presentation.tone === 'new_best' ? 1.12 : 1);
    panel.add(text);
    this.tweens.add({
      targets: text,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 450,
      delay: 250,
      ease: presentation.tone === 'new_best' ? 'Back.easeOut' : 'Quad.easeOut',
    });
  }

  /**
   * Awards strip + lifetime rivalry line, rendered below the stats panel.
   * The server ships at most three awards (priority-capped) and a rivalry
   * record for 1v1 matches; both are absent on old/partial payloads, so
   * everything here degrades to rendering nothing.
   */
  private renderAwardsAndRivalry(centerX: number, localPlayerId: PlayerId | null): void {
    if (!this.result) return;

    const pitRecordLine = scrapPitRecordResultLabel(this.scrapPitRecordUpdate);
    const crewTourLine = crewTourResultLabel(this.crewTourUpdate);
    const line =
      gauntletResultSummary(this.result) ??
      crewTourLine ??
      pitRecordLine ??
      formatRivalrySummary(this.result);
    if (line) {
      const rivalryText = this.add
        .text(centerX, RIVALRY_Y, line, {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: '9px',
          color: cssHex(
            this.scrapPitRecordUpdate?.isNewBest ||
              this.crewTourUpdate?.completedTour ||
              this.crewTourUpdate?.earnedPatch ||
              this.crewTourUpdate?.isNewBest
              ? CAREER_RANK_UP_COLOR
              : RIVALRY_COLOR,
          ),
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(WastelandStreet.DEPTH.UI);
      this.tweens.add({ targets: rivalryText, alpha: 1, duration: 400, delay: 300 });
    }

    if (this.result.gauntlet) {
      const scoreLine = gauntletStageScoreSummary(this.result);
      if (scoreLine) {
        const scoreText = this.add
          .text(centerX, CONTRACT_Y, scoreLine, {
            fontFamily: MENU_FONTS.HEADER,
            fontSize: '8px',
            color: cssHex(
              this.result.gauntlet.stageScore > 0 ? CONTRACT_COMPLETE_COLOR : DEFEAT_COLOR,
            ),
          })
          .setOrigin(0.5)
          .setAlpha(0)
          .setDepth(WastelandStreet.DEPTH.UI);
        this.tweens.add({
          targets: scoreText,
          alpha: 1,
          duration: 400,
          delay: 400,
        });
      }

      const isDaily = this.result.gauntlet.challengeKey !== undefined;
      const isNewScoreRecord = isDaily ? this.isNewDailyBest : this.isNewGauntletBest;
      const isNewRecord =
        isNewScoreRecord || this.isNewGauntletBuild || this.isNewGauntletBuildBest;
      const scoreRecordLabel = isDaily
        ? dailyGauntletStandingLabel(
            this.dailyGauntletProgress,
            this.isNewDailyBest,
            this.result.gauntlet.dailyRank,
            this.result.gauntlet.dailyBestScore,
          )
        : gauntletBestClearLabel(this.gauntletBestClear, this.isNewGauntletBest);
      const recordLabel =
        `${scoreRecordLabel}\n` +
        gauntletBuildCodexLabel(this.gauntletBuildCodex, this.gauntletBuild, {
          isNewDiscovery: this.isNewGauntletBuild,
          isNewBest: this.isNewGauntletBuildBest,
        });
      const bestText = this.add
        .text(centerX, CAREER_RANK_Y, recordLabel, {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: isNewRecord ? '9px' : '8px',
          color: cssHex(isNewRecord ? CAREER_RANK_UP_COLOR : CAREER_RANK_COLOR),
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setScale(isNewRecord ? 1.2 : 1)
        .setDepth(WastelandStreet.DEPTH.UI);
      this.tweens.add({
        targets: bestText,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 500,
        delay: 520,
        ease: isNewRecord ? 'Back.easeOut' : 'Quad.easeOut',
      });
    }

    const contract = this.result.contract;
    const localProgress = contract?.players.find((progress) => progress.playerId === localPlayerId);
    if (!this.result.gauntlet && contract && localProgress) {
      const career = localPlayerId ? contract.careerCompletions[localPlayerId] : undefined;
      const suffix = localProgress.completed
        ? this.result.isPractice
          ? 'PRACTICE CLEAR'
          : career === undefined
            ? 'MATCH CLEAR'
            : `CAREER ${career}`
        : `${localProgress.progress}/${contract.target}`;
      const contractText = this.add
        .text(
          centerX,
          CONTRACT_Y,
          `${localProgress.completed ? 'CONTRACT COMPLETE' : 'CONTRACT'}: ${contract.title} - ${suffix}`,
          {
            fontFamily: MENU_FONTS.HEADER,
            fontSize: '9px',
            color: cssHex(localProgress.completed ? CONTRACT_COMPLETE_COLOR : CONTRACT_COLOR),
          },
        )
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(WastelandStreet.DEPTH.UI);
      this.tweens.add({
        targets: contractText,
        alpha: 1,
        duration: 400,
        delay: 400,
      });

      const rank = careerRankPresentation(
        career,
        localProgress.completed,
        this.result.isPractice ?? false,
      );
      if (rank) {
        const rankText = this.add
          .text(centerX, CAREER_RANK_Y, rank.text, {
            fontFamily: MENU_FONTS.HEADER,
            fontSize: rank.promoted ? '10px' : '8px',
            color: cssHex(rank.promoted ? CAREER_RANK_UP_COLOR : CAREER_RANK_COLOR),
          })
          .setOrigin(0.5)
          .setAlpha(0)
          .setScale(rank.promoted ? 1.3 : 1)
          .setDepth(WastelandStreet.DEPTH.UI);
        this.tweens.add({
          targets: rankText,
          alpha: 1,
          scaleX: 1,
          scaleY: 1,
          duration: 500,
          delay: 520,
          ease: rank.promoted ? 'Back.easeOut' : 'Quad.easeOut',
        });
      }
    }

    const awards = this.result.awards ?? [];
    awards.forEach((award, i) => {
      const y = AWARDS_START_Y + i * AWARD_ROW_H;
      const def = AWARD_DEFS[award.id] as { displayName: string } | undefined;
      const name = this.add
        .text(centerX - 10, y, (def?.displayName ?? award.id).toUpperCase(), {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: '10px',
          color: cssHex(AWARD_NAME_COLOR),
        })
        .setOrigin(1, 0.5)
        .setAlpha(0)
        .setDepth(WastelandStreet.DEPTH.UI);
      const detail = this.add
        .text(centerX + 10, y, `${award.nickname.toUpperCase()} - ${award.detail}`, {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '13px',
          color: cssHex(VALUE_COLOR),
        })
        .setOrigin(0, 0.5)
        .setAlpha(0)
        .setDepth(WastelandStreet.DEPTH.UI);

      this.tweens.add({
        targets: [name, detail],
        alpha: 1,
        y: { from: y + 8, to: y },
        duration: 400,
        delay: 500 + i * 200,
        ease: 'Back.easeOut',
      });
    });
  }

  private buildStatRows(
    stats1: PlayerStats | null,
    stats2: PlayerStats | null,
  ): Array<{ label: string; left: string; right: string }> {
    const s1 = stats1 ?? this.emptyStats();
    const s2 = stats2 ?? this.emptyStats();

    const accuracy1 = s1.shotsFired > 0 ? Math.round((s1.shotsHit / s1.shotsFired) * 100) : 0;
    const accuracy2 = s2.shotsFired > 0 ? Math.round((s2.shotsHit / s2.shotsFired) * 100) : 0;
    const kd1 = s1.deaths > 0 ? (s1.kills / s1.deaths).toFixed(1) : s1.kills.toFixed(1);
    const kd2 = s2.deaths > 0 ? (s2.kills / s2.deaths).toFixed(1) : s2.kills.toFixed(1);

    return [
      { label: 'KILLS', left: `${s1.kills}`, right: `${s2.kills}` },
      { label: 'DEATHS', left: `${s1.deaths}`, right: `${s2.deaths}` },
      { label: 'K/D', left: kd1, right: kd2 },
      { label: 'ACCURACY', left: `${accuracy1}%`, right: `${accuracy2}%` },
      {
        label: 'DMG DEALT',
        left: `${Math.round(s1.damageDealt)}`,
        right: `${Math.round(s2.damageDealt)}`,
      },
      {
        label: 'DMG TAKEN',
        left: `${Math.round(s1.damageTaken)}`,
        right: `${Math.round(s2.damageTaken)}`,
      },
      { label: 'GRENADES', left: `${s1.grenadesThrown}`, right: `${s2.grenadesThrown}` },
      {
        label: 'GREN KILLS',
        left: `${s1.killsByWeapon.grenade}`,
        right: `${s2.killsByWeapon.grenade}`,
      },
      { label: 'BEST STREAK', left: `${s1.longestKillStreak}`, right: `${s2.longestKillStreak}` },
    ];
  }

  private emptyStats(): PlayerStats {
    return {
      kills: 0,
      deaths: 0,
      shotsFired: 0,
      shotsHit: 0,
      damageDealt: 0,
      damageTaken: 0,
      grenadesThrown: 0,
      killsByWeapon: createEmptyKillsByWeapon(),
      longestKillStreak: 0,
      distanceTraveled: 0,
      hillSeconds: 0,
    };
  }

  private wireGameServiceEvents(): void {
    this.onRematchStatus = (opponentWantsRematch: boolean) => {
      if (opponentWantsRematch && this.rematchStatusText) {
        this.rematchStatusText
          .setText(
            this.result?.matchKind === 'rumble'
              ? 'Another fighter wants a rematch!'
              : 'Opponent wants a rematch!',
          )
          .setVisible(true);
      }
    };

    this.onMatchFound = (matchData: MatchData) => {
      // Rematch accepted — transition to character-select. Guard against
      // fade-complete not firing (observed on backgrounded tabs and some
      // mobile browsers): fall back to a timer.
      let transitioned = false;
      const goToGame = (): void => {
        if (transitioned) return;
        transitioned = true;
        this.cleanupEvents();
        this.scene.start('CharacterSelectScene', {
          nickname: this.nickname,
          matchData,
        });
      };
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', goToGame);
      this.time.delayedCall(500, goToGame);
    };

    // Rematches draft again: an accepted rematch opens with draftState
    // (not matchFound) unless FORCE pins skip the draft. Same routing
    // contract as LobbyScene.onDraftState.
    this.onDraftState = () => {
      // draftState rebroadcasts every server tick — detach IMMEDIATELY so
      // the 20Hz stream can't re-enter mid-fade and start the scene twice.
      this.cleanupEvents();
      let transitioned = false;
      const goToDraft = (): void => {
        if (transitioned) return;
        transitioned = true;
        this.scene.start('DraftScene', { nickname: this.nickname });
      };
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', goToDraft);
      this.time.delayedCall(500, goToDraft);
    };

    this.onOpponentDisconnected = (_playerId: PlayerId) => {
      this.rematchUnavailable = true;
      this.setRematchButtonsDisabled(true);
      if (this.rematchStatusText) {
        this.rematchStatusText.setText('Opponent has left.').setVisible(true);
        this.rematchStatusText.setColor(cssHex(OPPONENT_LEFT_COLOR));
      }
    };

    // Server tears down the post-match window after a TTL — surface the
    // cancellation so a stranded player knows REMATCH won't fire.
    this.onMatchmakingStatus = (msg: ServerMatchmakingStatusMessage) => {
      if (msg.status === 'cancelled' && this.rematchStatusText) {
        this.rematchUnavailable = true;
        this.showRematchUnavailable();
      }
    };

    this.onConnectionLost = () => {
      this.showRematchUnavailable();
    };

    this.gameService.on('rematchStatus', this.onRematchStatus);
    this.gameService.on('matchFound', this.onMatchFound);
    this.gameService.on('draftState', this.onDraftState);
    this.gameService.on('opponentDisconnected', this.onOpponentDisconnected);
    this.gameService.on('matchmakingStatus', this.onMatchmakingStatus);
    this.gameService.on('reconnecting', this.onConnectionLost);
    this.gameService.on('disconnected', this.onConnectionLost);
  }

  private cleanupEvents(): void {
    if (this.onRematchStatus) {
      this.gameService.off('rematchStatus', this.onRematchStatus);
      this.onRematchStatus = null;
    }
    if (this.onMatchFound) {
      this.gameService.off('matchFound', this.onMatchFound);
      this.onMatchFound = null;
    }
    if (this.onDraftState) {
      this.gameService.off('draftState', this.onDraftState);
      this.onDraftState = null;
    }
    if (this.onOpponentDisconnected) {
      this.gameService.off('opponentDisconnected', this.onOpponentDisconnected);
      this.onOpponentDisconnected = null;
    }
    if (this.onMatchmakingStatus) {
      this.gameService.off('matchmakingStatus', this.onMatchmakingStatus);
      this.onMatchmakingStatus = null;
    }
    if (this.onConnectionLost) {
      this.gameService.off('reconnecting', this.onConnectionLost);
      this.gameService.off('disconnected', this.onConnectionLost);
      this.onConnectionLost = null;
    }
  }

  private showRematchUnavailable(): void {
    if (!this.rematchStatusText) return;
    this.rematchUnavailable = true;
    this.setRematchButtonsDisabled(true);
    this.rematchStatusText.setText('Rematch unavailable - return to lobby.').setVisible(true);
    this.rematchStatusText.setColor(cssHex(OPPONENT_LEFT_COLOR));
  }

  private isLikelyMobile(): boolean {
    return 'ontouchstart' in window && Math.min(window.innerWidth, window.innerHeight) < 600;
  }
}
