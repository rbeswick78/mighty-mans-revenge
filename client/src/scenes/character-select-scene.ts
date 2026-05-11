import Phaser from 'phaser';
import type { PlayerId } from '@shared/types/common.js';
import type { ServerCharacterSelectStateMessage } from '@shared/types/network.js';
import {
  CHARACTERS,
  CHARACTER_IDS,
  type CharacterId,
} from '@shared/config/game.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { GameService, type MatchData } from '../services/game-service.js';
import { isTouchDevice } from '../input/is-touch-device.js';
import { WastelandStreet } from '../ui/menu/wasteland-street.js';
import { PixelButton } from '../ui/menu/pixel-button.js';
import { TitleLogo } from '../ui/menu/title-logo.js';
import { MENU_FONTS } from '../ui/menu/fonts.js';
import { drawBeveledChrome } from '../ui/menu/menu-panel.js';

// Scene-local color decisions. HEALTH_GOOD (mint) doubles as the "you"
// highlight — same color the HUD uses for the local player's health bar,
// so the affordance reads consistently. Magenta has no clean Resurrect-64
// match, so the opponent-claim color is a punchy 0xff58d8 outside the
// palette — tonally adjacent to TEXT_DAMAGE / lavender slots.
const SUBTITLE_COLOR = Wasteland.COVER_FILL;
const LABEL_COLOR = Wasteland.COVER_FILL;
const VALUE_COLOR = Wasteland.TEXT_PRIMARY;
const LOCAL_NICK_COLOR = Wasteland.HEALTH_GOOD;
const OPPONENT_NICK_COLOR = Wasteland.HIT_FLASH;
const SELF_HOVER_COLOR = Wasteland.HEALTH_GOOD;
const OPP_HOVER_COLOR = 0xff58d8;
const LOCKED_BADGE_COLOR = Wasteland.HEALTH_GOOD;
const TIMER_COLOR = Wasteland.HEALTH_WARNING;
const TIMER_URGENT_COLOR = Wasteland.HIT_FLASH;
const FOOTER_COLOR = Wasteland.COVER_FILL; // weathered tan — readable against the near-ground band

const SPRITE_SCALE = 6;
const CARD_WIDTH = 240;
const CARD_HEIGHT = 260;
const DOUBLE_TAP_MS = 400;

interface CharacterSelectSceneData {
  nickname?: string;
  matchData?: MatchData;
}

interface CardWidgets {
  characterId: CharacterId;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  border: Phaser.GameObjects.Graphics;
  sprite: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  lockedBadge: Phaser.GameObjects.Text;
  hitZone: Phaser.GameObjects.Zone;
  pulseTween: Phaser.Tweens.Tween | null;
}

function abilityBlurb(id: CharacterId): string {
  if (id === 'bruce') return 'FIRE BREATH\nthrough walls (45s)';
  if (id === 'mighty_man') return 'X-RAY VISION\nshoot through walls (30s)';
  if (id === 'frost_wizard') return 'FROST LOCK\nfreeze nearest enemy 2s (30s)';
  return '';
}

export class CharacterSelectScene extends Phaser.Scene {
  private gameService!: GameService;
  private nickname = '';
  private matchData: MatchData | null = null;

  private cards = new Map<CharacterId, CardWidgets>();
  private statusText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private lockButton!: PixelButton;

  private localHoveredId: CharacterId | null = null;
  private latestSelections: ServerCharacterSelectStateMessage['selections'] = [];
  private lastTapId: CharacterId | null = null;
  private lastTapMs = 0;
  private transitioned = false;

  private onCharacterSelectState: ((msg: ServerCharacterSelectStateMessage) => void) | null = null;
  private onMatchCountdown: ((countdown: number) => void) | null = null;
  private onOpponentDisconnected: ((playerId: PlayerId) => void) | null = null;
  private onDisconnected: (() => void) | null = null;

  constructor() {
    super({ key: 'CharacterSelectScene' });
  }

