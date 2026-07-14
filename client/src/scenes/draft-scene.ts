import Phaser from 'phaser';
import type { PlayerId } from '@shared/types/common.js';
import type { DraftCategory, ServerDraftStateMessage } from '@shared/types/network.js';
import { DRAFT, gameModeDisplayName } from '@shared/config/game.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { AudioManager } from '../audio/audio-manager.js';
import { MenuGamepadInput } from '../input/menu-gamepad.js';
import { GameService, type MatchData } from '../services/game-service.js';
import { WastelandStreet } from '../ui/menu/wasteland-street.js';
import { PixelButton } from '../ui/menu/pixel-button.js';
import { TitleLogo } from '../ui/menu/title-logo.js';
import { MENU_FONTS } from '../ui/menu/fonts.js';
import { arenaMasteryDraftSubtitle } from '../ui/arena-mastery.js';
import {
  buildHopSchedule,
  deriveDraftView,
  firstPickedCategory,
  formatDraftCountdown,
  formatRallyCountdown,
  shouldSkipSpectacle,
} from './draft-logic.js';

// Scene-local color decisions — same palette anchors as the lobby /
// character-select so the menu flow reads as one continuous place.
const SUBTITLE_COLOR = Wasteland.COVER_FILL; // weathered tan
const COLUMN_HEADER_COLOR = Wasteland.COVER_FILL;
const STATUS_ACTIVE_COLOR = Wasteland.HEALTH_GOOD; // mint — "you act now"
const STATUS_WAIT_COLOR = Wasteland.COVER_FILL;
const BADGE_COLOR = Wasteland.HEALTH_GOOD;
const PICKED_BORDER_COLOR = Wasteland.HEALTH_GOOD;
const TIMER_COLOR = Wasteland.HEALTH_WARNING;
const TIMER_URGENT_COLOR = Wasteland.HIT_FLASH;
const SPECTACLE_ACTIVE_COLOR = Wasteland.LOADING_BAR_FILL; // hot orange
const SPECTACLE_IDLE_COLOR = Wasteland.COVER_FILL;
const SPECTACLE_VS_COLOR = Wasteland.WALL_FILL;
const WINNER_COLOR = Wasteland.HEALTH_GOOD;
const FOOTER_COLOR = Wasteland.COVER_FILL;

// Pick-UI layout on the 960×720 design canvas (FIT-scaled on mobile
// landscape). Card heights stay comfortably above the 44px tap minimum.
const CARD_WIDTH = 380;
const LEFT_COL_CENTER_X = 270;
const RIGHT_COL_CENTER_X = 690;
const COLUMN_HEADER_Y = 156;
const BADGE_Y = 176;
const CARDS_TOP_Y = 192;
const STATUS_Y = 635;
const TIMER_Y = 660;

// Spectacle beats inside DRAFT.SPECTACLE_MS (2600ms): hops stop by
// SPECTACLE_MS - LAND_HOLD_MS, the "<NICK> PICKS FIRST" beat lands
// shortly after the final hop, and the columns reveal at SPECTACLE_MS.
const LAND_HOLD_MS = 700;
const LAND_TEXT_DELAY_MS = 250;

interface DraftSceneData {
  nickname?: string;
}

interface DraftCard {
  category: DraftCategory;
  value: string;
  baseLabel: string;
  button: PixelButton;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Pre-match map/mode draft, between lobby/results and character select.
 * Opens on the first server:draftState (LobbyScene and ResultsScene route
 * here); leaves on server:matchFound (final map+mode — payload identical
 * to the FORCE/no-draft path, so CharacterSelectScene needs no changes).
 * All pick state is a projection of the latest draftState snapshot via
 * the pure deriveDraftView — the server echoes accepted picks per tick.
 */
export class DraftScene extends Phaser.Scene {
  private gameService!: GameService;
  private nickname = '';

  private phase: 'waiting' | 'spectacle' | 'pick' = 'waiting';
  private latestDraft: ServerDraftStateMessage | null = null;
  /**
   * Which category the FIRST pick claimed — cached from the one snapshot
   * window where it's derivable (exactly one pick in), then fed back into
   * deriveDraftView so completed drafts keep correct badge attribution.
   */
  private firstPicked: DraftCategory | null = null;
  private transitioned = false;

