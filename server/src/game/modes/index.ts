import { GameModeType } from '@shared/game';
import type { GameMode } from './game-mode.js';
import { DeathmatchMode } from './deathmatch-mode.js';
import { KothMode } from './koth-mode.js';
import { GunGameMode } from './gun-game-mode.js';
import { LastStandMode } from './last-stand-mode.js';
import { KillConfirmedMode } from './kill-confirmed-mode.js';
import { OneInTheChamberMode } from './one-in-the-chamber-mode.js';
import { CoreRunMode } from './core-run-mode.js';
import { BountyHuntMode } from './bounty-hunt-mode.js';

export type { GameMode, MatchContext } from './game-mode.js';
export { DeathmatchMode } from './deathmatch-mode.js';
export { KothMode } from './koth-mode.js';
export { GunGameMode } from './gun-game-mode.js';
export { LastStandMode } from './last-stand-mode.js';
export { KillConfirmedMode } from './kill-confirmed-mode.js';
export { OneInTheChamberMode } from './one-in-the-chamber-mode.js';
export { CoreRunMode } from './core-run-mode.js';
export { BountyHuntMode } from './bounty-hunt-mode.js';

const GAME_MODE_REGISTRY: Record<GameModeType, () => GameMode> = {
  [GameModeType.DEATHMATCH]: () => new DeathmatchMode(),
  [GameModeType.KOTH]: () => new KothMode(),
  [GameModeType.GUN_GAME]: () => new GunGameMode(),
  [GameModeType.LAST_STAND]: () => new LastStandMode(),
  [GameModeType.KILL_CONFIRMED]: () => new KillConfirmedMode(),
  [GameModeType.ONE_IN_THE_CHAMBER]: () => new OneInTheChamberMode(),
  [GameModeType.CORE_RUN]: () => new CoreRunMode(),
  [GameModeType.BOUNTY_HUNT]: () => new BountyHuntMode(),
};

/** Create a GameMode instance for the given type. */
export function getGameMode(type: GameModeType): GameMode {
  const factory = GAME_MODE_REGISTRY[type];
  if (!factory) {
    throw new Error(`Unknown game mode type: ${type}`);
  }
  return factory();
}