  init(data: CharacterSelectSceneData): void {
    this.nickname = data.nickname ?? 'Player';
    this.matchData = data.matchData ?? null;
    this.localHoveredId = null;
    this.latestSelections = [];
    this.lastTapId = null;
    this.lastTapMs = 0;
    this.transitioned = false;
    this.cards = new Map();
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.gameService = GameService.getInstance();

    const centerX = this.cameras.main.width / 2;
    const camHeight = this.cameras.main.height;

    // ────────────────────────────────────────────────────────────────────
    // Backdrop: same wasteland street as the lobby + results so the
    // menu trio reads as one continuous place.
    // ────────────────────────────────────────────────────────────────────
    new WastelandStreet(this, { lowDetail: this.isLikelyMobile() });

    // ────────────────────────────────────────────────────────────────────
    // Logo + subtitle
    // ────────────────────────────────────────────────────────────────────
    new TitleLogo(this, centerX, 70, ['CHOOSE YOUR FIGHTER'], {
      fontSize: 24,
      strokeThickness: 3,
    }).setDepth(WastelandStreet.DEPTH.UI);

    this.add
      .text(centerX, 118, 'POST-APOCALYPTIC SHOWDOWN', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '14px',
        color: cssHex(SUBTITLE_COLOR),
      })
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    // ────────────────────────────────────────────────────────────────────
    // Character cards — laid out horizontally, centered. Spacing scales
    // with card count so a future 3rd character still fits.
    // ────────────────────────────────────────────────────────────────────
    const totalWidth =
      CHARACTER_IDS.length * CARD_WIDTH + (CHARACTER_IDS.length - 1) * 48;
    const startX = centerX - totalWidth / 2 + CARD_WIDTH / 2;
    const cardY = 280;

    CHARACTER_IDS.forEach((id, idx) => {
      const x = startX + idx * (CARD_WIDTH + 48);
      this.cards.set(id, this.createCard(id, x, cardY));
    });

