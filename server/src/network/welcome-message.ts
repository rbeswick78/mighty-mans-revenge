import type { PlayerId, ServerCapabilities, ServerWelcomeMessage } from '@shared/game';

export function createWelcomeMessage(
  playerId: PlayerId,
  capabilities: Readonly<ServerCapabilities>,
): ServerWelcomeMessage {
  return {
    type: 'server:welcome',
    playerId,
    capabilities,
  };
}
