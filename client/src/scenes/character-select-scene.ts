import Phaser from 'phaser';
import type { PlayerId } from '@shared/types/common.js';
import type { CharacterDef } from '@shared/types/character.js';
import type { ServerCharacterSelectStateMessage } from '@shared/types/network.js';
import {
  CHARACTERS,
  CHARACTER_IDS,
  gameModeDisplayName,
  type CharacterId,
} from '@shared/config/game.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { GameService, type MatchData } from '../services/game-service.js';
import { isTouchDevice } from '../input/is-touch-device.js';
import { MenuGamepadInput } from '../input/menu-gamepad.js';
import { WastelandStreet } from '../ui/menu/wasteland-street.js';
import { PixelButton } from '../ui/menu/pixel-button.js';
import { TitleLogo } from '../ui/menu/title-logo.js';
import { MENU_FONTS } from '../ui/menu/fonts.js';
import { drawBeveledChrome } from '../ui/menu/menu-panel.js';
import { characterMasteryLabel } from '../ui/character-mastery.js';
import { gauntletMatchLabel } from '../ui/practice-gauntlet.js';
import { practiceMutatorBriefingLabel } from '../ui/practice-mutator.js';

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
const MASTERY_COLOR = Wasteland.HEALTH_WARNING;
const FOOTER_COLOR = Wasteland.COVER_FILL; // weathered tan — readable against the near-ground band

// Card sizing scales with roster count: the original 3-card layout used
// 240px cards with 48px gaps, but larger rosters need a dense pass. Six
// fighters use 142px cards with 12px gaps (912px total on the 960px canvas).
const CARD_COUNT = CHARACTER_IDS.length;
const COMPACT = CARD_COUNT > 3;
const DENSE = CARD_COUNT > 5;
const SPRITE_SCALE = DENSE ? 3.5 : COMPACT ? 4 : 6;
const CARD_WIDTH = DENSE ? 142 : COMPACT ? 172 : 240;
const CARD_HEIGHT = 260;
const CARD_GAP = DENSE ? 12 : COMPACT ? 16 : 48;
const NAME_FONT_PX = DENSE ? 10 : COMPACT ? 12 : 14;
const BLURB_FONT_PX = DENSE ? 8 : COMPACT ? 10 : 13;
const DOUBLE_TAP_MS = 400;

// Stat-bar normalization for the HP/SPD pips: HP fills relative to the
// roster's biggest pool; speed lerps across the roster's min..max range
// (floored at 20% so the slowest character still shows a bar, not a sliver).
const ROSTER_DEFS = CHARACTER_IDS.map((id) => CHARACTERS[id]);
const HP_MAX = Math.max(...ROSTER_DEFS.map((d) => d.maxHealth));
const SPD_MIN = Math.min(...ROSTER_DEFS.map((d) => d.speedMultiplier));
const SPD_MAX = Math.max(...ROSTER_DEFS.map((d) => d.speedMultiplier));
const HP_BAR_COLOR = Wasteland.HEALTH_GOOD;
const SPD_BAR_COLOR = Wasteland.HEALTH_WARNING;

function hpFraction(maxHealth: number): number {
  return maxHealth / HP_MAX;
}

function spdFraction(multiplier: number): number {
  if (SPD_MAX === SPD_MIN) return 1;
  return 0.2 + 0.8 * ((multiplier - SPD_MIN) / (SPD_MAX - SPD_MIN));
}

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
  if (id === 'mighty_man') return 'X-RAY VISION\nshoot thru walls (30s)';
  if (id === 'frost_wizard') return 'FROST LOCK\nfreeze enemy 2s (30s)';
  if (id === 'bubba') return 'IRON HIDE\nhalf damage 4s (30s)';
  if (id === 'jack') return 'AXE THROW\n60 dmg axe (12s)';
  if (id === 'rook') return 'BREACH DASH\n3 tiles, wall-safe (8s)';
  return '';
}

