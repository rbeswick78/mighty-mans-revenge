import Phaser from 'phaser';
import type { ServerMatchmakingStatusMessage } from '@shared/types/network.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { AudioManager } from '../audio/audio-manager.js';
import { GameService, type MatchData } from '../services/game-service.js';

const STORAGE_KEY_NICKNAME = 'mmr_nickname';

// --- Wasteland palette mapping for lobby chrome (TUNABLE) ---
// Keep all color decisions for this scene at the top so a future palette
// pass can re-tune the lobby in one place. Numeric values feed graphics
// fillStyle / lineStyle; cssHex() wraps them for Phaser.Text styles.
const TITLE_COLOR = Wasteland.LOADING_BAR_FILL;       // hot orange — same accent as boot
const TITLE_STROKE = Wasteland.CANVAS_BG;             // near-black plum
const SUBTITLE_COLOR = Wasteland.COVER_FILL;          // weathered tan
const LABEL_COLOR = Wasteland.COVER_FILL;             // weathered tan
const NICKNAME_COLOR = Wasteland.HEALTH_GOOD;         // dusty mint terminal-green
const INPUT_BG = Wasteland.HUD_STRIP_BG;              // near-black plum
const INPUT_BORDER = Wasteland.LOADING_BAR_FILL;      // hot orange
const PRIMARY_BTN_COLOR = Wasteland.LOADING_BAR_FILL; // hot orange (CTA)
const SECONDARY_BTN_COLOR = Wasteland.WALL_FILL;      // crumbling concrete
const BTN_LABEL_COLOR = Wasteland.TEXT_PRIMARY;       // bone-white
const SEARCHING_COLOR = Wasteland.LOADING_BAR_FILL;   // hot orange (active state)
const SEARCH_TIMER_COLOR = Wasteland.COVER_FILL;
const PLAYER_COUNT_COLOR = Wasteland.WALL_FILL;       // dim
const FOOTER_COLOR = Wasteland.WALL_LINE;             // very dim ash-shadow
const ERROR_COLOR = Wasteland.HIT_FLASH;              // dried blood
const HOVER_LIGHTEN = 20;                             // Phaser Color.lighten() amount

const lighten = (hex: number, amount: number): number =>
  Phaser.Display.Color.ValueToColor(hex).lighten(amount).color;

export class LobbyScene extends Phaser.Scene {
  private nicknameText!: Phaser.GameObjects.Text;
  private nicknameInput: HTMLInputElement | null = null;
  private searchingText!: Phaser.GameObjects.Text;
  private searchTimerText!: Phaser.GameObjects.Text;
  private cancelButton!: Phaser.GameObjects.Container;
  private playerCountText!: Phaser.GameObjects.Text;
  private quickMatchButton!: Phaser.GameObjects.Container;
  private nickname: string;
  private isSearching = false;
  private searchStartTime = 0;
  private cursorVisible = true;
  private gameService!: GameService;
  private searchingTween: Phaser.Tweens.Tween | null = null;
  private searchTimerEvent: Phaser.Time.TimerEvent | null = null;

  // Event handler references for cleanup
  private onMatchFound: ((matchData: MatchData) => void) | null = null;
  private onMatchmakingStatus: ((msg: ServerMatchmakingStatusMessage) => void) | null = null;
  private onDisconnected: (() => void) | null = null;

  constructor() {
    super({ key: 'LobbyScene' });
    this.nickname = '';
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.nickname = localStorage.getItem(STORAGE_KEY_NICKNAME) ?? '';
    this.isSearching = false;

    this.gameService = GameService.getInstance();

    const audio = AudioManager.getInstance();
    if (audio) {
      audio.setScene(this);
      audio.playMusic('music-lobby');
    }

    const centerX = this.cameras.main.width / 2;
    // Original layout was designed for a 540px-tall canvas. Re-center
    // vertically so the lobby sits in the middle of whatever canvas we
    // render into (currently 720px).
    const yOffset = Math.max(0, (this.cameras.main.height - 540) / 2);

    // Title
    this.add.text(centerX, 60 + yOffset, 'MIGHTY MAN\'S\nREVENGE', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '40px',
      color: cssHex(TITLE_COLOR),
      align: 'center',
      lineSpacing: 8,
      stroke: cssHex(TITLE_STROKE),
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(centerX, 140 + yOffset, 'POST-APOCALYPTIC SHOWDOWN', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '12px',
      color: cssHex(SUBTITLE_COLOR),
    }).setOrigin(0.5);

    // Nickname label
    this.add.text(centerX, 200 + yOffset, 'ENTER CALLSIGN:', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '14px',
      color: cssHex(LABEL_COLOR),
    }).setOrigin(0.5);

    // Nickname input background
    const inputBg = this.add.graphics();
    inputBg.fillStyle(INPUT_BG, 1);
    inputBg.fillRect(centerX - 120, 218 + yOffset, 240, 32);
    inputBg.lineStyle(1, INPUT_BORDER, 0.6);
    inputBg.strokeRect(centerX - 120, 218 + yOffset, 240, 32);