    // ────────────────────────────────────────────────────────────────────
    // Status, timer, lock button
    // ────────────────────────────────────────────────────────────────────
    const statusY = cardY + CARD_HEIGHT / 2 + 26;
    this.statusText = this.add
      .text(centerX, statusY, '', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '14px',
        color: cssHex(LABEL_COLOR),
        align: 'center',
        lineSpacing: 4,
      })
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    this.timerText = this.add
      .text(centerX, statusY + 56, 'AUTO-LOCK IN 0:30', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '11px',
        color: cssHex(TIMER_COLOR),
      })
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    const btnW = 220;
    const btnH = 46;
    this.lockButton = new PixelButton(
      this,
      centerX - btnW / 2,
      statusY + 76,
      btnW,
      btnH,
      'LOCK IN',
      {
        variant: 'primary',
        fontSize: 14,
        onClick: () => this.tryLockCurrent(),
      },
    );
    this.lockButton.setDepth(WastelandStreet.DEPTH.UI);

    this.add
      .text(
        centerX,
        camHeight - 24,
        'TAP / CLICK TO HOVER  •  ENTER OR LOCK IN BUTTON TO LOCK',
        {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '12px',
          color: cssHex(FOOTER_COLOR),
        },
      )
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    this.input.keyboard?.on('keydown-LEFT', () => this.cycleHover(-1));
    this.input.keyboard?.on('keydown-A', () => this.cycleHover(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.cycleHover(1));
    this.input.keyboard?.on('keydown-D', () => this.cycleHover(1));
    this.input.keyboard?.on('keydown-ENTER', () => this.tryLockCurrent());
    this.input.keyboard?.on('keydown-SPACE', () => this.tryLockCurrent());

    this.wireGameServiceEvents();
  }

  shutdown(): void {
    this.cleanupEvents();
    for (const card of this.cards.values()) {
      card.pulseTween?.stop();
    }
  }

  private createCard(id: CharacterId, x: number, y: number): CardWidgets {
    const def = CHARACTERS[id];

    // Beveled pixel-art card chrome (square corners), matching the menu
    // panels on the lobby + results screens.
    const bg = this.add.graphics();
    drawBeveledChrome(bg, -CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, {
      fillColor: Wasteland.HUD_STRIP_BG,
      fillAlpha: 0.92,
      strokeColor: Wasteland.CANVAS_BG,
      highlightColor: Wasteland.TEXT_PRIMARY,
      shadowColor: Wasteland.WALL_LINE,
    });

    // Border highlight (drawn on top of bg, toggled in drawCardBorder).
    const border = this.add.graphics();

    // Character preview sprite — same animation key style as elsewhere.
    const sprite = this.add.sprite(0, -32, `${def.spritePrefix}_down_idle`);
    sprite.setScale(SPRITE_SCALE);
    sprite.play(`${def.spritePrefix}_down_idle`);

    const nameText = this.add
      .text(0, CARD_HEIGHT / 2 - 70, def.displayName.toUpperCase(), {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '14px',
        color: cssHex(VALUE_COLOR),
      })
      .setOrigin(0.5);

    const abilityText = this.add
      .text(0, CARD_HEIGHT / 2 - 42, abilityBlurb(id), {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '13px',
        color: cssHex(LABEL_COLOR),
        align: 'center',
        lineSpacing: 4,
      })
      .setOrigin(0.5);

    const lockedBadge = this.add
      .text(0, CARD_HEIGHT / 2 - 16, '', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '10px',
        color: cssHex(LOCKED_BADGE_COLOR),
      })
      .setOrigin(0.5);

    const hitZone = this.add
      .zone(0, 0, CARD_WIDTH, CARD_HEIGHT)
      .setInteractive({ useHandCursor: true });

    hitZone.on('pointerdown', () => this.onCardTap(id));

    const container = this.add.container(x, y, [
      bg,
      border,
      sprite,
      nameText,
      abilityText,
      lockedBadge,
      hitZone,
    ]);
    container.setDepth(WastelandStreet.DEPTH.UI);

    return {
      characterId: id,
      container,
      bg,
      border,
      sprite,
      nameText,
      lockedBadge,
      hitZone,
      pulseTween: null,
    };
  }

  private wireGameServiceEvents(): void {
    this.onCharacterSelectState = (msg: ServerCharacterSelectStateMessage) => {
      this.latestSelections = msg.selections;
      this.applyServerState(msg);
    };

    this.onMatchCountdown = (_countdown: number) => {
      // First countdown broadcast = server has finished select; transition
      // to GameScene. Same fade-with-fallback-timer pattern as LobbyScene.
      if (this.transitioned) return;
      this.transitioned = true;
      const goToGame = (): void => {
        this.cleanupEvents();
        this.scene.start('GameScene', {
          nickname: this.nickname,
          matchData: this.matchData,
        });
      };
      let started = false;
      const fadeAndGo = (): void => {
        if (started) return;
        started = true;
        goToGame();
      };
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', fadeAndGo);
      this.time.delayedCall(500, fadeAndGo);
    };

    this.onOpponentDisconnected = (_playerId: PlayerId) => {
      this.bailToLobby();
    };

    this.onDisconnected = () => {
      this.bailToLobby();
    };

    this.gameService.on('characterSelectState', this.onCharacterSelectState);
    this.gameService.on('matchCountdown', this.onMatchCountdown);
    this.gameService.on('opponentDisconnected', this.onOpponentDisconnected);
    this.gameService.on('disconnected', this.onDisconnected);
  }

  private cleanupEvents(): void {
    if (this.onCharacterSelectState) {
      this.gameService.off('characterSelectState', this.onCharacterSelectState);
      this.onCharacterSelectState = null;
    }
    if (this.onMatchCountdown) {
      this.gameService.off('matchCountdown', this.onMatchCountdown);
      this.onMatchCountdown = null;
    }
    if (this.onOpponentDisconnected) {
      this.gameService.off('opponentDisconnected', this.onOpponentDisconnected);
      this.onOpponentDisconnected = null;
    }
    if (this.onDisconnected) {
      this.gameService.off('disconnected', this.onDisconnected);
      this.onDisconnected = null;
    }
  }

  private bailToLobby(): void {
    if (this.transitioned) return;
    this.transitioned = true;
    const go = (): void => {
      this.cleanupEvents();
      this.scene.start('LobbyScene');
    };
    let started = false;
    const fadeAndGo = (): void => {
      if (started) return;
      started = true;
      go();
    };
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', fadeAndGo);
    this.time.delayedCall(500, fadeAndGo);
  }

  private applyServerState(msg: ServerCharacterSelectStateMessage): void {
    const localId = this.gameService.getPlayerId();
    const self = msg.selections.find((s) => s.playerId === localId);
    const others = msg.selections.filter((s) => s.playerId !== localId);

    // Adopt the server's hover as ground truth so the local renderer
    // always matches what the server thinks. The server snaps a hover
    // off a taken character automatically; mirroring its hover keeps
    // the cyan outline and that snap in sync.
    if (self?.hoveredCharacterId) {
      this.localHoveredId = self.hoveredCharacterId;
    } else if (this.localHoveredId === null) {
      this.localHoveredId = CHARACTER_IDS[0];
    }

    const selfLockedId = self?.lockedCharacterId ?? null;
    const oppHoveredId = others[0]?.hoveredCharacterId ?? null;
    const oppLockedId = others[0]?.lockedCharacterId ?? null;

    for (const card of this.cards.values()) {
      const id = card.characterId;
      const selfHovers = self && !selfLockedId && self.hoveredCharacterId === id;
      const oppHovers = oppHoveredId === id;
      const isSelfLocked = selfLockedId === id;
      const isOppLocked = oppLockedId === id;
      const lockedByOther = isOppLocked && !isSelfLocked;

      this.drawCardBorder(card, !!selfHovers || isSelfLocked, !!oppHovers || isOppLocked);

      if (isSelfLocked || isOppLocked) {
        const who = isSelfLocked ? 'YOU' : 'OPPONENT';
        card.lockedBadge.setText(`LOCKED · ${who}`);
        card.lockedBadge.setColor(
          cssHex(isSelfLocked ? LOCKED_BADGE_COLOR : OPPONENT_NICK_COLOR),
        );
        if (!card.pulseTween) {
          card.pulseTween = this.tweens.add({
            targets: card.sprite,
            scale: { from: SPRITE_SCALE, to: SPRITE_SCALE * 1.08 },
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
      } else {
        card.lockedBadge.setText('');
        if (card.pulseTween) {
          card.pulseTween.stop();
          card.pulseTween = null;
          card.sprite.setScale(SPRITE_SCALE);
        }
      }

      // Grey out cards the opponent has locked that we haven't.
      const greyOut = lockedByOther;
      card.container.setAlpha(greyOut ? 0.5 : 1);
      card.hitZone.input!.enabled = !greyOut;
    }

    this.updateStatusLine(msg.selections, localId);
    this.updateTimer(msg.timeRemainingMs);
    this.updateLockButton(self ?? null);
  }

  private drawCardBorder(
    card: CardWidgets,
    selfActive: boolean,
    oppActive: boolean,
  ): void {
    card.border.clear();
    if (!selfActive && !oppActive) return;

    // Square corners — match the beveled chrome aesthetic.
    const inset = 3;
    const x = -CARD_WIDTH / 2 + inset;
    const y = -CARD_HEIGHT / 2 + inset;
    const w = CARD_WIDTH - inset * 2;
    const h = CARD_HEIGHT - inset * 2;

    if (selfActive) {
      card.border.lineStyle(3, SELF_HOVER_COLOR, 1);
      card.border.strokeRect(x, y, w, h);
    }
    if (oppActive) {
      // Inset the opponent border slightly so both can show simultaneously.
      const off = selfActive ? 4 : 0;
      card.border.lineStyle(2, OPP_HOVER_COLOR, 1);
      card.border.strokeRect(x + off, y + off, w - off * 2, h - off * 2);
    }
  }

  private updateStatusLine(
    selections: ServerCharacterSelectStateMessage['selections'],
    localId: PlayerId | null,
  ): void {
    const lines: string[] = [];
    const colors: string[] = [];
    for (const s of selections) {
      const isSelf = s.playerId === localId;
      const prefix = isSelf ? 'YOU' : s.nickname.toUpperCase();
      const status = s.lockedCharacterId
        ? `LOCKED · ${CHARACTERS[s.lockedCharacterId].displayName.toUpperCase()}`
        : 'choosing...';
      lines.push(`${prefix}: ${status}`);
      colors.push(
        isSelf ? cssHex(LOCAL_NICK_COLOR) : cssHex(OPPONENT_NICK_COLOR),
      );
    }
    if (lines.length === 0) {
      this.statusText.setText('Waiting for players...');
      return;
    }
    // Phaser.Text doesn't support per-line colors without rich-text setup;
    // use the local color since the "you" line is most actionable.
    this.statusText.setColor(colors[0]);
    this.statusText.setText(lines.join('\n'));
  }

  private updateTimer(timeRemainingMs: number): void {
    const seconds = Math.max(0, Math.ceil(timeRemainingMs / 1000));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    this.timerText.setText(`AUTO-LOCK IN ${mins}:${secs.toString().padStart(2, '0')}`);
    this.timerText.setColor(
      cssHex(seconds <= 5 ? TIMER_URGENT_COLOR : TIMER_COLOR),
    );
  }

  private updateLockButton(
    self: ServerCharacterSelectStateMessage['selections'][number] | null,
  ): void {
    const isLocked = !!self?.lockedCharacterId;
    this.lockButton.setDisabled(isLocked);
  }

  private onCardTap(id: CharacterId): void {
    const selfLocked = this.findSelfLocked();
    if (selfLocked) return;
    if (this.isCardLockedByOther(id)) return;

    if (isTouchDevice()) {
      const now = performance.now();
      if (this.lastTapId === id && now - this.lastTapMs < DOUBLE_TAP_MS) {
        this.lastTapId = null;
        this.lastTapMs = 0;
        this.gameService.sendCharacterLock(id);
        return;
      }
      this.lastTapId = id;
      this.lastTapMs = now;
      this.localHoveredId = id;
      this.gameService.sendCharacterHover(id);
      return;
    }

    // Desktop: clicking the already-hovered card commits the lock; first
    // click on a new card just hovers.
    if (this.localHoveredId === id) {
      this.gameService.sendCharacterLock(id);
    } else {
      this.localHoveredId = id;
      this.gameService.sendCharacterHover(id);
    }
  }

  private cycleHover(direction: 1 | -1): void {
    if (this.findSelfLocked()) return;

    const selectable = CHARACTER_IDS.filter(
      (id) => !this.isCardLockedByOther(id),
    );
    if (selectable.length === 0) return;

    const current = this.localHoveredId ?? selectable[0];
    const idx = selectable.indexOf(current);
    const nextIdx = (idx + direction + selectable.length) % selectable.length;
    const next = selectable[nextIdx];
    this.localHoveredId = next;
    this.gameService.sendCharacterHover(next);
  }

  private tryLockCurrent(): void {
    if (this.findSelfLocked()) return;
    const id = this.localHoveredId;
    if (!id) return;
    if (this.isCardLockedByOther(id)) return;
    this.gameService.sendCharacterLock(id);
  }

  private findSelfLocked(): CharacterId | null {
    const localId = this.gameService.getPlayerId();
    const self = this.latestSelections.find((s) => s.playerId === localId);
    return self?.lockedCharacterId ?? null;
  }

  private isCardLockedByOther(id: CharacterId): boolean {
    const localId = this.gameService.getPlayerId();
    return this.latestSelections.some(
      (s) => s.playerId !== localId && s.lockedCharacterId === id,
    );
  }

  private isLikelyMobile(): boolean {
    return (
      'ontouchstart' in window &&
      Math.min(window.innerWidth, window.innerHeight) < 600
    );
  }
}
