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

// --- Wasteland palette mapping for the character-select chrome (TUNABLE) ---
// HEALTH_GOOD (mint) doubles as the "you" highlight — pops against the
// dark plum background and visually reinforces "this is your slot" using
// the same color the HUD uses for your own health bar. Magenta has no
// clean Resurrect-64 match for "opponent claim," so we tune a saturated
// pink-magenta from the palette family (eaaded family) up to a punchier
// 0xff58d8 to keep contrast against the mint while staying tonally
// adjacent to the existing TEXT_DAMAGE / lavender slots.
const TITLE_COLOR = Wasteland.LOADING_BAR_FILL;
const TITLE_STROKE = Wasteland.CANVAS_BG;
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
const PRIMARY_BTN_COLOR = Wasteland.LOADING_BAR_FILL;
const BTN_LABEL_COLOR = Wasteland.TEXT_PRIMARY;
const CARD_BG_COLOR = Wasteland.HUD_STRIP_BG;
const CARD_BORDER_COLOR = Wasteland.WALL_FILL;
const FOOTER_COLOR = Wasteland.WALL_LINE;
const HOVER_LIGHTEN = 20;

const SPRITE_SCALE = 6;
const CARD_WIDTH = 220;
const CARD_HEIGHT = 220;
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

const lighten = (hex: number, amount: number): number =>
  Phaser.Display.Color.ValueToColor(hex).lighten(amount).color;

export class CharacterSelectScene extends Phaser.Scene {
  private gameService!: GameService;
  private nickname = '';
  private matchData: MatchData | null = null;

  private cards = new Map<CharacterId, CardWidgets>();
  private statusText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private lockButton!: Phaser.GameObjects.Container;

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
    const centerY = this.cameras.main.height / 2;
    const yOffset = Math.max(0, (this.cameras.main.height - 540) / 2);

    this.add.text(centerX, 50 + yOffset, 'CHOOSE YOUR FIGHTER', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '28px',
      color: cssHex(TITLE_COLOR),
      stroke: cssHex(TITLE_STROKE),
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(centerX, 86 + yOffset, 'POST-APOCALYPTIC SHOWDOWN', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '11px',
      color: cssHex(SUBTITLE_COLOR),
    }).setOrigin(0.5);

    // Lay out cards horizontally, centered. Spacing scales with card
    // count so a future 3rd character still fits the canvas.
    const totalWidth = CHARACTER_IDS.length * CARD_WIDTH + (CHARACTER_IDS.length - 1) * 40;
    const startX = centerX - totalWidth / 2 + CARD_WIDTH / 2;
    const cardY = centerY - 30;

    CHARACTER_IDS.forEach((id, idx) => {
      const x = startX + idx * (CARD_WIDTH + 40);
      this.cards.set(id, this.createCard(id, x, cardY));
    });

    this.statusText = this.add.text(centerX, cardY + CARD_HEIGHT / 2 + 30, '', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '13px',
      color: cssHex(LABEL_COLOR),
      align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5);

