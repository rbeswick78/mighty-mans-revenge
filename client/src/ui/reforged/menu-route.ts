import { normalizeServerCapabilities } from '@shared/config/server-capabilities.js';

export type MenuSceneKey = 'LobbyScene' | 'ReforgedShellScene';

/** Keep the established Lobby unless the normalized server snapshot opts in. */
export function menuSceneForCapabilities(advertised: unknown): MenuSceneKey {
  return normalizeServerCapabilities(advertised).newShell ? 'ReforgedShellScene' : 'LobbyScene';
}
