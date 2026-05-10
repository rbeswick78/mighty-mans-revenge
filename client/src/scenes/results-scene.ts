import Phaser from 'phaser';
import type { PlayerId } from '@shared/types/common.js';
import type { PlayerStats } from '@shared/types/player.js';
import type { MatchResult } from '@shared/types/game.js';
import type { ServerMatchmakingStatusMessage } from '@shared/types/network.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { AudioManager } from '../audio/audio-manager.js';
import { GameService, type MatchData } from '../services/game-service.js';
import {
  WastelandStreet,
  type Outcome,
} from '../ui/menu/wasteland-street.js';
import { MenuPanel } from '../ui/menu/menu-panel.js';
import { PixelButton } from '../ui/menu/pixel-button.js';
import { TitleLogo } from '../ui/menu/title-logo.js';
import { MENU_FONTS } from '../ui/menu/fonts.js';

interface ResultsSceneData {
  result?: MatchResult;
  nickname?: string;
  matchData?: MatchData;
}

// Outcome → primary banner color (matches WastelandStreet's wash family).
const VICTORY_COLOR = Wasteland.HEALTH_GOOD;          // dusty mint
const DEFEAT_COLOR = Wasteland.HIT_FLASH;             // dried blood
const DRAW_COLOR = Wasteland.HEALTH_WARNING;          // amber warning
const DIVIDER_COLOR = Wasteland.LOADING_BAR_FILL;     // hot orange accent
const LABEL_COLOR = Wasteland.COVER_FILL;             // weathered tan
const VALUE_COLOR = Wasteland.TEXT_PRIMARY;           // bone-white
const WINNER_NICK_COLOR = Wasteland.HEALTH_GOOD;      // mint
const LOSER_NICK_COLOR = Wasteland.HIT_FLASH;         // blood
const REMATCH_STATUS_COLOR = Wasteland.HEALTH_WARNING;
const OPPONENT_LEFT_COLOR = Wasteland.HIT_FLASH;
const FOOTER_COLOR = Wasteland.WALL_LINE;
const NO_DATA_COLOR = Wasteland.COVER_FILL;
const LOSER_TINT = 0x55454f;

export class ResultsScene extends Phaser.Scene {
  private gameService!: GameService;
  private result: MatchResult | null = null;
  private nickname = '';
  private matchData: MatchData | null = null;
  private rematchStatusText: Phaser.GameObjects.Text | null = null;
  private rematchButton: PixelButton | null = null;
  private rematchUnavailable = false;

  // Event handler references for cleanup
  private onRematchStatus: ((opponentWantsRematch: boolean) => void) | null = null;
  private onMatchFound: ((matchData: MatchData) => void) | null = null;
  private onOpponentDisconnected: ((playerId: PlayerId) => void) | null = null;
  private onMatchmakingStatus: ((msg: ServerMatchmakingStatusMessage) => void) | null = null;

  constructor() {
    super({ key: 'ResultsScene' });
  }

