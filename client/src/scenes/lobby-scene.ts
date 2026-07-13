import Phaser from 'phaser';
import type { LeaderboardEntry, ServerMatchmakingStatusMessage } from '@shared/types/network.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { AudioManager } from '../audio/audio-manager.js';
import { MenuGamepadInput } from '../input/menu-gamepad.js';
import { GameService, type MatchData } from '../services/game-service.js';
import { WastelandStreet } from '../ui/menu/wasteland-street.js';
import { MenuPanel } from '../ui/menu/menu-panel.js';
import { PixelButton } from '../ui/menu/pixel-button.js';
import { TitleLogo } from '../ui/menu/title-logo.js';
import { MENU_FONTS } from '../ui/menu/fonts.js';
import { formatLeaderboardRow } from '../ui/leaderboard-format.js';
import {
  GAUNTLET_BEST_CLEAR_STORAGE_KEY,
  gauntletBestClearLabel,
  normalizeGauntletBestClear,
} from '../ui/practice-gauntlet.js';
import {
  BOT_DIFFICULTIES,
  DEFAULT_BOT_DIFFICULTY,
  type BotDifficulty,
  type PracticeKind,
} from '@shared/config/game.js';

const STORAGE_KEY_NICKNAME = 'mmr_nickname';
const STORAGE_KEY_BOT_DIFFICULTY = 'mmr_bot_difficulty';

// Scene-local color decisions. Everything beyond the parallax backdrop is
// pinned here so a future palette pass can re-tune the lobby in one place.
const SUBTITLE_COLOR = Wasteland.COVER_FILL; // weathered tan
const LABEL_COLOR = Wasteland.COVER_FILL; // weathered tan
const NICKNAME_COLOR = Wasteland.HEALTH_GOOD; // dusty mint terminal-green
const INPUT_BG = Wasteland.HUD_STRIP_BG; // near-black plum
const INPUT_BORDER = Wasteland.LOADING_BAR_FILL; // hot orange
const SEARCHING_COLOR = Wasteland.LOADING_BAR_FILL; // hot orange (active state)
const SEARCH_TIMER_COLOR = Wasteland.COVER_FILL;
const PLAYER_COUNT_COLOR = Wasteland.WALL_FILL; // dim
const FOOTER_COLOR = Wasteland.WALL_LINE; // very dim ash-shadow
const ERROR_COLOR = Wasteland.HIT_FLASH; // dried blood
const LEADERBOARD_TITLE_COLOR = Wasteland.COVER_FILL; // weathered tan
const LEADERBOARD_ROW_COLOR = Wasteland.WALL_FILL; // dim, matches footer
const GAUNTLET_BEST_COLOR = Wasteland.HEALTH_WARNING;

export class LobbyScene extends Phaser.Scene {
  private nicknameText!: Phaser.GameObjects.Text;
  private nicknameInput: HTMLInputElement | null = null;
  /** Phaser wrapper around the HTML input — hidden while searching. */
  private nicknameDom: Phaser.GameObjects.DOMElement | null = null;
  /**
   * The name-entry group (callsign label, input box graphics, nickname
   * text). The searching state occupies the same panel band (y≈70 sits
   * inside the input box), so these swap out wholesale when a search
   * starts — leaving them visible stamps "SEARCHING FOR OPPONENT" over
   * the player's name.
   */
  private nameEntryUi: Array<Phaser.GameObjects.Text | Phaser.GameObjects.Graphics> = [];
  private searchingText!: Phaser.GameObjects.Text;
  private searchTimerText!: Phaser.GameObjects.Text;
  private cancelButton!: PixelButton;
  private playerCountText!: Phaser.GameObjects.Text;
  private leaderboardTitleText!: Phaser.GameObjects.Text;
  private leaderboardRowsText!: Phaser.GameObjects.Text;
  private quickMatchButton!: PixelButton;
  private practiceButton!: PixelButton;
  private gauntletButton!: PixelButton;
  private difficultyButton!: PixelButton;
  private mightyManSprite!: Phaser.GameObjects.Sprite;
  private nickname: string;
  private practiceDifficulty: BotDifficulty;
  private isSearching = false;
  private searchStartTime = 0;
  private cursorVisible = true;
  private gameService!: GameService;
  private searchingTween: Phaser.Tweens.Tween | null = null;
  private searchTimerEvent: Phaser.Time.TimerEvent | null = null;
  private menuGamepad: MenuGamepadInput | null = null;
  private gamepadFocusActive = false;
  private gamepadFocusIndex = 0;

  // Event handler references for cleanup
  private onMatchFound: ((matchData: MatchData) => void) | null = null;
  private onDraftState: (() => void) | null = null;
  private onMatchmakingStatus: ((msg: ServerMatchmakingStatusMessage) => void) | null = null;
  private onDisconnected: (() => void) | null = null;
  private onLeaderboard: ((entries: LeaderboardEntry[]) => void) | null = null;

