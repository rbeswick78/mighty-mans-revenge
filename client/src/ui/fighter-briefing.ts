import { ABILITY, CHARACTERS, type CharacterId } from '@shared/config/game.js';

export interface FighterBriefing {
  headline: string;
  detail: string;
}

const FIGHTER_ABILITY_COPY = {
  mighty_man: {
    name: 'X-RAY VISION',
    rule: `WALL SHOTS ${ABILITY.MIGHTY_MAN_XRAY.DURATION}S // ${ABILITY.MIGHTY_MAN_XRAY.COOLDOWN}S COOLDOWN`,
  },
  bruce: {
    name: 'FIRE BREATH',
    rule: `WALL FIRE ${ABILITY.BRUCE_FIRE_BREATH.DURATION}S // ${ABILITY.BRUCE_FIRE_BREATH.COOLDOWN}S COOLDOWN`,
  },
  frost_wizard: {
    name: 'FROST LOCK',
    rule: `FREEZE ENEMY ${ABILITY.FROST_WIZARD_FREEZE.DURATION}S // ${ABILITY.FROST_WIZARD_FREEZE.COOLDOWN}S COOLDOWN`,
  },
  bubba: {
    name: 'IRON HIDE',
    rule: `HALF DAMAGE ${ABILITY.BUBBA_IRON_HIDE.DURATION}S // ${ABILITY.BUBBA_IRON_HIDE.COOLDOWN}S COOLDOWN`,
  },
  jack: {
    name: 'AXE THROW',
    rule: `${ABILITY.JACK_AXE_THROW.DAMAGE} DAMAGE AXE // ${ABILITY.JACK_AXE_THROW.COOLDOWN}S COOLDOWN`,
  },
  rook: {
    name: 'BREACH DASH',
    rule: `DASH ${ABILITY.ROOK_BREACH_DASH.DISTANCE_TILES} TILES, STOPS AT WALL // ${ABILITY.ROOK_BREACH_DASH.COOLDOWN}S COOLDOWN`,
  },
} as const satisfies Record<CharacterId, { name: string; rule: string }>;

/** Large selected-fighter copy; card grids only need identity at a glance. */
export function fighterBriefing(id: CharacterId): FighterBriefing {
  const fighter = CHARACTERS[id];
  const ability = FIGHTER_ABILITY_COPY[id];
  return {
    headline: `${fighter.displayName.toUpperCase()}  //  ${ability.name}`,
    detail: `${fighter.maxHealth} HP  //  SPEED ${fighter.speedMultiplier.toFixed(2)}X  //  ${ability.rule}`,
  };
}
