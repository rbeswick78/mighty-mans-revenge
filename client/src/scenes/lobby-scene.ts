import Phaser from 'phaser';
import type { ServerMatchmakingStatusMessage } from '@shared/types/network.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { AudioManager } from '../audio/audio-manager.js';
import { GameService, type MatchData } from '../services/game-service.js';
import { WastelandStreet } from '../ui/menu/wasteland-street.js';
import { MenuPanel } from '../ui/menu/menu-panel.js';
import { PixelButton } from '../ui/menu/pixel-button.js';
import { TitleLogo } from '../ui/menu/title-logo.js';
import { MENU_FONTS } from '../ui/menu/fonts.js';

const STORAGE_KEY_NICKNAME = 'mmr_nickname';

// Scene-local color decisions. Everything beyond the parallax backdrop is
// pinned here so a future palette pass can re-tune the lobby in one place.
const SUBTITLE_COLOR = Wasteland.COVER_FILL;          // weathered tan
const LABEL_COLOR = Wasteland.COVER_FILL;             // weathered tan
const NICKNAME_COLOR = Wasteland.HEALTH_GOOD;         // dusty mint terminal-green
const INPUT_BG = Wasteland.HUD_STRIP_BG;              // near-black plum
const INPUT_BORDER = Wasteland.LOADING_BAR_FILL;      // hot orange
const SEARCHING_COLOR = Wasteland.LOADING_BAR_FILL;   // hot orange (active state)
const SEARCH_TIMER_COLOR = Wasteland.COVER_FILL;
const PLAYER_COUNT_COLOR = Wasteland.WALL_FILL;       // dim
const FOOTER_COLOR = Wasteland.WALL_LINE;             // very dim ash-shadow
const ERROR_COLOR = Wasteland.HIT_FLASH;              // dried blood

export class LobbyScene extends Phaser.Scene {
  private nicknameText!: Phaser.GameObjects.Text;
  private nicknameInput: HTMLInputElement | null = null;
  private searchingText!: Phaser.GameObjects.Text;
  private searchTimerText!: Phaser.GameObjects.Text;
  private cancelButton!: PixelButton;
  private playerCountText!: Phaser.GameObjects.Text;
  private quickMatchButton!: PixelButton;
  private mightyManSprite!: Phaser.GameObjects.Sprite;
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

    AudioManager.getInstance()?.playMusic('music-lobby');

    const centerX = this.cameras.main.width / 2;
    const camHeight = this.cameras.main.height;

    // ────────────────────────────────────────────────────────────────────
    // Backdrop: parallax wasteland street at dusk + Mighty Man at center.
    // The WastelandStreet draws sky, city silhouette, distant ruins, mid
    // wall, near ground, fence, and ember/smoke particles. Auto-cleans
    // on scene SHUTDOWN.
    // ────────────────────────────────────────────────────────────────────
    new WastelandStreet(this, { lowDetail: this.isLikelyMobile() });

    // Mighty Man stands in front of the mid-wall band. Existing idle anim
    // (created in BootScene) is reused — re-anchored, never re-authored.
    this.mightyManSprite = this.add
      .sprite(centerX, 430, 'mighty_man_side_idle')
      .setOrigin(0.5, 1)
      .setScale(6)
      .setDepth(WastelandStreet.DEPTH.CHARACTERS);
    this.mightyManSprite.play('mighty_man_side_idle');

    // ────────────────────────────────────────────────────────────────────
    // Logo + tagline (top of canvas, in the sky band)
    // ────────────────────────────────────────────────────────────────────
    new TitleLogo(this, centerX, 95, ["MIGHTY MAN'S", 'REVENGE'], {
      fontSize: 32,
      lineSpacing: 12,
    }).setDepth(WastelandStreet.DEPTH.UI);

