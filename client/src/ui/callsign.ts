export const CALLSIGN_STORAGE_KEY = 'mmr_nickname';

export interface CallsignStorageReader {
  getItem(key: string): string | null;
}

export interface CallsignStorageWriter extends CallsignStorageReader {
  setItem(key: string, value: string): void;
}

/** Preserve the established raw stored value until the player edits it. */
export function readCallsign(storage: CallsignStorageReader): string {
  return storage.getItem(CALLSIGN_STORAGE_KEY) ?? '';
}

/** Match the legacy Lobby input allowlist and 16-character cap exactly. */
export function sanitizeCallsignInput(value: string): string {
  return value.replace(/[^a-zA-Z0-9_\-.]/g, '').slice(0, 16);
}

export function persistCallsign(storage: CallsignStorageWriter, value: string): string {
  const callsign = sanitizeCallsignInput(value);
  storage.setItem(CALLSIGN_STORAGE_KEY, callsign);
  return callsign;
}

export function isCallsignReady(value: string): boolean {
  return value.length >= 2;
}