  // Spectacle widgets, destroyed wholesale when the columns reveal.
  private spectacleObjects: Phaser.GameObjects.GameObject[] = [];
  private spectacleNickTexts: Phaser.GameObjects.Text[] = [];

  // Pick-phase widgets (built once, projected per snapshot).
  private cards: DraftCard[] = [];
  private pickHighlight: Phaser.GameObjects.Graphics | null = null;
  private mapBadgeText: Phaser.GameObjects.Text | null = null;
  private modeBadgeText: Phaser.GameObjects.Text | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;
  private timerText: Phaser.GameObjects.Text | null = null;
  private menuGamepad: MenuGamepadInput | null = null;
  private backButton!: PixelButton;
  private gamepadFocusActive = false;
  private gamepadFocusedCard: DraftCard | null = null;

  /**
   * Local-clock anchor for the pick countdown — re-anchored from
   * pickDeadlineMs on every snapshot, ticked down locally between them
   * (same contract as the match clock in NetworkManager).
   */
  private deadlineAtLocalMs: number | null = null;
  private countdownEvent: Phaser.Time.TimerEvent | null = null;

  // Event handler references for cleanup
  private onDraftState: ((msg: ServerDraftStateMessage) => void) | null = null;
  private onMatchFound: ((matchData: MatchData) => void) | null = null;
  private onOpponentDisconnected: ((playerId: PlayerId) => void) | null = null;
  private onDisconnected: (() => void) | null = null;

  constructor() {
    super({ key: 'DraftScene' });
  }

  init(data: DraftSceneData): void {
    this.nickname = data.nickname ?? 'Player';
    this.phase = 'waiting';
    this.latestDraft = null;
    this.firstPicked = null;
    this.transitioned = false;
    this.spectacleObjects = [];
    this.spectacleNickTexts = [];
    this.cards = [];
    this.pickHighlight = null;
    this.mapBadgeText = null;
    this.modeBadgeText = null;
    this.statusText = null;
    this.timerText = null;
    this.menuGamepad = null;
    this.gamepadFocusActive = false;
    this.gamepadFocusedCard = null;
    this.deadlineAtLocalMs = null;
    this.countdownEvent = null;
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.gameService = GameService.getInstance();
    this.menuGamepad = new MenuGamepadInput();

    new WastelandStreet(this, { lowDetail: this.isLikelyMobile() });

    this.backButton = new PixelButton(this, 24, 24, 150, 30, 'BACK TO LOBBY', {
      variant: 'secondary',
      fontSize: 7,
      hitPaddingY: 10,
      onClick: () => this.leavePreFight(),
    });
    this.backButton.setDepth(WastelandStreet.DEPTH.UI + 2);
    this.input.keyboard?.on('keydown-ESC', () => this.leavePreFight());
    this.input.keyboard?.on('keydown-BACKSPACE', () => this.leavePreFight());

    this.wireGameServiceEvents();

    // GameService caches the snapshot that routed us here, so the flow
    // almost always starts synchronously. The waiting branch only covers
    // a pathological create-without-cache; the first draftState event
    // kicks the flow off then.
    const cached = this.gameService.getDraftState();
    if (cached) {
      this.acceptSnapshot(cached);
      this.beginFlow();
    }
  }

  shutdown(): void {
    this.cleanupEvents();
    this.menuGamepad = null;
    if (this.countdownEvent) {
      this.countdownEvent.remove();
      this.countdownEvent = null;
    }
  }

  update(): void {
    const actions = this.menuGamepad?.poll();
    if (!actions?.hasAction) return;
    if (actions.back) {
      this.leavePreFight();
      return;
    }
    if (this.phase !== 'pick' || this.transitioned) return;
    this.gamepadFocusActive = true;

    const enabled = this.enabledGamepadCards();
    if (enabled.length === 0) {
      this.syncGamepadCardFocus([]);
      return;
    }
    if (!this.gamepadFocusedCard || !enabled.includes(this.gamepadFocusedCard)) {
      this.gamepadFocusedCard = enabled[0];
    }

    if (actions.left) this.moveGamepadCard(-1, 0, enabled);
    else if (actions.right) this.moveGamepadCard(1, 0, enabled);
    else if (actions.up) this.moveGamepadCard(0, -1, enabled);
    else if (actions.down) this.moveGamepadCard(0, 1, enabled);

    this.syncGamepadCardFocus(enabled);
    if (actions.confirm && this.gamepadFocusedCard) {
      this.gamepadFocusedCard.button.activate();
    }
  }

