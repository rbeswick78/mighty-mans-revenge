import { PlayerId } from './common.js';

export interface LobbyPlayer {
  id: PlayerId;
  nickname: string;
  status: 'idle' | 'searching' | 'matched' | 'in_game';
}

export enum MatchmakingStatus {
  IDLE = 'idle',
  SEARCHING = 'searching',
  MATCHED = 'matched',
}
