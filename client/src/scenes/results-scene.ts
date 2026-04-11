import Phaser from 'phaser';
import type { PlayerId } from '@shared/types/common.js';
import type { PlayerStats } from '@shared/types/player.js';
import type { MatchResult } from '@shared/types/game.js';
import { GameService, type MatchData } from '../services/game-service.js';

interface ResultsSceneData {
  result?: MatchResult;
  nickname?: string;
  matchData?: MatchData;
}

const FONT_MONO: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: '"Courier New", Courier, monospace',
  fontSize: '14px',
  color: '#ffffff',
};

export class ResultsScene extends Phaser.Scene {
  private gameService!: GameService;
  private result: MatchResult | null = null;
  private nickname = '';
  private matchData: MatchData | null = null;
  private rematchStatusText: Phaser.GameObjects.Text | null = null;

  // Event handler references for cleanup
  private onRematchStatus: ((opponentWantsRematch: boolean) => void) | null = null;
  private onMatchFound: ((matchData: MatchData) => void) | null = null;
  private onOpponentDisconnected: ((playerId: PlayerId) => void) | null = null;

  constructor() {
    super({ key: 'ResultsScene' });
  }

  init(data: ResultsSceneData): void {
    this.result = data.result ?? null;
    this.nickname = data.nickname ?? 'Player';
    this.matchData = data.matchData ?? null;
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.gameService = GameService.getInstance();

    const centerX = this.cameras.main.width / 2;
    const playerId = this.gameService.getPlayerId();

    // Determine winner/loser
    const isWinner = this.result?.winnerId === playerId;
    const isDraw = this.result?.winnerId === null;

    // Title - Winner/Loser announcement
    let titleText: string;
    let titleColor: string;
    if (isDraw) {
      titleText = 'DRAW';
      titleColor = '#ffaa00';
    } else if (isWinner) {
      titleText = 'VICTORY';
      titleColor = '#00ff66';
    } else {
      titleText = 'DEFEAT';
      titleColor = '#e94560';
    }

    this.add.text(centerX, 40, titleText, {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '48px',
      color: titleColor,
      stroke: '#1a1a2e',
      strokeThickness: 6,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Divider line
    const divider = this.add.graphics();
    divider.lineStyle(1, 0xe94560, 0.5);
    divider.lineBetween(centerX - 300, 80, centerX + 300, 80);

    if (this.result) {
      this.renderStats(centerX, playerId);
    } else {
      this.add.text(centerX, 200, 'No match data available', {
        ...FONT_MONO,
        color: '#888888',
      }).setOrigin(0.5);
    }

    // Rematch status text (hidden initially)
    this.rematchStatusText = this.add.text(centerX, 430, '', {
      ...FONT_MONO,
      fontSize: '13px',
      color: '#ffaa00',
    }).setOrigin(0.5).setVisible(false);

    // Bottom divider
    const bottomDivider = this.add.graphics();
    bottomDivider.lineStyle(1, 0xe94560, 0.3);
    bottomDivider.lineBetween(centerX - 300, 450, centerX + 300, 450);

    // Buttons
    const buttonY = 470;

    // Rematch button
    this.createButton(centerX - 110, buttonY, 'REMATCH', 0xe94560, () => {
      this.gameService.requestRematch();
      this.rematchStatusText?.setText('Waiting for opponent...').setVisible(true);
    });

    // Back to Lobby button
    this.createButton(centerX + 110, buttonY, 'BACK TO LOBBY', 0x444466, () => {
      this.gameService.returnToLobby();
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.cleanupEvents();
        this.scene.start('LobbyScene');
      });
    });

    // Footer
    this.add.text(centerX, 525, 'MIGHTY MAN\'S REVENGE // POST-APOCALYPTIC SHOWDOWN', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '9px',
      color: '#333333',
    }).setOrigin(0.5);

