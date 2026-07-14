import Phaser from 'phaser';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { MenuGamepadInput } from '../input/menu-gamepad.js';
import {
  GAUNTLET_BUILD_CODEX_STORAGE_KEY,
  GAUNTLET_BUILD_IDS,
  gauntletBuildCodexCombinedBest,
  gauntletBuildCodexEntries,
  normalizeGauntletBuildCodex,
  type GauntletBuildCodexEntry,
} from '../ui/gauntlet-build-codex.js';
import { MENU_FONTS } from '../ui/menu/fonts.js';
import { MenuPanel } from '../ui/menu/menu-panel.js';
import { PixelButton } from '../ui/menu/pixel-button.js';
import { TitleLogo } from '../ui/menu/title-logo.js';
import { WastelandStreet } from '../ui/menu/wasteland-street.js';

const CARD_WIDTH = 340;
const CARD_HEIGHT = 110;
const CARD_LEFT = 120;
const CARD_RIGHT = 500;
const CARD_TOP = 176;
const CARD_ROW_GAP = 12;

/** Device-local trophy board for the six complete Gauntlet boon builds. */
export class GauntletCodexScene extends Phaser.Scene {
  private backButton!: PixelButton;
  private menuGamepad: MenuGamepadInput | null = null;
  private returning = false;

  constructor() {
    super({ key: 'GauntletCodexScene' });
  }

  init(): void {
    this.menuGamepad = null;
    this.returning = false;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.menuGamepad = new MenuGamepadInput();
    new WastelandStreet(this, { lowDetail: this.isLikelyMobile() });

    const centerX = this.cameras.main.width / 2;
    new TitleLogo(this, centerX, 58, ['BUILD CODEX'], {
      fontSize: 24,
      strokeThickness: 3,
    }).setDepth(WastelandStreet.DEPTH.UI);

    this.add
      .text(centerX, 105, 'DISCOVER EVERY PAIR. MASTER EVERY CLEAR.', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '15px',
        color: cssHex(Wasteland.COVER_FILL),
      })
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    const codex = normalizeGauntletBuildCodex(
      localStorage.getItem(GAUNTLET_BUILD_CODEX_STORAGE_KEY),
    );
    const entries = gauntletBuildCodexEntries(codex);
    const combinedBest = gauntletBuildCodexCombinedBest(codex);
    this.add
      .text(
        centerX,
        138,
        `${codex.discovered.length}/${GAUNTLET_BUILD_IDS.length} BUILDS DISCOVERED  //  COMBINED BEST ${combinedBest.toLocaleString('en-US')}`,
        {
          fontFamily: MENU_FONTS.HEADER,
          fontSize: '9px',
          color: cssHex(Wasteland.HEALTH_GOOD),
        },
      )
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    entries.forEach((entry, index) => this.renderBuildCard(entry, index));

    this.backButton = new PixelButton(this, centerX - 90, 574, 180, 44, 'BACK TO LOBBY', {
      variant: 'secondary',
      fontSize: 9,
      onClick: () => this.returnToLobby(),
    }).setDepth(WastelandStreet.DEPTH.UI);

    this.add
      .text(centerX, 647, 'LOCKED NAMES REVEAL ON A FULL THREE-STAGE CLEAR', {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '12px',
        color: cssHex(Wasteland.COVER_FILL),
      })
      .setOrigin(0.5)
      .setDepth(WastelandStreet.DEPTH.UI);

    this.input.keyboard?.on('keydown-ESC', () => this.returnToLobby());
    this.input.keyboard?.on('keydown-BACKSPACE', () => this.returnToLobby());
  }

  shutdown(): void {
    this.menuGamepad = null;
  }

  update(): void {
    const actions = this.menuGamepad?.poll();
    if (!actions?.hasAction || this.returning) return;
    this.backButton.setFocused(true);
    if (actions.confirm || actions.back) this.backButton.activate();
  }

  private renderBuildCard(entry: GauntletBuildCodexEntry, index: number): void {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? CARD_LEFT : CARD_RIGHT;
    const y = CARD_TOP + row * (CARD_HEIGHT + CARD_ROW_GAP);
    const panel = new MenuPanel(this, x, y, CARD_WIDTH, CARD_HEIGHT, {
      fillAlpha: entry.discovered ? 0.94 : 0.92,
      strokeColor: entry.discovered ? Wasteland.HEALTH_GOOD : Wasteland.WALL_LINE,
      highlightColor: entry.discovered ? Wasteland.HEALTH_GOOD : Wasteland.WALL_FILL,
    }).setDepth(WastelandStreet.DEPTH.UI);

    const status = entry.discovered ? 'DISCOVERED' : 'LOCKED';
    const statusColor = entry.discovered ? Wasteland.HEALTH_GOOD : Wasteland.COVER_FILL;
    const indexLabel = String(index + 1).padStart(2, '0');
    const header = this.add
      .text(14, 12, `${indexLabel}  //  ${status}`, {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '7px',
        color: cssHex(statusColor),
      })
      .setOrigin(0, 0.5);
    panel.add(header);

    const name = this.add
      .text(panel.centerX, 33, entry.discovered ? entry.name : '???', {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '12px',
        color: cssHex(entry.discovered ? Wasteland.LOADING_BAR_FILL : Wasteland.COVER_FILL),
      })
      .setOrigin(0.5);
    panel.add(name);

    const recipe = this.add
      .text(panel.centerX, 57, entry.recipe, {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '7px',
        color: cssHex(Wasteland.COVER_FILL),
      })
      .setOrigin(0.5);
    panel.add(recipe);

    const detail = entry.discovered ? entry.description : 'CLEAR THIS PAIR TO DISCOVER';
    const detailText = this.add
      .text(panel.centerX, 78, detail, {
        fontFamily: MENU_FONTS.BODY,
        fontSize: '11px',
        color: cssHex(entry.discovered ? Wasteland.TEXT_PRIMARY : Wasteland.COVER_FILL),
      })
      .setOrigin(0.5);
    panel.add(detailText);

    const best =
      entry.bestScore === null
        ? 'BEST CLEAR --'
        : `BEST CLEAR ${entry.bestScore.toLocaleString('en-US')}`;
    const bestText = this.add
      .text(panel.centerX, 98, best, {
        fontFamily: MENU_FONTS.HEADER,
        fontSize: '7px',
        color: cssHex(entry.bestScore === null ? Wasteland.COVER_FILL : Wasteland.HEALTH_WARNING),
      })
      .setOrigin(0.5);
    panel.add(bestText);
  }

  private returnToLobby(): void {
    if (this.returning) return;
    this.returning = true;
    let started = false;
    const go = (): void => {
      if (started) return;
      started = true;
      this.scene.start('LobbyScene');
    };
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', go);
    this.time.delayedCall(450, go);
  }

  private isLikelyMobile(): boolean {
    return 'ontouchstart' in window && Math.min(window.innerWidth, window.innerHeight) < 600;
  }
}