  // ──────────────────────────── Events ────────────────────────────

  private wireGameServiceEvents(): void {
    this.onDraftState = (msg: ServerDraftStateMessage) => {
      this.acceptSnapshot(msg);
      if (this.phase === 'waiting') {
        this.beginFlow();
      } else if (this.phase === 'pick') {
        this.renderFromSnapshot();
      }
      // During the spectacle, snapshots just accumulate — the pick UI
      // projects the latest one the moment it builds.
    };

    this.onMatchFound = (matchData: MatchData) => {
      // Both picks are in — hold a short locked-in beat showing the final
      // map+mode, then hand off to character select exactly like the
      // lobby does (fade + fallback timer for backgrounded tabs).
      if (this.transitioned) return;
      this.transitioned = true;

      let started = false;
      const goToSelect = (): void => {
        if (started) return;
        started = true;
        this.cleanupEvents();
        this.scene.start('CharacterSelectScene', {
          nickname: this.nickname,
          matchData,
        });
      };

      const beatMs = this.phase === 'pick' ? 900 : 0;
      if (this.phase === 'pick') this.renderLockedBeat(matchData);
      this.time.delayedCall(beatMs, () => {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', goToSelect);
        this.time.delayedCall(500, goToSelect);
      });
    };

    this.onOpponentDisconnected = (_playerId: PlayerId) => {
      this.bailToLobby();
    };

    this.onDisconnected = () => {
      this.bailToLobby();
    };

    this.gameService.on('draftState', this.onDraftState);
    this.gameService.on('matchFound', this.onMatchFound);
    this.gameService.on('opponentDisconnected', this.onOpponentDisconnected);
    this.gameService.on('reconnecting', this.onDisconnected);
    this.gameService.on('disconnected', this.onDisconnected);
  }

  private cleanupEvents(): void {
    if (this.onDraftState) {
      this.gameService.off('draftState', this.onDraftState);
      this.onDraftState = null;
    }
    if (this.onMatchFound) {
      this.gameService.off('matchFound', this.onMatchFound);
      this.onMatchFound = null;
    }
    if (this.onOpponentDisconnected) {
      this.gameService.off('opponentDisconnected', this.onOpponentDisconnected);
      this.onOpponentDisconnected = null;
    }
    if (this.onDisconnected) {
      this.gameService.off('reconnecting', this.onDisconnected);
      this.gameService.off('disconnected', this.onDisconnected);
      this.onDisconnected = null;
    }
  }

  private bailToLobby(): void {
    if (this.transitioned) return;
    this.transitioned = true;
    let started = false;
    const go = (): void => {
      if (started) return;
      started = true;
      this.cleanupEvents();
      this.scene.start('LobbyScene');
    };
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', go);
    this.time.delayedCall(500, go);
  }

  private leavePreFight(): void {
    if (this.transitioned) return;
    this.gameService.returnToLobby();
    this.bailToLobby();
  }

  private acceptSnapshot(msg: ServerDraftStateMessage): void {
    this.latestDraft = msg;
    if (this.firstPicked === null) {
      this.firstPicked = firstPickedCategory(msg);
    }
  }

  // ──────────────────────────── Spectacle ────────────────────────────

  private beginFlow(): void {
    const draft = this.latestDraft;
    if (!draft) return;
    // Late arrival (a pick already recorded) or a degenerate roster skips
    // straight to the columns — replaying the theater would eat into the
    // real pick window.
    if (shouldSkipSpectacle(draft) || draft.players.length < 2) {
      this.buildPickUi();
    } else if (draft.firstPickerReason === 'revenge') {
      this.startRevengeReveal(draft);
    } else {
      this.startSpectacle(draft);
    }
  }