  constructor() {
    super({ key: 'LobbyScene' });
    this.nickname = '';
    this.practiceDifficulty = DEFAULT_BOT_DIFFICULTY;
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.nickname = localStorage.getItem(STORAGE_KEY_NICKNAME) ?? '';
    const savedDifficulty = localStorage.getItem(STORAGE_KEY_BOT_DIFFICULTY);
    this.practiceDifficulty = BOT_DIFFICULTIES.includes(savedDifficulty as BotDifficulty)
      ? (savedDifficulty as BotDifficulty)
      : DEFAULT_BOT_DIFFICULTY;
    this.isSearching = false;
    this.menuGamepad = new MenuGamepadInput();
    this.gamepadFocusActive = false;
    this.gamepadFocusIndex = 0;

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
    const panelH = 268;
    const panelX = centerX - panelW / 2;
    const panelY = camHeight - 298;
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
    this.nicknameInput = this.createNicknameInput(inputCenterAbsX, inputCenterAbsY);

    // Fresh array each create() — scene restarts rebuild these objects.
    this.nameEntryUi = [callsignLabel, inputBgGfx, this.nicknameText];

    // Quick Match button (primary CTA, centered in lower half of panel)
    const qmW = 260;
    const qmH = 44;
    this.quickMatchButton = new PixelButton(
      this,
      panel.centerX - qmW / 2,
      104,
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

    const soloW = (qmW - 10) / 2;
    this.practiceButton = new PixelButton(
      this,
      panel.centerX - qmW / 2,
      158,
      soloW,
      qmH,
      'RUSTY SPAR',
      {
        variant: 'secondary',
        fontSize: 10,
        onClick: () => this.onPractice('sparring'),
      },
    );
    panel.add(this.practiceButton);

    this.gauntletButton = new PixelButton(
      this,
      panel.centerX - qmW / 2 + soloW + 10,
      158,
      soloW,
      qmH,
      'GAUNTLET',
      {
        variant: 'secondary',
        fontSize: 10,
        onClick: () => this.onPractice('gauntlet'),
      },
    );
    panel.add(this.gauntletButton);

    this.difficultyButton = new PixelButton(
      this,
      panel.centerX - qmW / 2,
      212,
      qmW,
      28,
      this.difficultyLabel(),
      {
        variant: 'secondary',
        fontSize: 9,
        onClick: () => this.cyclePracticeDifficulty(),
      },
    );
    panel.add(this.difficultyButton);

    const gauntletBestText = this.add
      .text(
        panel.centerX,
        252,
        gauntletBestClearLabel(
          normalizeGauntletBestClear(localStorage.getItem(GAUNTLET_BEST_CLEAR_STORAGE_KEY)),
        ),
        {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: '8px',
          color: cssHex(GAUNTLET_BEST_COLOR),
        },
      )
      .setOrigin(0.5);
    panel.add(gauntletBestText);
    this.nameEntryUi.push(gauntletBestText);

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
      .text(this.cameras.main.width - 36, camHeight - 24, 'v0.1.0 // PRE-ALPHA', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '14px',
        color: cssHex(FOOTER_COLOR),
      })
      .setOrigin(1, 0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    this.add
      .text(centerX, camHeight - 24, 'GAMEPAD: D-PAD + A  •  B CANCEL', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '10px',
        color: cssHex(FOOTER_COLOR),
      })
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    // ────────────────────────────────────────────────────────────────────
    // All-time top-5 leaderboard — bottom-left column, above the player
    // count. Bottom-anchored (origin y=1) and positioned off the camera
    // dims like the footer, so it stays in the narrow strip left of the
    // centered menu panel on every viewport (canvas is a fixed 960×720
    // design resolution, FIT-scaled on mobile landscape). Hidden until the
    // server ships a non-empty server:leaderboard.
    // ────────────────────────────────────────────────────────────────────
    this.leaderboardRowsText = this.add
      .text(36, camHeight - 48, '', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '13px',
        color: cssHex(LEADERBOARD_ROW_COLOR),
        lineSpacing: 6,
      })
      .setOrigin(0, 1)
      .setDepth(WastelandStreet.DEPTH.UI)
      .setVisible(false);
    this.leaderboardTitleText = this.add
      .text(36, camHeight - 48, 'ALL-TIME TOP 5\nRANK  W/L  C=CONTRACTS', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '10px',
        color: cssHex(LEADERBOARD_TITLE_COLOR),
        lineSpacing: 3,
      })
      .setOrigin(0, 1)
      .setDepth(WastelandStreet.DEPTH.UI)
      .setVisible(false);
    // GameService caches the latest entries, so a lobby created after the
    // message (returning from a match, or reconnect) renders immediately.
    this.updateLeaderboard(this.gameService.getLeaderboard());

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
    if (this.gameService.getNetworkManager().getConnectionState() !== 'connected') {
      this.gameService.connect().catch((err) => {
        console.error('[LobbyScene] Failed to connect:', err);
      });
    }
  }

  shutdown(): void {
    this.cleanupEvents();
    this.menuGamepad = null;
    if (this.searchingTween) {
      this.searchingTween.stop();
      this.searchingTween = null;
    }
    if (this.searchTimerEvent) {
      this.searchTimerEvent.remove();
      this.searchTimerEvent = null;
    }
    // DOM element is destroyed with the scene; drop the references.
    this.nicknameInput = null;
    this.nicknameDom = null;
    this.nameEntryUi = [];
  }

  update(): void {
    const actions = this.menuGamepad?.poll();
    if (!actions?.hasAction) return;
    this.gamepadFocusActive = true;

    if (this.isSearching) {
      this.syncGamepadFocus();
      if (actions.back) this.cancelButton.activate();
      return;
    }

    const buttons = this.gamepadButtons();
    if (actions.up || actions.left) {
      this.gamepadFocusIndex = (this.gamepadFocusIndex - 1 + buttons.length) % buttons.length;
    } else if (actions.down || actions.right) {
      this.gamepadFocusIndex = (this.gamepadFocusIndex + 1) % buttons.length;
    }
    this.syncGamepadFocus();
    if (actions.confirm) buttons[this.gamepadFocusIndex]?.activate();
  }

  private gamepadButtons(): PixelButton[] {
    return [this.quickMatchButton, this.practiceButton, this.gauntletButton, this.difficultyButton];
  }

  private syncGamepadFocus(): void {
    const buttons = this.gamepadButtons();
    buttons.forEach((button, index) => {
      button.setFocused(
        this.gamepadFocusActive && !this.isSearching && index === this.gamepadFocusIndex,
      );
    });
    this.cancelButton.setFocused(this.gamepadFocusActive && this.isSearching);
  }

  /**
   * Show/hide the callsign entry group (label, box, name text, HTML
   * input). Hidden while a search runs; restored when it stops.
   */
  private setNameEntryVisible(visible: boolean): void {
    for (const obj of this.nameEntryUi) obj.setVisible(visible);
    this.nicknameDom?.setVisible(visible);
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

    // A real (non-FORCE-pinned) match opens with the pre-match draft: the
    // first server:draftState routes to DraftScene, and matchFound only
    // arrives later — after both picks — while DraftScene is live. The
    // matchFound listener above stays wired for the FORCE/no-draft path.
    this.onDraftState = () => {
      // draftState rebroadcasts every server tick — tear the listeners
      // down IMMEDIATELY so the 20Hz stream can't re-enter mid-fade and
      // start the scene twice.
      this.cleanupEvents();
      this.isSearching = false;
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

    this.onLeaderboard = (entries: LeaderboardEntry[]) => {
      this.updateLeaderboard(entries);
    };

    this.gameService.on('matchFound', this.onMatchFound);
    this.gameService.on('draftState', this.onDraftState);
    this.gameService.on('matchmakingStatus', this.onMatchmakingStatus);
    this.gameService.on('disconnected', this.onDisconnected);
    this.gameService.on('leaderboard', this.onLeaderboard);
  }

  private cleanupEvents(): void {
    if (this.onMatchFound) {
      this.gameService.off('matchFound', this.onMatchFound);
      this.onMatchFound = null;
    }
    if (this.onDraftState) {
      this.gameService.off('draftState', this.onDraftState);
      this.onDraftState = null;
    }
    if (this.onMatchmakingStatus) {
      this.gameService.off('matchmakingStatus', this.onMatchmakingStatus);
      this.onMatchmakingStatus = null;
    }
    if (this.onDisconnected) {
      this.gameService.off('disconnected', this.onDisconnected);
      this.onDisconnected = null;
    }
    if (this.onLeaderboard) {
      this.gameService.off('leaderboard', this.onLeaderboard);
      this.onLeaderboard = null;
    }
  }

  /**
   * Render (or hide) the all-time top-5 panel. Called on create with the
   * cached entries and again whenever a leaderboard event arrives while
   * the lobby is open — the panel updates in place, no scene restart.
   */
  private updateLeaderboard(entries: LeaderboardEntry[]): void {
    const hasEntries = entries.length > 0;
    this.leaderboardRowsText.setVisible(hasEntries);
    this.leaderboardTitleText.setVisible(hasEntries);
    if (!hasEntries) return;

    this.leaderboardRowsText.setText(
      entries.map((entry, i) => formatLeaderboardRow(i + 1, entry)).join('\n'),
    );
    // Bottom-anchored rows grow upward as entries appear; keep the title
    // sitting just above however tall the row block currently is.
    this.leaderboardTitleText.setY(
      this.leaderboardRowsText.y - this.leaderboardRowsText.height - 8,
    );
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

    this.nicknameDom = this.add
      .dom(x, y, input)
      .setOrigin(0.5, 0.5)
      .setDepth(WastelandStreet.DEPTH.UI + 1);

    input.addEventListener('input', () => {
      const sanitized = input.value.replace(/[^a-zA-Z0-9_\-.]/g, '').slice(0, 16);
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
    // every blink. Both '_' and the NBSP render the same width in the
    // Silkscreen monospace pixel font.
    const cursor = this.cursorVisible ? '_' : ' ';
    this.nicknameText.setText(this.nickname + cursor);
  }

  private saveNickname(): void {
    localStorage.setItem(STORAGE_KEY_NICKNAME, this.nickname);
  }

  private onQuickMatch(): void {
    if (this.isSearching) return;
    if (!this.validateNickname()) return;

    this.isSearching = true;
    this.searchStartTime = Date.now();

    // Hide mobile virtual keyboard once matchmaking commits.
    this.nicknameInput?.blur();

    // Request fullscreen on this user gesture. Best-effort — many iOS
    // Safari versions report fullscreenEnabled=false and we skip.
    this.tryStartFullscreen();

    // Swap panel content into searching state. The name-entry group must
    // hide too — the searching text sits in the input box's band, and the
    // invisible HTML <input> would otherwise keep swallowing taps.
    this.setNameEntryVisible(false);
    this.searchingText.setVisible(true);
    this.searchTimerText.setVisible(true);
    this.cancelButton.setVisible(true);
    this.quickMatchButton.setVisible(false);
    this.practiceButton.setVisible(false);
    this.gauntletButton.setVisible(false);
    this.difficultyButton.setVisible(false);

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
        const elapsed = Math.floor((Date.now() - this.searchStartTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        this.searchTimerText.setText(`${mins}:${secs.toString().padStart(2, '0')}`);
      },
    });

    this.gameService.joinMatchmaking(this.nickname);
  }

  private onPractice(kind: PracticeKind): void {
    if (this.isSearching || !this.validateNickname()) return;
    this.nicknameInput?.blur();
    this.tryStartFullscreen();
    this.gameService.startPractice(this.nickname, this.practiceDifficulty, kind);
  }

  private cyclePracticeDifficulty(): void {
    const current = BOT_DIFFICULTIES.indexOf(this.practiceDifficulty);
    this.practiceDifficulty = BOT_DIFFICULTIES[(current + 1) % BOT_DIFFICULTIES.length];
    localStorage.setItem(STORAGE_KEY_BOT_DIFFICULTY, this.practiceDifficulty);
    this.difficultyButton.setLabel(this.difficultyLabel());
  }

  private difficultyLabel(): string {
    return `RUSTY LEVEL: ${this.practiceDifficulty.toUpperCase()}`;
  }

  /** Fullscreen improves play, but browser policy must never block a match. */
  private tryStartFullscreen(): void {
    if (!document.fullscreenEnabled || document.fullscreenElement) return;
    const target = document.getElementById('game-container');
    if (!target?.requestFullscreen) return;
    void target.requestFullscreen().catch(() => {
      // Embedded browsers and automation can deny fullscreen despite a
      // click gesture. The game remains playable in its fitted canvas.
    });
  }

  private validateNickname(): boolean {
    if (this.nickname.length >= 2) return true;
    const centerX = this.cameras.main.width / 2;
    const flash = this.add
      .text(centerX, this.cameras.main.height - 70, 'CALLSIGN MUST BE AT LEAST 2 CHARACTERS', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '14px',
        color: cssHex(ERROR_COLOR),
      })
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI + 2);
    this.time.delayedCall(2000, () => flash.destroy());
    return false;
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
    this.practiceButton.setVisible(true);
    this.gauntletButton.setVisible(true);
    this.difficultyButton.setVisible(true);
    this.setNameEntryVisible(true);

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
    const label = count === 1 ? '1 PLAYER ONLINE' : `${count} PLAYERS ONLINE`;
    this.playerCountText.setText(label);
  }

  private isLikelyMobile(): boolean {
    // Match the convention used elsewhere in client (is-touch-device.ts):
    // touch capability + small viewport. Used to decide on reduced
    // particle counts in the parallax backdrop.
    return 'ontouchstart' in window && Math.min(window.innerWidth, window.innerHeight) < 600;
  }
}