export class CharacterSelectScene extends Phaser.Scene {
  private gameService!: GameService;
  private nickname = '';
  private matchData: MatchData | null = null;

  private cards = new Map<CharacterId, CardWidgets>();
  private menuGamepad: MenuGamepadInput | null = null;
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
    this.menuGamepad = null;
    this.lastTapId = null;
    this.lastTapMs = 0;
    this.transitioned = false;
    this.cards = new Map();
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.gameService = GameService.getInstance();
    this.menuGamepad = new MenuGamepadInput();

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

    // Up-next line: the mode + map this match will be played in (from
    // matchFound via matchData). Mode rotation's pre-match surface — the
    // lobby fades straight into this screen.
    let matchLabelLineCount = 1;
    if (this.matchData) {
      const modeName = gameModeDisplayName(this.matchData.gameMode);
      const matchLabel = this.matchData.gauntlet
        ? gauntletMatchLabel(
            this.matchData.gauntlet,
            this.matchData.gameMode,
            this.matchData.mapName,
          )
        : [
            `NEXT: ${modeName} - ${this.matchData.mapName.toUpperCase()}`,
            ...(this.matchData.practiceMutatorId
              ? [practiceMutatorBriefingLabel(this.matchData.practiceMutatorId)]
              : []),
          ].join('\n');
      matchLabelLineCount = matchLabel.split('\n').length;
      this.add
        .text(centerX, 142, matchLabel, {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: '11px',
          color: cssHex(TIMER_COLOR),
        })
        .setOrigin(0.5)
        .setDepth(WastelandStreet.DEPTH.UI);
    }

    // ────────────────────────────────────────────────────────────────────
    // Character cards — laid out horizontally, centered. Spacing scales
    // with card count so a future 3rd character still fits.
    // ────────────────────────────────────────────────────────────────────
    const totalWidth = CHARACTER_IDS.length * CARD_WIDTH + (CHARACTER_IDS.length - 1) * CARD_GAP;
    const startX = centerX - totalWidth / 2 + CARD_WIDTH / 2;
    // Multi-line Gauntlet briefings can include a forecast and Daily chase.
    // Move the roster down just enough to keep every authored line readable.
    const cardY = 280 + Math.max(0, matchLabelLineCount - 2) * 22;

    CHARACTER_IDS.forEach((id, idx) => {
      const x = startX + idx * (CARD_WIDTH + CARD_GAP);
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
      .text(centerX, camHeight - 24, 'TAP / CLICK OR D-PAD TO PICK  •  ENTER / A TO LOCK IN', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '12px',
        color: cssHex(FOOTER_COLOR),
      })
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
    this.menuGamepad = null;
    for (const card of this.cards.values()) {
      card.pulseTween?.stop();
    }
  }

  update(): void {
    const actions = this.menuGamepad?.poll();
    if (!actions?.hasAction) return;
    this.lockButton.setFocused(true);
    if (actions.left || actions.up) this.cycleHover(-1);
    else if (actions.right || actions.down) this.cycleHover(1);
    if (actions.confirm || actions.alternate) this.lockButton.activate();
  }