  /**
   * Rematches replace the random ping-pong with a shorter, explicit
   * comeback beat: the previous round's loser has earned first pick.
   */
  private startRevengeReveal(draft: ServerDraftStateMessage): void {
    this.phase = 'spectacle';
    const centerX = this.cameras.main.width / 2;
    const picker = draft.players.find((player) => player.id === draft.firstPickerId);

    const headline = new TitleLogo(this, centerX, 180, ['REVENGE DRAFT'], {
      fontSize: 24,
      fillColor: Wasteland.LOADING_BAR_FILL,
      strokeThickness: 3,
    }).setDepth(WastelandStreet.DEPTH.UI);
    const kicker = this.add
      .text(centerX, 270, "LAST ROUND'S LOSER STRIKES BACK", {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '16px',
        color: cssHex(SUBTITLE_COLOR),
      })
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);
    const pickerText = this.add
      .text(centerX, 350, (picker?.nickname ?? 'CHALLENGER').toUpperCase(), {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '22px',
        color: cssHex(SPECTACLE_ACTIVE_COLOR),
      })
      .setOrigin(0.5)
      .setScale(0.8)
      .setDepth(WastelandStreet.DEPTH.UI);
    const landingText = this.add
      .text(centerX, 410, 'PICKS FIRST', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '14px',
        color: cssHex(WINNER_COLOR),
      })
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    this.spectacleNickTexts = [pickerText];
    this.spectacleObjects = [headline, kicker, pickerText, landingText];
    AudioManager.getInstance()?.play('matchStartHorn');
    this.tweens.add({
      targets: pickerText,
      scale: 1.2,
      duration: 450,
      ease: 'Back.easeOut',
    });

