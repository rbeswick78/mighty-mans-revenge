import type { ConnectionState } from '../../network/types.js';
import { lobbyConnectionPresentation } from '../lobby-connection.js';

export const REFORGED_SETTINGS_SECTIONS = Object.freeze([
  Object.freeze({ id: 'profile', label: 'CALLSIGN' }),
  Object.freeze({ id: 'audio', label: 'AUDIO' }),
  Object.freeze({ id: 'controls', label: 'CONTROLS' }),
  Object.freeze({ id: 'graphics', label: 'GRAPHICS' }),
  Object.freeze({ id: 'display', label: 'DISPLAY' }),
  Object.freeze({ id: 'signal', label: 'SIGNAL' }),
] as const);

export type ReforgedSettingsSectionId = (typeof REFORGED_SETTINGS_SECTIONS)[number]['id'];

export interface ReforgedSettingsRuntimeSnapshot {
  readonly callsign: string;
  readonly muted: boolean;
  readonly masterVolume: number;
  readonly sfxVolume: number;
  readonly musicVolume: number;
  readonly fullscreenActive: boolean;
  readonly connectionState: ConnectionState;
}

export interface ReforgedSettingsSectionPresentation {
  readonly heading: string;
  readonly authority: string;
  readonly columns: readonly [readonly string[], readonly string[]];
}

function percentage(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function nextAudioVolumeStep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  if (clamped >= 1) return 0;
  return Math.min(1, Math.ceil((clamped * 100 + 1) / 25) * 0.25);
}

export function buildReforgedSettingsSection(
  sectionId: ReforgedSettingsSectionId,
  snapshot: ReforgedSettingsRuntimeSnapshot,
): ReforgedSettingsSectionPresentation {
  if (sectionId === 'profile') {
    return {
      heading:
        snapshot.callsign.length > 0
          ? `CALLSIGN / ${snapshot.callsign.toUpperCase()}`
          : 'CALLSIGN REQUIRED',
      authority: 'DEVICE LOCAL / NO ACCOUNT',
      columns: [
        ['2-16 CHARACTERS', 'LETTERS / NUMBERS / _ - .'],
        ['USED FOR SERVER-AUTHORED RECORD LOOKUPS', 'CHANGES APPLY TO FUTURE ENTRIES'],
      ],
    };
  }
  if (sectionId === 'audio') {
    return {
      heading: snapshot.muted ? 'AUDIO / MUTED' : 'AUDIO / ON',
      authority: 'EXISTING AUDIO MANAGER / DEVICE LOCAL',
      columns: [
        [
          `MASTER / ${percentage(snapshot.masterVolume)}`,
          `SFX / ${percentage(snapshot.sfxVolume)}`,
        ],
        [`MUSIC / ${percentage(snapshot.musicVolume)}`, 'F2 / AUDIO ON-OFF'],
      ],
    };
  }
  if (sectionId === 'controls') {
    return {
      heading: 'CONTROLS / AUTOMATIC DEVICE TAKEOVER',
      authority: 'READ ONLY / NO MODE TOGGLE',
      columns: [
        [
          'KEYBOARD + MOUSE',
          'WASD MOVE / HOLD + RELEASE LMB FIRE',
          'RMB GRENADE / SHIFT SPRINT / SPACE ABILITY',
          'R RELOAD / T BATTLE CRY',
        ],
        [
          'STANDARD GAMEPAD',
          'LEFT MOVE / RIGHT AIM / HOLD + RELEASE RT FIRE',
          'LT GRENADE / LB OR L3 SPRINT / RB ABILITY',
          'X RELOAD / Y BATTLE CRY / TOUCH USES DUAL STICKS',
        ],
      ],
    };
  }
  if (sectionId === 'graphics') {
    return {
      heading: 'GRAPHICS QUALITY / CURRENT',
      authority: 'READ ONLY / NO NEW QUALITY PREFERENCE',
      columns: [
        ['PIXEL ART / ON', 'ROUND PIXELS / ON', 'RESPONSIVE FIT / ON'],
        ['FULL CURRENT EFFECTS', 'FIXED GAMEPLAY PRESENTATION', 'QUALITY SEMANTICS UNCHANGED'],
      ],
    };
  }
  if (sectionId === 'display') {
    return {
      heading: snapshot.fullscreenActive
        ? 'DISPLAY / FULLSCREEN ACTIVE'
        : 'DISPLAY / FITTED WINDOW',
      authority: 'BEST EFFORT / BROWSER POLICY APPLIES',
      columns: [
        ['GAME CONTAINER TARGET', 'USER GESTURE REQUIRED'],
        ['DENIAL NEVER BLOCKS PLAY', 'ESC EXITS IN SUPPORTED BROWSERS'],
      ],
    };
  }
  const signal = lobbyConnectionPresentation(snapshot.connectionState);
  return {
    heading: `WASTELAND SIGNAL / ${signal.label}`,
    authority: 'AUTHORITATIVE TRANSPORT STATE',
    columns: [
      ['PLAY ENABLES ONLY WHEN ONLINE', 'RETRY USES THE EXISTING TRANSPORT ACTION'],
      ['5 SEC HANDSHAKE DEADLINE', 'AUTO BACKOFF / 1 2 4 8 16 SEC'],
    ],
  };
}