  init(data: ResultsSceneData): void {
    this.result = data.result ?? null;
    this.nickname = data.nickname ?? 'Player';
    this.matchData = data.matchData ?? null;
    this.rematchUnavailable = false;
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.gameService = GameService.getInstance();

    const centerX = this.cameras.main.width / 2;
    const camHeight = this.cameras.main.height;
    const localPlayerId = this.gameService.getPlayerId();

    const isWinner = this.result?.winnerId === localPlayerId;
    const isDraw = this.result?.winnerId === null || this.result?.winnerId === undefined;
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
    const titleText = isDraw ? 'DRAW' : isWinner ? 'VICTORY' : 'DEFEAT';
    const titleColor = isDraw ? DRAW_COLOR : isWinner ? VICTORY_COLOR : DEFEAT_COLOR;
    new TitleLogo(this, centerX, 70, [titleText], {
      fontSize: 44,
      fillColor: titleColor,
      strokeThickness: 4,
    }).setDepth(WastelandStreet.DEPTH.UI);

    // ────────────────────────────────────────────────────────────────────
    // Winner / loser sprite tableau. Winner stands tall on the left,
    // loser is tinted darker and rotated forward on the right. For draws,
    // both stand upright at full color.
    // (We default to mighty_man for the local player and bruce for the
    // opponent. Roster expansion can later pass character IDs through
    // ResultsSceneData.)
    // ────────────────────────────────────────────────────────────────────
    this.renderTableau(isWinner, isDraw, camHeight);

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
    panel.setDepth(WastelandStreet.DEPTH.UI);

    if (this.result) {
      this.renderStats(panel, localPlayerId, isWinner, isDraw);
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
      .text(centerX, camHeight - 130, '', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '11px',
        color: cssHex(REMATCH_STATUS_COLOR),
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(WastelandStreet.DEPTH.UI);

    const btnY = camHeight - 90;
    const btnW = 200;
    const btnH = 46;

    this.rematchButton = new PixelButton(
      this,
      centerX - btnW - 14,
      btnY,
      btnW,
      btnH,
      'REMATCH',
      {
        variant: 'primary',
        fontSize: 13,
        onClick: () => {
          if (this.rematchUnavailable) {
            this.showRematchUnavailable();
            return;
          }
          this.gameService.requestRematch();
          this.rematchStatusText
            ?.setText('Waiting for opponent...')
            .setVisible(true);
        },
      },
    );
    this.rematchButton.setDepth(WastelandStreet.DEPTH.UI);

    new PixelButton(
      this,
      centerX + 14,
      btnY,
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
    ).setDepth(WastelandStreet.DEPTH.UI);

    // Footer
    this.add
      .text(
        centerX,
        camHeight - 24,
        "MIGHTY MAN'S REVENGE  //  POST-APOCALYPTIC SHOWDOWN",
        {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '12px',
          color: cssHex(FOOTER_COLOR),
        },
      )
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    this.wireGameServiceEvents();
  }

  shutdown(): void {
    this.cleanupEvents();
  }

  private renderTableau(
    isWinner: boolean,
    isDraw: boolean,
    camHeight: number,
  ): void {
    // Local player is assumed to be mighty_man; opponent is assumed to be
    // bruce. (CharacterId isn't currently threaded through MatchData.)
    const groundY = camHeight - 130;
    const tableauY = groundY - 14;

    const localCharKey = 'mighty_man_side_idle';
    const opponentCharKey = 'bruce_side_idle';
    const leftX = 130;
    const rightX = this.cameras.main.width - 130;

    if (isDraw) {
      // Both stand, both face center
      this.spawnIdleSprite(leftX, tableauY, localCharKey, false, false);
      this.spawnIdleSprite(rightX, tableauY, opponentCharKey, true, false);
      return;
    }

    if (isWinner) {
      // Local on left as winner, opponent on right as loser
      this.spawnIdleSprite(leftX, tableauY, localCharKey, false, false);
      this.spawnIdleSprite(rightX, tableauY, opponentCharKey, true, true);
    } else {
      // Opponent on left as winner, local on right as loser
      this.spawnIdleSprite(leftX, tableauY, opponentCharKey, false, false);
      this.spawnIdleSprite(rightX, tableauY, localCharKey, true, true);
    }
  }

  // Single sprite helper. `flipX` mirrors the side-idle anim to face
  // toward center. `slumped` applies a forward tilt + dark tint + smaller
  // scale to read as a defeated/fallen pose without bespoke art.
  private spawnIdleSprite(
    x: number,
    y: number,
    animKey: string,
    flipX: boolean,
    slumped: boolean,
  ): Phaser.GameObjects.Sprite {
    const scale = slumped ? 5 : 6;
    const sprite = this.add
      .sprite(x, y, animKey)
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setDepth(WastelandStreet.DEPTH.CHARACTERS)
      .setFlipX(flipX);
    sprite.play(animKey);
    if (slumped) {
      sprite.setTint(LOSER_TINT);
      sprite.setRotation(flipX ? -0.35 : 0.35);
      // Drop the sprite so it reads as collapsed in the dirt.
      sprite.setY(y + 14);
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
        Object.entries(
          this.result.playerStats as unknown as Record<string, PlayerStats>,
        ),
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
    const opponentNick = (
      this.matchData?.opponents[0]?.nickname ?? 'OPPONENT'
    ).toUpperCase();
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

    // Header divider
    const headerDivider = this.add.graphics();
    headerDivider.fillStyle(DIVIDER_COLOR, 0.55);
    headerDivider.fillRect(20, 50, panel.contentWidth - 40, 1);
    panel.add(headerDivider);

    // Stat rows
    const leftStats = leftId ? statsMap.get(leftId) : null;
    const rightStats = rightId ? statsMap.get(rightId) : null;
    const rows = this.buildStatRows(leftStats ?? null, rightStats ?? null);
    const startY = 70;
    const rowH = 27;

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
        .setAlpha(0);

      const leftVal = this.add
        .text(col1X, localY, row.left, {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '16px',
          color: cssHex(VALUE_COLOR),
        })
        .setOrigin(0.5)
        .setAlpha(0);

      const rightVal = this.add
        .text(col2X, localY, row.right, {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '16px',
          color: cssHex(VALUE_COLOR),
        })
        .setOrigin(0.5)
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
      { label: 'DMG DEALT', left: `${Math.round(s1.damageDealt)}`, right: `${Math.round(s2.damageDealt)}` },
      { label: 'DMG TAKEN', left: `${Math.round(s1.damageTaken)}`, right: `${Math.round(s2.damageTaken)}` },
      { label: 'GRENADES', left: `${s1.grenadesThrown}`, right: `${s2.grenadesThrown}` },
      { label: 'GREN KILLS', left: `${s1.grenadeKills}`, right: `${s2.grenadeKills}` },
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
      grenadeKills: 0,
      longestKillStreak: 0,
    };
  }

  private wireGameServiceEvents(): void {
    this.onRematchStatus = (opponentWantsRematch: boolean) => {
      if (opponentWantsRematch && this.rematchStatusText) {
        this.rematchStatusText
          .setText('Opponent wants a rematch!')
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

    this.onOpponentDisconnected = (_playerId: PlayerId) => {
      this.rematchUnavailable = true;
      this.rematchButton?.setDisabled(true);
      if (this.rematchStatusText) {
        this.rematchStatusText
          .setText('Opponent has left.')
          .setVisible(true);
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

    this.gameService.on('rematchStatus', this.onRematchStatus);
    this.gameService.on('matchFound', this.onMatchFound);
    this.gameService.on('opponentDisconnected', this.onOpponentDisconnected);
    this.gameService.on('matchmakingStatus', this.onMatchmakingStatus);
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
    if (this.onOpponentDisconnected) {
      this.gameService.off('opponentDisconnected', this.onOpponentDisconnected);
      this.onOpponentDisconnected = null;
    }
    if (this.onMatchmakingStatus) {
      this.gameService.off('matchmakingStatus', this.onMatchmakingStatus);
      this.onMatchmakingStatus = null;
    }
  }

  private showRematchUnavailable(): void {
    if (!this.rematchStatusText) return;
    this.rematchButton?.setDisabled(true);
    this.rematchStatusText
      .setText('Rematch unavailable - return to lobby.')
      .setVisible(true);
    this.rematchStatusText.setColor(cssHex(OPPONENT_LEFT_COLOR));
  }

  private isLikelyMobile(): boolean {
    return (
      'ontouchstart' in window &&
      Math.min(window.innerWidth, window.innerHeight) < 600
    );
  }
}