  private createCard(id: CharacterId, x: number, y: number): CardWidgets {
    const def: CharacterDef = CHARACTERS[id];

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
    // Raised to make room for the stat identity rows underneath.
    const sprite = this.add.sprite(0, -56, `${def.spritePrefix}_down_idle`);
    sprite.setScale(SPRITE_SCALE);
    sprite.play(`${def.spritePrefix}_down_idle`);

    let bodyOverlay: Phaser.GameObjects.Sprite | null = null;
    if (def.bodyOverlay) {
      const key = `${def.bodyOverlay.spritePrefix}_down_idle`;
      const offsetY =
        ((def.bodyOverlay.idleFrames.down.h - def.idleFrames.down.h) / 2) * SPRITE_SCALE;
      bodyOverlay = this.add.sprite(0, -56 + offsetY, key);
      bodyOverlay.setScale(SPRITE_SCALE);
      bodyOverlay.play(key);
    }

    const nameText = this.add
      .text(0, 4, def.displayName.toUpperCase(), {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: `${NAME_FONT_PX}px`,
        color: cssHex(VALUE_COLOR),
      })
      .setOrigin(0.5);

    const masteryText = this.add
      .text(0, 17, characterMasteryLabel(this.matchData?.characterWins[id]), {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: COMPACT ? '7px' : '9px',
        color: cssHex(MASTERY_COLOR),
      })
      .setOrigin(0.5);

    // Stat identity rows — HP and SPD bars normalized across the roster
    // so the counterpick differences are legible at a glance.
    const statWidgets = [
      ...this.createStatRow(28, 'HP', hpFraction(def.maxHealth), HP_BAR_COLOR, `${def.maxHealth}`),
      ...this.createStatRow(
        46,
        'SPD',
        spdFraction(def.speedMultiplier),
        SPD_BAR_COLOR,
        `${def.speedMultiplier.toFixed(2)}x`,
      ),
    ];

    const abilityText = this.add
      .text(0, 78, abilityBlurb(id), {
        fontFamily: MENU_FONTS.BODY,
        fontSize: `${BLURB_FONT_PX}px`,
        color: cssHex(LABEL_COLOR),
        align: 'center',
        lineSpacing: 4,
      })
      .setOrigin(0.5);

    const lockedBadge = this.add
      .text(0, CARD_HEIGHT / 2 - 22, '', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: COMPACT ? '9px' : '10px',
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
      ...(bodyOverlay ? [bodyOverlay] : []),
      nameText,
      masteryText,
      ...statWidgets,
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

  /**
   * One labeled stat bar row inside a card: "HP ▮▮▮▮▯ 150". Local-space
   * coordinates (card center = 0,0), returned as loose game objects for
   * the card container to adopt.
   */
  private createStatRow(
    y: number,
    label: string,
    fraction: number,
    color: number,
    value: string,
  ): Phaser.GameObjects.GameObject[] {
    const inset = 14;
    const labelText = this.add
      .text(-CARD_WIDTH / 2 + inset, y, label, {
        fontFamily: MENU_FONTS.BODY,
        fontSize: COMPACT ? '11px' : '13px',
        color: cssHex(LABEL_COLOR),
      })
      .setOrigin(0, 0.5);

    const valueText = this.add
      .text(CARD_WIDTH / 2 - inset, y, value, {
        fontFamily: MENU_FONTS.BODY,
        fontSize: COMPACT ? '11px' : '13px',
        color: cssHex(VALUE_COLOR),
      })
      .setOrigin(1, 0.5);

    const barX = -CARD_WIDTH / 2 + inset + (COMPACT ? 34 : 42);
    const barW = CARD_WIDTH - inset * 2 - (COMPACT ? 76 : 92);
    const barH = 7;
    const bar = this.add.graphics();
    bar.fillStyle(Wasteland.CANVAS_BG, 1);
    bar.fillRect(barX, y - barH / 2, barW, barH);
    bar.fillStyle(color, 1);
    bar.fillRect(
      barX + 1,
      y - barH / 2 + 1,
      Math.max(2, (barW - 2) * Math.min(1, fraction)),
      barH - 2,
    );

    return [labelText, bar, valueText];
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
      colors.push(isSelf ? cssHex(LOCAL_NICK_COLOR) : cssHex(OPPONENT_NICK_COLOR));
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
    this.timerText.setColor(cssHex(seconds <= 5 ? TIMER_URGENT_COLOR : TIMER_COLOR));
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
    return this.latestSelections.some((s) => s.playerId !== localId && s.lockedCharacterId === id);
  }

  private isLikelyMobile(): boolean {
    return 'ontouchstart' in window && Math.min(window.innerWidth, window.innerHeight) < 600;
  }
}
