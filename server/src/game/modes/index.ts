import { GameModeType } from '@shared/game';
import type { GameMode } from './game-mode.js';
import { DeathmatchMode } from './deathmatch-mode.js';
import { KothMode } from './koth-mode.js';
import { GunGameMode } from './gun-game-mode.js';
import { LastStandMode } from './last-stand-mode.js';

export type { GameMode, MatchContext } from './game-mode.js';
export { DeathmatchMode } from './deathmatch-mode.js';
export { KothMode } from './koth-mode.js';
export { GunGameMode } from './gun-game-mode.js';
export { LastStandMode } from './last-stand-mode.js';

const GAME_MODE_REGISTRY: Record<GameModeType, () => GameMode> = {
  [GameModeType.DEATHMATCH]: () => new DeathmatchMode(),
  [GameModeType.KOTH]: () => new KothMode(),
  [GameModeType.GUN_GAME]: () => new GunGameMode(),
  [GameModeType.LAST_STAND]: () => new LastStandMode(),
};

/** Create a GameMode instance for the given type. */
export function getGameMode(type: GameModeType): GameMode {
  const factory = GAME_MODE_REGISTRY[type];
  if (!factory) {
    throw new Error(`Unknown game mode type: ${type}`);
  }
  return factory();
}