    this.add
      .text(centerX, 170, 'POST-APOCALYPTIC SHOWDOWN', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '16px',
        color: cssHex(SUBTITLE_COLOR),
      })
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    // ────────────────────────────────────────────────────────────────────
    // Main UI panel — holds the callsign + Quick Match button. The
    // searching-state UI shares this panel, swapping visibility.
    // ────────────────────────────────────────────────────────────────────
    const panelW = 380;
    const panelH = 180;
    const panelX = centerX - panelW / 2;
    const panelY = camHeight - 270;
    const panel = new MenuPanel(this, panelX, panelY, panelW, panelH);
    panel.setDepth(WastelandStreet.DEPTH.UI);

    // Callsign label
    const callsignLabel = this.add
      .text(panel.centerX, 24, 'ENTER CALLSIGN', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '11px',
        color: cssHex(LABEL_COLOR),
      })
      .setOrigin(0.5);
    panel.add(callsignLabel);

    // Callsign input field — Phaser-drawn box + HTML <input> overlay.
    const inputW = 300;
    const inputH = 36;
    const inputLocalX = (panelW - inputW) / 2;
    const inputLocalY = 46;
    const inputBgGfx = this.add.graphics();
    inputBgGfx.fillStyle(INPUT_BG, 0.9);
    inputBgGfx.fillRect(inputLocalX, inputLocalY, inputW, inputH);
    inputBgGfx.lineStyle(1, INPUT_BORDER, 0.7);
    inputBgGfx.strokeRect(inputLocalX, inputLocalY, inputW, inputH);
    panel.add(inputBgGfx);

    this.nicknameText = this.add.text(
      panel.centerX,
      inputLocalY + inputH / 2,
      this.nickname + '_',
      {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '20px',
        color: cssHex(NICKNAME_COLOR),
      },
    );
    this.nicknameText.setOrigin(0.5);
    panel.add(this.nicknameText);

    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        this.cursorVisible = !this.cursorVisible;
        this.updateNicknameDisplay();
      },
    });

    // Transparent HTML <input> overlaid on the input box. Needed for
    // mobile virtual keyboards — Phaser-only listeners don't trigger
    // soft keyboards.
    const inputCenterAbsX = panelX + panel.centerX;
    const inputCenterAbsY = panelY + inputLocalY + inputH / 2;
    this.nicknameInput = this.createNicknameInput(
      inputCenterAbsX,
      inputCenterAbsY,
    );

    // Quick Match button (primary CTA, centered in lower half of panel)
    const qmW = 260;
    const qmH = 48;
    this.quickMatchButton = new PixelButton(
      this,
      panel.centerX - qmW / 2,
      panelH - qmH - 16,
      qmW,
      qmH,
      'QUICK MATCH',
      {
        variant: 'primary',
        fontSize: 14,
        onClick: () => this.onQuickMatch(),
      },
    );
    panel.add(this.quickMatchButton);

    // ────────────────────────────────────────────────────────────────────
    // Searching state — sits in the same panel real estate, hidden by
    // default. Searching text replaces the button area; cancel button
    // replaces the quick-match button position.
    // ────────────────────────────────────────────────────────────────────
    this.searchingText = this.add
      .text(panel.centerX, 70, 'SEARCHING FOR OPPONENT', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '12px',
        color: cssHex(SEARCHING_COLOR),
      })
      .setOrigin(0.5)
      .setVisible(false);
    panel.add(this.searchingText);

    this.searchTimerText = this.add
      .text(panel.centerX, 100, '0:00', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '20px',
        color: cssHex(SEARCH_TIMER_COLOR),
      })
      .setOrigin(0.5)
      .setVisible(false);
    panel.add(this.searchTimerText);

    const cancelW = 180;
    const cancelH = 38;
    this.cancelButton = new PixelButton(
      this,
      panel.centerX - cancelW / 2,
      panelH - cancelH - 22,
      cancelW,
      cancelH,
      'CANCEL',
      {
        variant: 'secondary',
        fontSize: 12,
        onClick: () => this.onCancelSearch(),
      },
    );
    this.cancelButton.setVisible(false);
    panel.add(this.cancelButton);

    // ────────────────────────────────────────────────────────────────────
    // Footer row — player count left, version right, both dim against
    // the near-ground band so they don't compete with the panel/logo.
    // ────────────────────────────────────────────────────────────────────
    this.playerCountText = this.add
      .text(36, camHeight - 24, '0 PLAYERS ONLINE', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '14px',
        color: cssHex(PLAYER_COUNT_COLOR),
      })
      .setOrigin(0, 0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    this.add
      .text(
        this.cameras.main.width - 36,
        camHeight - 24,
        'v0.1.0 // PRE-ALPHA',
        {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '14px',
          color: cssHex(FOOTER_COLOR),
        },
      )
      .setOrigin(1, 0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    // Enter = quick match (works whether the nickname input has focus
    // or not, since the keydown bubbles up from the input element).
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (!this.isSearching) this.onQuickMatch();
    });
    // Escape cancels an active search.
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.isSearching) this.onCancelSearch();
    });

    // Wire up network events
    this.wireGameServiceEvents();

    // Connect to server if not already connected
    if (
      this.gameService.getNetworkManager().getConnectionState() !== 'connected'
    ) {
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
      // Tear down listeners and pin the transition guard before kicking
      // off the fade. If we leave the listener attached and the next
      // matchFound (e.g. from a rematch) fires while the camera/scene
      // are mid-shutdown, the stale handler throws on this.cameras.main
      // and brings down the GameService dispatch chain — silently
      // stranding the live scene's listener.
      this.isSearching = false;
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
      width: '300px',
      height: '36px',
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

    this.add.dom(x, y, input).setOrigin(0.5, 0.5).setDepth(WastelandStreet.DEPTH.UI + 1);

    input.addEventListener('input', () => {
      const sanitized = input.value
        .replace(/[^a-zA-Z0-9_\-.]/g, '')
        .slice(0, 16);
      if (sanitized !== input.value) input.value = sanitized;
      this.nickname = sanitized;
      this.saveNickname();
      this.updateNicknameDisplay();
    });

    // Auto-focus for desktop convenience (no-op for mobile keyboard —
    // that only appears when the user actually taps).
    input.focus();

    return input;
  }

  private updateNicknameDisplay(): void {
    // Use a non-breaking space when the cursor is "off" so the text width
    // stays constant — centered text would otherwise shift horizontally on
    // every blink. Both '_' and ' ' render the same width in the
    // Silkscreen monospace pixel font.
    const cursor = this.cursorVisible ? '_' : ' ';
    this.nicknameText.setText(this.nickname + cursor);
  }

  private saveNickname(): void {
    localStorage.setItem(STORAGE_KEY_NICKNAME, this.nickname);
  }

  private onQuickMatch(): void {
    if (this.isSearching) return;

    if (this.nickname.length < 2) {
      const centerX = this.cameras.main.width / 2;
      const flash = this.add
        .text(
          centerX,
          this.cameras.main.height - 70,
          'CALLSIGN MUST BE AT LEAST 2 CHARACTERS',
          {
            fontFamily: MENU_FONTS.BODY,
            fontSize: '14px',
            color: cssHex(ERROR_COLOR),
          },
        )
        .setOrigin(0.5)
        .setDepth(WastelandStreet.DEPTH.UI + 2);
      this.time.delayedCall(2000, () => flash.destroy());
      return;
    }

    this.isSearching = true;
    this.searchStartTime = Date.now();

    // Hide mobile virtual keyboard once matchmaking commits.
    this.nicknameInput?.blur();

    // Request fullscreen on this user gesture. Best-effort — many iOS
    // Safari versions report fullscreenEnabled=false and we skip.
    if (document.fullscreenEnabled && !this.scale.isFullscreen) {
      this.scale.startFullscreen();
    }

    // Swap panel content into searching state
    this.searchingText.setVisible(true);
    this.searchTimerText.setVisible(true);
    this.cancelButton.setVisible(true);
    this.quickMatchButton.setVisible(false);

    this.searchingTween = this.tweens.add({
      targets: this.searchingText,
      alpha: { from: 1, to: 0.3 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    this.searchTimerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (!this.isSearching) return;
        const elapsed = Math.floor(
          (Date.now() - this.searchStartTime) / 1000,
        );
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        this.searchTimerText.setText(
          `${mins}:${secs.toString().padStart(2, '0')}`,
        );
      },
    });

    this.gameService.joinMatchmaking(this.nickname);
  }

  private onCancelSearch(): void {
    this.gameService.cancelMatchmaking();
    this.stopSearching();
  }

  private stopSearching(): void {
    this.isSearching = false;

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
    const label =
      count === 1 ? '1 PLAYER ONLINE' : `${count} PLAYERS ONLINE`;
    this.playerCountText.setText(label);
  }

  private isLikelyMobile(): boolean {
    // Match the convention used elsewhere in client (is-touch-device.ts):
    // touch capability + small viewport. Used to decide on reduced
    // particle counts in the parallax backdrop.
    return (
      'ontouchstart' in window && Math.min(window.innerWidth, window.innerHeight) < 600
    );
  }
}