    // Nickname display text
    this.nicknameText = this.add.text(centerX - 110, 226 + yOffset, this.nickname + '_', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '16px',
      color: cssHex(NICKNAME_COLOR),
    });

    // Blinking cursor
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        this.cursorVisible = !this.cursorVisible;
        this.updateNicknameDisplay();
      },
    });

    // Transparent HTML <input> overlaid on the nickname box. Needed so
    // mobile virtual keyboards appear when the user taps the field —
    // Phaser-only keyboard listeners don't trigger the soft keyboard.
    // The Phaser-drawn box/text remain for the retro look; this input
    // is invisible and just captures text entry + tap focus.
    this.nicknameInput = this.createNicknameInput(centerX, 234 + yOffset);

    // Quick Match button
    this.quickMatchButton = this.createQuickMatchButton(centerX, 290 + yOffset);

    // Searching text (hidden initially)
    this.searchingText = this.add.text(centerX, 360 + yOffset, 'Searching for opponent...', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '14px',
      color: cssHex(SEARCHING_COLOR),
    }).setOrigin(0.5).setVisible(false);

    // Search timer text (hidden initially)
    this.searchTimerText = this.add.text(centerX, 380 + yOffset, '0:00', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '12px',
      color: cssHex(SEARCH_TIMER_COLOR),
    }).setOrigin(0.5).setVisible(false);

    // Cancel button (hidden initially)
    this.cancelButton = this.createCancelButton(centerX, 410 + yOffset);
    this.cancelButton.setVisible(false);

    // Player count
    this.playerCountText = this.add.text(centerX, 500 + yOffset, '0 players online', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '12px',
      color: cssHex(PLAYER_COUNT_COLOR),
    }).setOrigin(0.5);

    // Version / footer
    this.add.text(centerX, 525 + yOffset, 'v0.1.0 // PRE-ALPHA', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '10px',
      color: cssHex(FOOTER_COLOR),
    }).setOrigin(0.5);

    // Enter = quick match (works whether the nickname input has focus
    // or not, since the keydown bubbles up from the input element).
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (!this.isSearching) this.onQuickMatch();
    });
    // Escape cancels an active search (for desktop; mobile users tap
    // the CANCEL button).
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.isSearching) this.onCancelSearch();
    });

    // Wire up network events
    this.wireGameServiceEvents();

    // Connect to server if not already connected
    if (this.gameService.getNetworkManager().getConnectionState() !== 'connected') {
      this.gameService.connect().catch((err) => {
        console.error('[LobbyScene] Failed to connect:', err);
      });
    }
  }

  shutdown(): void {
    this.cleanupEvents();
    if (this.searchingTween) {
      this.searchingTween.stop();
      this.searchingTween = null;
    }
    if (this.searchTimerEvent) {
      this.searchTimerEvent.remove();
      this.searchTimerEvent = null;
    }
    // DOM element is destroyed with the scene; drop the reference.
    this.nicknameInput = null;
  }

  private wireGameServiceEvents(): void {
    this.onMatchFound = (matchData: MatchData) => {
      this.isSearching = false;
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('GameScene', {
          nickname: this.nickname,
          matchData,
        });
      });
    };

    this.onMatchmakingStatus = (msg: ServerMatchmakingStatusMessage) => {
      if (msg.playersOnline !== undefined) {
        this.setPlayerCount(msg.playersOnline);
      }
      if (msg.status === 'cancelled') {
        this.stopSearching();
      }
    };

    this.onDisconnected = () => {
      this.stopSearching();
    };

    this.gameService.on('matchFound', this.onMatchFound);
    this.gameService.on('matchmakingStatus', this.onMatchmakingStatus);
    this.gameService.on('disconnected', this.onDisconnected);
  }

  private cleanupEvents(): void {
    if (this.onMatchFound) {
      this.gameService.off('matchFound', this.onMatchFound);
      this.onMatchFound = null;
    }
    if (this.onMatchmakingStatus) {
      this.gameService.off('matchmakingStatus', this.onMatchmakingStatus);
      this.onMatchmakingStatus = null;
    }
    if (this.onDisconnected) {
      this.gameService.off('disconnected', this.onDisconnected);
      this.onDisconnected = null;
    }
  }

  private createQuickMatchButton(centerX: number, buttonY: number): Phaser.GameObjects.Container {
    const baseColor = PRIMARY_BTN_COLOR;
    const hoverColor = lighten(baseColor, HOVER_LIGHTEN);

    const buttonBg = this.add.graphics();
    buttonBg.fillStyle(baseColor, 1);
    buttonBg.fillRoundedRect(-100, 0, 200, 40, 4);

    const text = this.add.text(0, 20, 'QUICK MATCH', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '18px',
      color: cssHex(BTN_LABEL_COLOR),
    }).setOrigin(0.5);

    const zone = this.add.zone(0, 20, 200, 40)
      .setInteractive({ useHandCursor: true });

    zone.on('pointerover', () => {
      buttonBg.clear();
      buttonBg.fillStyle(hoverColor, 1);
      buttonBg.fillRoundedRect(-100, 0, 200, 40, 4);
    });

    zone.on('pointerout', () => {
      buttonBg.clear();
      buttonBg.fillStyle(baseColor, 1);
      buttonBg.fillRoundedRect(-100, 0, 200, 40, 4);
    });

    zone.on('pointerdown', () => {
      this.onQuickMatch();
    });

    const container = this.add.container(centerX, buttonY, [buttonBg, text, zone]);
    return container;
  }

  private createCancelButton(centerX: number, buttonY: number): Phaser.GameObjects.Container {
    const baseColor = SECONDARY_BTN_COLOR;
    const hoverColor = lighten(baseColor, HOVER_LIGHTEN);

    const buttonBg = this.add.graphics();
    buttonBg.fillStyle(baseColor, 1);
    buttonBg.fillRoundedRect(-60, 0, 120, 30, 4);

    const text = this.add.text(0, 15, 'CANCEL', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '13px',
      color: cssHex(BTN_LABEL_COLOR),
    }).setOrigin(0.5);

    const zone = this.add.zone(0, 15, 120, 30)
      .setInteractive({ useHandCursor: true });

    zone.on('pointerover', () => {
      buttonBg.clear();
      buttonBg.fillStyle(hoverColor, 1);
      buttonBg.fillRoundedRect(-60, 0, 120, 30, 4);
    });

    zone.on('pointerout', () => {
      buttonBg.clear();
      buttonBg.fillStyle(baseColor, 1);
      buttonBg.fillRoundedRect(-60, 0, 120, 30, 4);
    });

    zone.on('pointerdown', () => {
      this.onCancelSearch();
    });

    const container = this.add.container(centerX, buttonY, [buttonBg, text, zone]);
    return container;
  }

  private createNicknameInput(x: number, y: number): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.nickname;
    input.maxLength = 16;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('inputmode', 'text');

    // Match the Phaser-drawn box dimensions, but fully transparent so
    // the retro pixel text underneath shows through. font-size >= 16px
    // prevents iOS from auto-zooming on focus.
    Object.assign(input.style, {
      width: '240px',
      height: '32px',
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

    this.add.dom(x, y, input).setOrigin(0.5, 0.5);

    input.addEventListener('input', () => {
      const sanitized = input.value.replace(/[^a-zA-Z0-9_\-.]/g, '').slice(0, 16);
      if (sanitized !== input.value) input.value = sanitized;
      this.nickname = sanitized;
      this.saveNickname();
      this.updateNicknameDisplay();
    });

    // Auto-focus for desktop convenience (no-op for mobile keyboard —
    // that only appears when the user actually taps, which is fine:
    // we want users to tap the visible box to open the keyboard).
    input.focus();

    return input;
  }

  private updateNicknameDisplay(): void {
    const cursor = this.cursorVisible ? '_' : '';
    this.nicknameText.setText(this.nickname + cursor);
  }

  private saveNickname(): void {
    localStorage.setItem(STORAGE_KEY_NICKNAME, this.nickname);
  }

  private onQuickMatch(): void {
    if (this.isSearching) return;

    if (this.nickname.length < 2) {
      const yOffset = Math.max(0, (this.cameras.main.height - 540) / 2);
      const flash = this.add.text(
        this.cameras.main.width / 2,
        258 + yOffset,
        'Callsign must be at least 2 characters',
        {
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: '11px',
          color: cssHex(ERROR_COLOR),
        },
      ).setOrigin(0.5);
      this.time.delayedCall(2000, () => flash.destroy());
      return;
    }

    this.isSearching = true;
    this.searchStartTime = Date.now();

    // Hide the mobile virtual keyboard once we've committed to a
    // callsign and started matchmaking.
    this.nicknameInput?.blur();

    // Show searching UI
    this.searchingText.setVisible(true);
    this.searchTimerText.setVisible(true);
    this.cancelButton.setVisible(true);
    this.quickMatchButton.setVisible(false);

    // Pulsing animation on searching text
    this.searchingTween = this.tweens.add({
      targets: this.searchingText,
      alpha: { from: 1, to: 0.3 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    // Update search timer every second
    this.searchTimerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (!this.isSearching) return;
        const elapsed = Math.floor((Date.now() - this.searchStartTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        this.searchTimerText.setText(`${mins}:${secs.toString().padStart(2, '0')}`);
      },
    });

    // Send matchmaking request
    this.gameService.joinMatchmaking(this.nickname);
  }

  private onCancelSearch(): void {
    this.gameService.cancelMatchmaking();
    this.stopSearching();
  }

  private stopSearching(): void {
    this.isSearching = false;

    // Hide searching UI
    this.searchingText.setVisible(false);
    this.searchTimerText.setVisible(false);
    this.cancelButton.setVisible(false);
    this.quickMatchButton.setVisible(true);

    if (this.searchingTween) {
      this.searchingTween.stop();
      this.searchingTween = null;
    }

    if (this.searchTimerEvent) {
      this.searchTimerEvent.remove();
      this.searchTimerEvent = null;
    }
  }

  setPlayerCount(count: number): void {
    this.playerCountText.setText(`${count} player${count !== 1 ? 's' : ''} online`);
  }
}