    // Wire up events
    this.wireGameServiceEvents();
  }

  shutdown(): void {
    this.cleanupEvents();
  }

  private renderStats(centerX: number, localPlayerId: PlayerId | null): void {
    if (!this.result) return;

    // Convert playerStats if it's a plain object (from JSON serialization)
    let statsMap: Map<PlayerId, PlayerStats>;
    if (this.result.playerStats instanceof Map) {
      statsMap = this.result.playerStats;
    } else {
      // Handle deserialized plain object
      statsMap = new Map(Object.entries(this.result.playerStats as unknown as Record<string, PlayerStats>));
    }

    // Collect player IDs — local first
    const playerIds = [...statsMap.keys()];
    const localIdx = playerIds.findIndex((id) => id === localPlayerId);
    if (localIdx > 0) {
      const [local] = playerIds.splice(localIdx, 1);
      playerIds.unshift(local);
    }

    // Column headers
    const col1X = centerX - 140;
    const col2X = centerX + 140;
    const headerY = 95;

    const localNick = this.nickname;
    const opponentNick = this.matchData?.opponents[0]?.nickname ?? 'Opponent';

    this.add.text(col1X, headerY, localNick.toUpperCase(), {
      ...FONT_MONO,
      fontSize: '16px',
      color: '#00ff66',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(col2X, headerY, opponentNick.toUpperCase(), {
      ...FONT_MONO,
      fontSize: '16px',
      color: '#e94560',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Stat rows
    const stats1 = playerIds[0] ? statsMap.get(playerIds[0]) : null;
    const stats2 = playerIds[1] ? statsMap.get(playerIds[1]) : null;

    const statRows = this.buildStatRows(stats1 ?? null, stats2 ?? null);
    const startY = 125;
    const rowHeight = 30;

    // Animate stats in sequentially (arcade-style tally)
    statRows.forEach((row, i) => {
      const y = startY + i * rowHeight;
      const delay = i * 300;

      // Label in center
      const label = this.add.text(centerX, y, row.label, {
        ...FONT_MONO,
        fontSize: '12px',
        color: '#888888',
      }).setOrigin(0.5).setAlpha(0);

      // Left value
      const leftVal = this.add.text(col1X, y, row.left, {
        ...FONT_MONO,
        fontSize: '14px',
        color: '#ffffff',
      }).setOrigin(0.5).setAlpha(0);

      // Right value
      const rightVal = this.add.text(col2X, y, row.right, {
        ...FONT_MONO,
        fontSize: '14px',
        color: '#ffffff',
      }).setOrigin(0.5).setAlpha(0);

      // Tween in
      this.tweens.add({
        targets: [label, leftVal, rightVal],
        alpha: 1,
        y: { from: y + 10, to: y },
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
      { label: 'K/D RATIO', left: kd1, right: kd2 },
      { label: 'ACCURACY', left: `${accuracy1}%`, right: `${accuracy2}%` },
      { label: 'DAMAGE DEALT', left: `${Math.round(s1.damageDealt)}`, right: `${Math.round(s2.damageDealt)}` },
      { label: 'DAMAGE TAKEN', left: `${Math.round(s1.damageTaken)}`, right: `${Math.round(s2.damageTaken)}` },
      { label: 'GRENADES THROWN', left: `${s1.grenadesThrown}`, right: `${s2.grenadesThrown}` },
      { label: 'GRENADE KILLS', left: `${s1.grenadeKills}`, right: `${s2.grenadeKills}` },
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
        this.rematchStatusText.setText('Opponent wants a rematch!').setVisible(true);
      }
    };

    this.onMatchFound = (matchData: MatchData) => {
      // Rematch accepted — transition to game scene
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.cleanupEvents();
        this.scene.start('GameScene', {
          nickname: this.nickname,
          matchData,
        });
      });
    };

    this.onOpponentDisconnected = (_playerId: PlayerId) => {
      if (this.rematchStatusText) {
        this.rematchStatusText.setText('Opponent has left.').setVisible(true);
        this.rematchStatusText.setColor('#ff4444');
      }
    };

    this.gameService.on('rematchStatus', this.onRematchStatus);
    this.gameService.on('matchFound', this.onMatchFound);
    this.gameService.on('opponentDisconnected', this.onOpponentDisconnected);
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
  }

  private createButton(
    x: number,
    y: number,
    label: string,
    color: number,
    onClick: () => void,
  ): void {
    const width = 160;
    const height = 36;

    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(x - width / 2, y, width, height, 4);

    const text = this.add.text(x, y + height / 2, label, {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '13px',
      color: '#ffffff',
    }).setOrigin(0.5);

    const zone = this.add.zone(x, y + height / 2, width, height)
      .setInteractive({ useHandCursor: true });

    const hoverColor = Phaser.Display.Color.ValueToColor(color).lighten(20).color;

    zone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1);
      bg.fillRoundedRect(x - width / 2, y, width, height, 4);
    });

    zone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(x - width / 2, y, width, height, 4);
    });

    zone.on('pointerdown', onClick);

    // Keep references alive
    text.setData('zone', zone);
  }
}
