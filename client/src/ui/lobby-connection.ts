import { Wasteland } from '@shared/config/palette.js';
import type { ConnectionState } from '../network/types.js';

export interface LobbyConnectionPresentation {
  label: string;
  color: number;
  playEnabled: boolean;
  retryVisible: boolean;
}

/** Pure lobby projection of the transport state; scenes own no retry policy. */
export function lobbyConnectionPresentation(state: ConnectionState): LobbyConnectionPresentation {
  switch (state) {
    case 'connected':
      return {
        label: 'SIGNAL ONLINE',
        color: Wasteland.HEALTH_GOOD,
        playEnabled: true,
        retryVisible: false,
      };
    case 'connecting':
      return {
        label: 'LINKING TO OUTPOST...',
        color: Wasteland.HEALTH_WARNING,
        playEnabled: false,
        retryVisible: false,
      };
    case 'reconnecting':
      return {
        label: 'SIGNAL LOST // AUTO-RETRYING',
        color: Wasteland.LOADING_BAR_FILL,
        playEnabled: false,
        retryVisible: true,
      };
    case 'disconnected':
      return {
        label: 'OUTPOST OFFLINE // RETRY',
        color: Wasteland.HIT_FLASH,
        playEnabled: false,
        retryVisible: true,
      };
  }
}