    this.time.delayedCall(DRAFT.REVENGE_REVEAL_MS, () => {
      if (this.transitioned || this.phase !== 'spectacle') return;
      this.destroySpectacle();
      this.buildPickUi();
    });
  }

  private startSpectacle(draft: ServerDraftStateMessage): void {
    this.phase = 'spectacle';
    const centerX = this.cameras.main.width / 2;

    const roleIds = [draft.firstPickerId, draft.secondPickerId].filter(
      (id): id is PlayerId => id !== undefined,
    );
    const contenders = roleIds
      .map((id) => draft.players.find((player) => player.id === id))
      .filter(
        (player): player is ServerDraftStateMessage['players'][number] => player !== undefined,
      );
    const winnerIndex = Math.max(
      0,
      contenders.findIndex((player) => player.id === draft.firstPickerId),
    );

    const headline = new TitleLogo(this, centerX, 180, ['WHO PICKS FIRST?'], {
      fontSize: 22,
      strokeThickness: 3,
    }).setDepth(WastelandStreet.DEPTH.UI);

    const nickTexts = contenders.map((player, i) =>
      this.add
        .text(centerX + (i === 0 ? -190 : 190), 330, player.nickname.toUpperCase(), {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: '14px',
          color: cssHex(SPECTACLE_IDLE_COLOR),
        })
        .setOrigin(0.5)
        .setDepth(WastelandStreet.DEPTH.UI),
    );

    const vsText = this.add
      .text(centerX, 330, 'VS', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '18px',
        color: cssHex(SPECTACLE_VS_COLOR),
      })
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    const landingText = this.add
      .text(centerX, 420, '', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '14px',
        color: cssHex(WINNER_COLOR),
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(WastelandStreet.DEPTH.UI);

    this.spectacleNickTexts = nickTexts;
    this.spectacleObjects = [headline, ...nickTexts, vsText, landingText];
    this.setSpectacleHighlight(0);

    // The outcome is already in the snapshot — the decelerating ping-pong
    // is pure theater, rigged (parity) to land on the server-rolled winner.
    const schedule = buildHopSchedule(winnerIndex, {
      budgetMs: DRAFT.SPECTACLE_MS - LAND_HOLD_MS,
    });
    for (const hop of schedule.hops) {
      this.time.delayedCall(hop.atMs, () => {
        if (this.transitioned || this.phase !== 'spectacle') return;
        this.setSpectacleHighlight(hop.index);
        AudioManager.getInstance()?.play('menuSelect', { volume: 0.2 });
      });
    }

    this.time.delayedCall(schedule.landMs + LAND_TEXT_DELAY_MS, () => {
      if (this.transitioned || this.phase !== 'spectacle') return;
      const winnerNick = (contenders[winnerIndex]?.nickname ?? 'FIRST PICKER').toUpperCase();
      landingText.setText(`${winnerNick} PICKS FIRST`).setVisible(true);
      AudioManager.getInstance()?.play('matchStartHorn');
      this.tweens.add({
        targets: nickTexts[winnerIndex],
        scale: { from: 1.15, to: 1.35 },
        duration: 150,
        yoyo: true,
        repeat: 1,
      });
    });

    this.time.delayedCall(DRAFT.SPECTACLE_MS, () => {
      if (this.transitioned || this.phase !== 'spectacle') return;
      this.destroySpectacle();
      this.buildPickUi();
    });
  }

  private setSpectacleHighlight(index: number): void {
    this.spectacleNickTexts.forEach((text, i) => {
      const active = i === index;
      text.setColor(cssHex(active ? SPECTACLE_ACTIVE_COLOR : SPECTACLE_IDLE_COLOR));
      text.setScale(active ? 1.15 : 1);
    });
  }

  private destroySpectacle(): void {
    for (const obj of this.spectacleObjects) obj.destroy();
    this.spectacleObjects = [];
    this.spectacleNickTexts = [];
  }

  // ──────────────────────────── Pick UI ────────────────────────────

  private buildPickUi(): void {
    const draft = this.latestDraft;
    if (!draft || this.phase === 'pick') return;
    this.phase = 'pick';

    const centerX = this.cameras.main.width / 2;
    const camHeight = this.cameras.main.height;
    const isRally = draft.draftKind === 'rally';

    new TitleLogo(this, centerX, 64, [isRally ? 'RUMBLE DRAFT RALLY' : 'PRE-MATCH DRAFT'], {
      fontSize: 20,
      strokeThickness: 3,
    }).setDepth(WastelandStreet.DEPTH.UI);

    const subtitle = isRally
      ? 'EVERY FIGHTER VOTES - MAP FIRST, THEN MODE'
      : draft.firstPickerReason === 'revenge'
        ? 'REVENGE PICK CLAIMS A COLUMN'
        : 'FIRST PICK CLAIMS A COLUMN';
    this.add
      .text(centerX, 108, subtitle, {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '14px',
        color: cssHex(SUBTITLE_COLOR),
      })
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    for (const [label, colX] of [
      ['MAP', LEFT_COL_CENTER_X],
      ['MODE', RIGHT_COL_CENTER_X],
    ] as const) {
      this.add
        .text(colX, COLUMN_HEADER_Y, label, {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: '13px',
          color: cssHex(COLUMN_HEADER_COLOR),
        })
        .setOrigin(0.5)
        .setDepth(WastelandStreet.DEPTH.UI);
    }

    this.mapBadgeText = this.createBadgeText(LEFT_COL_CENTER_X);
    this.modeBadgeText = this.createBadgeText(RIGHT_COL_CENTER_X);

    // Row metrics adapt to option count so a grown registry still fits;
    // today both columns hold 3 cards (64px tall — well over the 44px
    // tap-target minimum).
    const rowCount = Math.max(draft.mapOptions.length, draft.modeOptions.length);
    const compact = rowCount > 4;
    const cardH = compact ? 48 : 64;
    const gap = compact ? 5 : 14;

    draft.mapOptions.forEach((mapName, i) => {
      this.addCard(
        'map',
        mapName,
        mapName.toUpperCase(),
        LEFT_COL_CENTER_X,
        CARDS_TOP_Y + i * (cardH + gap),
        cardH,
        arenaMasteryDraftSubtitle(draft.players, this.gameService.getPlayerId(), mapName),
      );
    });
    draft.modeOptions.forEach((mode, i) => {
      this.addCard(
        'mode',
        mode,
        gameModeDisplayName(mode),
        RIGHT_COL_CENTER_X,
        CARDS_TOP_Y + i * (cardH + gap),
        cardH,
      );
    });

    this.pickHighlight = this.add.graphics().setDepth(WastelandStreet.DEPTH.UI + 1);

    this.statusText = this.add
      .text(centerX, STATUS_Y, '', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '16px',
        color: cssHex(STATUS_WAIT_COLOR),
      })
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    this.timerText = this.add
      .text(
        centerX,
        TIMER_Y,
        isRally
          ? formatRallyCountdown(draft.pickDeadlineMs)
          : formatDraftCountdown(draft.pickDeadlineMs),
        {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: '11px',
          color: cssHex(TIMER_COLOR),
        },
      )
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    this.add
      .text(
        centerX,
        camHeight - 34,
        isRally
          ? 'EVERY FIGHTER GETS ONE VOTE  •  TIES BREAK RANDOMLY'
          : 'TAP A CARD OR USE D-PAD + A  •  OTHER COLUMN GOES TO YOUR RIVAL',
        {
          fontFamily: MENU_FONTS.BODY,
          fontSize: '12px',
          color: cssHex(FOOTER_COLOR),
        },
      )
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    // Tick the countdown locally between snapshots (each snapshot
    // re-anchors deadlineAtLocalMs, so drift can't accumulate).
    this.countdownEvent = this.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => this.updateCountdownLabel(),
    });

    this.renderFromSnapshot();
  }

  private createBadgeText(colX: number): Phaser.GameObjects.Text {
    return this.add
      .text(colX, BADGE_Y, '', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '9px',
        color: cssHex(BADGE_COLOR),
      })
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);
  }

  private addCard(
    category: DraftCategory,
    value: string,
    label: string,
    colCenterX: number,
    y: number,
    cardH: number,
    subtitle?: string | null,
  ): void {
    const x = colCenterX - CARD_WIDTH / 2;
    const button = new PixelButton(this, x, y, CARD_WIDTH, cardH, label, {
      variant: 'secondary',
      fontSize: subtitle ? 10 : 12,
      subtitle: subtitle ?? undefined,
      subtitleFontSize: 7,
      disabled: true,
      onClick: () => this.onCardClick(category, value),
    });
    button.setDepth(WastelandStreet.DEPTH.UI);
    this.cards.push({ category, value, baseLabel: label, button, x, y, w: CARD_WIDTH, h: cardH });
  }

  private onCardClick(category: DraftCategory, value: string): void {
    const draft = this.latestDraft;
    if (this.transitioned || !draft) return;
    const view = deriveDraftView(draft, this.gameService.getPlayerId(), this.firstPicked);
    if (!view.enabledCategories.includes(category)) return;

    this.gameService.sendDraftPick(category, value);
    // Optimistic feedback only — the server is authoritative and the next
    // snapshot (≤1 tick) echoes the accepted pick and restyles everything.
    const card = this.cards.find((c) => c.category === category && c.value === value);
    card?.button.setAlpha(0.7);
  }

  /** Project the latest snapshot onto the pick UI. */
  private renderFromSnapshot(): void {
    const draft = this.latestDraft;
    if (!draft || this.phase !== 'pick' || this.transitioned) return;

    const view = deriveDraftView(draft, this.gameService.getPlayerId(), this.firstPicked);

    this.statusText
      ?.setText(view.statusLine)
      .setColor(cssHex(view.yourTurn || view.complete ? STATUS_ACTIVE_COLOR : STATUS_WAIT_COLOR));
    this.mapBadgeText?.setText(view.mapBadge ?? '');
    this.modeBadgeText?.setText(view.modeBadge ?? '');

    this.pickHighlight?.clear();
    for (const card of this.cards) {
      const pickedValue = card.category === 'map' ? draft.mapPick : draft.modePick;
      const isPicked = pickedValue !== null && pickedValue === card.value;
      const enabled = view.enabledCategories.includes(card.category);
      const isLocalVote = view.isRally && view.localVote === card.value;
      const voteCount = view.voteCounts[card.value] ?? 0;
      card.button.setLabel(
        view.isRally && draft.rallyCategory === card.category && voteCount > 0
          ? `${card.baseLabel} · ${voteCount}`
          : card.baseLabel,
      );
      card.button.setDisabled(!enabled);
      // Alpha managed here, not by setDisabled: the picked card stays
      // full-bright while its column's losers dim harder than the mere
      // not-your-turn dim.
      card.button.setAlpha(
        isPicked || enabled || isLocalVote ? 1 : pickedValue !== null ? 0.35 : 0.55,
      );
      if (isPicked) this.drawCardHighlight(card);
      else if (isLocalVote) {
        this.drawCardHighlight(card, SPECTACLE_ACTIVE_COLOR);
      }
    }

    this.deadlineAtLocalMs = view.complete ? null : performance.now() + draft.pickDeadlineMs;
    this.timerText?.setVisible(!view.complete);
    this.updateCountdownLabel();
    this.syncGamepadCardFocus(this.enabledGamepadCards());
  }

  private enabledGamepadCards(): DraftCard[] {
    const draft = this.latestDraft;
    if (!draft || this.phase !== 'pick') return [];
    const view = deriveDraftView(draft, this.gameService.getPlayerId(), this.firstPicked);
    return this.cards.filter((card) => view.enabledCategories.includes(card.category));
  }

  private syncGamepadCardFocus(enabled: DraftCard[]): void {
    if (this.gamepadFocusedCard && !enabled.includes(this.gamepadFocusedCard)) {
      this.gamepadFocusedCard = enabled[0] ?? null;
    }
    for (const card of this.cards) {
      card.button.setFocused(this.gamepadFocusActive && card === this.gamepadFocusedCard);
    }
  }

  private moveGamepadCard(
    directionX: -1 | 0 | 1,
    directionY: -1 | 0 | 1,
    enabled: DraftCard[],
  ): void {
    const current = this.gamepadFocusedCard;
    if (!current) return;
    const centerX = current.x + current.w / 2;
    const centerY = current.y + current.h / 2;
    const candidates = enabled
      .filter((card) => card !== current)
      .map((card) => {
        const dx = card.x + card.w / 2 - centerX;
        const dy = card.y + card.h / 2 - centerY;
        const forward = dx * directionX + dy * directionY;
        const sideways = Math.abs(dx * directionY - dy * directionX);
        return { card, forward, score: forward + sideways * 0.35 };
      })
      .filter((candidate) => candidate.forward > 1)
      .sort((a, b) => a.score - b.score);
    this.gamepadFocusedCard = candidates[0]?.card ?? current;
  }

  /**
   * The ~900ms beat between matchFound and the character-select handoff:
   * both final picks highlighted, driven from the matchFound payload (the
   * final both-picks draftState may have been lost — message delivery is
   * loss-tolerant only while the draft is still broadcasting).
   */
  private renderLockedBeat(matchData: MatchData): void {
    const modeName = gameModeDisplayName(matchData.gameMode);
    this.statusText
      ?.setText(`NEXT: ${modeName} - ${matchData.mapName.toUpperCase()}`)
      .setColor(cssHex(STATUS_ACTIVE_COLOR));
    this.timerText?.setVisible(false);

    this.pickHighlight?.clear();
    for (const card of this.cards) {
      const finalValue = card.category === 'map' ? matchData.mapName : matchData.gameMode;
      const isFinal = card.value === finalValue;
      card.button.setLabel(card.baseLabel);
      card.button.setDisabled(true);
      card.button.setAlpha(isFinal ? 1 : 0.35);
      if (isFinal) this.drawCardHighlight(card);
    }
  }

  private drawCardHighlight(card: DraftCard, color: number = PICKED_BORDER_COLOR): void {
    if (!this.pickHighlight) return;
    this.pickHighlight.lineStyle(3, color, 1);
    this.pickHighlight.strokeRect(card.x - 4, card.y - 4, card.w + 8, card.h + 8);
  }

  private updateCountdownLabel(): void {
    if (!this.timerText || this.deadlineAtLocalMs === null) return;
    const remainingMs = this.deadlineAtLocalMs - performance.now();
    this.timerText.setText(
      this.latestDraft?.draftKind === 'rally'
        ? formatRallyCountdown(remainingMs)
        : formatDraftCountdown(remainingMs),
    );
    this.timerText.setColor(
      cssHex(Math.ceil(remainingMs / 1000) <= 5 ? TIMER_URGENT_COLOR : TIMER_COLOR),
    );
  }

  private isLikelyMobile(): boolean {
    return 'ontouchstart' in window && Math.min(window.innerWidth, window.innerHeight) < 600;
  }
}