    this.timerText = this.add.text(centerX, cardY + CARD_HEIGHT / 2 + 78, 'AUTO-LOCK IN 0:30', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '14px',
      color: cssHex(TIMER_COLOR),
    }).setOrigin(0.5);

    this.lockButton = this.createLockButton(centerX, cardY + CARD_HEIGHT / 2 + 110);

    this.add.text(centerX, this.cameras.main.height - 18, 'TAP / CLICK TO HOVER  •  ENTER OR LOCK IN BUTTON TO LOCK', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '9px',
      color: cssHex(FOOTER_COLOR),
    }).setOrigin(0.5);

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

    const bg = this.add.graphics();
    bg.fillStyle(CARD_BG_COLOR, 1);
    bg.fillRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 6);
    bg.lineStyle(1, CARD_BORDER_COLOR, 0.7);
    bg.strokeRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 6);

    const border = this.add.graphics();

    // Sprite is centered slightly above the name label. anims/textures
    // were registered in BootScene with key `<spritePrefix>_down_idle`.
    const sprite = this.add.sprite(0, -20, `${def.spritePrefix}_down_idle`);
    sprite.setScale(SPRITE_SCALE);
    sprite.play(`${def.spritePrefix}_down_idle`);

    const nameText = this.add.text(0, CARD_HEIGHT / 2 - 38, def.displayName.toUpperCase(), {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '16px',
      color: cssHex(VALUE_COLOR),
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const lockedBadge = this.add.text(0, CARD_HEIGHT / 2 - 18, '', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '12px',
      color: cssHex(LOCKED_BADGE_COLOR),
    }).setOrigin(0.5);

    const hitZone = this.add.zone(0, 0, CARD_WIDTH, CARD_HEIGHT)
      .setInteractive({ useHandCursor: true });

    hitZone.on('pointerdown', () => this.onCardTap(id));

    const container = this.add.container(x, y, [
      bg,
      border,
      sprite,
      nameText,
      lockedBadge,
      hitZone,
    ]);

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

  private createLockButton(centerX: number, buttonY: number): Phaser.GameObjects.Container {
    const baseColor = PRIMARY_BTN_COLOR;
    const hoverColor = lighten(baseColor, HOVER_LIGHTEN);

    const bg = this.add.graphics();
    bg.fillStyle(baseColor, 1);
    bg.fillRoundedRect(-90, 0, 180, 38, 4);

    const text = this.add.text(0, 19, 'LOCK IN', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '16px',
      color: cssHex(BTN_LABEL_COLOR),
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const zone = this.add.zone(0, 19, 180, 38).setInteractive({ useHandCursor: true });

    zone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(hoverColor, 1);
      bg.fillRoundedRect(-90, 0, 180, 38, 4);
    });

    zone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(baseColor, 1);
      bg.fillRoundedRect(-90, 0, 180, 38, 4);
    });

    zone.on('pointerdown', () => this.tryLockCurrent());

    return this.add.container(centerX, buttonY, [bg, text, zone]);
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
      const goToGame = () => {
        this.cleanupEvents();
        this.scene.start('GameScene', {
          nickname: this.nickname,
          matchData: this.matchData,
        });
      };
      let started = false;
      const fadeAndGo = () => {
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
    const go = () => {
      this.cleanupEvents();
      this.scene.start('LobbyScene');
    };
    let started = false;
    const fadeAndGo = () => {
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
        card.lockedBadge.setText(`✓ LOCKED (${who})`);
        card.lockedBadge.setColor(cssHex(isSelfLocked ? LOCKED_BADGE_COLOR : OPPONENT_NICK_COLOR));
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

  private drawCardBorder(card: CardWidgets, selfActive: boolean, oppActive: boolean): void {
    card.border.clear();
    if (!selfActive && !oppActive) return;

    const inset = 3;
    const w = CARD_WIDTH - inset * 2;
    const h = CARD_HEIGHT - inset * 2;
    const x = -CARD_WIDTH / 2 + inset;
    const y = -CARD_HEIGHT / 2 + inset;

    if (selfActive) {
      card.border.lineStyle(3, SELF_HOVER_COLOR, 1);
      card.border.strokeRoundedRect(x, y, w, h, 5);
    }
    if (oppActive) {
      // Inset the opponent border slightly so both can show simultaneously.
      const off = selfActive ? 4 : 0;
      card.border.lineStyle(2, OPP_HOVER_COLOR, 1);
      card.border.strokeRoundedRect(x + off, y + off, w - off * 2, h - off * 2, 4);
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
        ? `✓ LOCKED — ${CHARACTERS[s.lockedCharacterId].displayName}`
        : '⏳ choosing...';
      lines.push(`${prefix}: ${status}`);
      colors.push(isSelf ? cssHex(LOCAL_NICK_COLOR) : cssHex(OPPONENT_NICK_COLOR));
    }
    if (lines.length === 0) {
      this.statusText.setText('Waiting for players...');
      return;
    }
    // Phaser.Text doesn't support per-line colors without rich-text setup;
    // join with a separator and use the local color since "you" line is
    // most actionable — opponent name still reads clearly in the same hue.
    this.statusText.setColor(colors[0]);
    this.statusText.setText(lines.join('\n'));
  }

  private updateTimer(timeRemainingMs: number): void {
    const seconds = Math.max(0, Math.ceil(timeRemainingMs / 1000));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    this.timerText.setText(`AUTO-LOCK IN ${mins}:${secs.toString().padStart(2, '0')}`);
    this.timerText.setColor(cssHex(seconds <= 5 ? TIMER_URGENT_COLOR : TIMER_COLOR));
  }

  private updateLockButton(self: ServerCharacterSelectStateMessage['selections'][number] | null): void {
    const isLocked = !!self?.lockedCharacterId;
    this.lockButton.setAlpha(isLocked ? 0.4 : 1);
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

    const selectable = CHARACTER_IDS.filter((id) => !this.isCardLockedByOther(id));
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
}
