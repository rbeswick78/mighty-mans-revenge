export const MODERN_UI_ATLAS_ID = 'modern-ui.core';
export const MODERN_UI_TEXTURE_KEY = 'reforged-modern-ui';
export const MODERN_UI_IMPORT_CACHE_KEY = 'reforged-modern-ui-import';
export const MODERN_UI_ATLAS_IMAGE = 'assets/reforged/modern-ui/modern-ui.core.png';
export const MODERN_UI_ATLAS_IMPORT = 'assets/reforged/modern-ui/modern-ui.core.json';
export const MODERN_UI_MIN_TOUCH_TARGET = 48;

export type ModernUiQuality = 'full' | 'reduced';
export type ModernUiControlState = 'idle' | 'focus' | 'selected' | 'pressed' | 'disabled';
export type ModernUiButtonVariant = 'primary' | 'secondary' | 'danger';
export type ModernUiPanelRole = 'panel' | 'hud' | 'results' | 'tactical';
export type ModernUiIcon =
  | 'play'
  | 'fighters'
  | 'challenges'
  | 'records'
  | 'settings'
  | 'party'
  | 'queue'
  | 'minimap'
  | 'hud'
  | 'results'
  | 'health'
  | 'armor'
  | 'ammo'
  | 'objective'
  | 'focus'
  | 'warning';

const chromeFrame = (index: number): string => `ui.chrome.states/${String(index).padStart(3, '0')}`;
const iconFrame = (index: number): string => `ui.icon.language/${String(index).padStart(3, '0')}`;

const PANEL_FRAMES: Readonly<Record<ModernUiPanelRole, string>> = Object.freeze({
  panel: chromeFrame(0),
  hud: chromeFrame(1),
  results: chromeFrame(2),
  tactical: chromeFrame(3),
});

const TAB_FRAMES: Readonly<Record<ModernUiControlState, string>> = Object.freeze({
  idle: chromeFrame(4),
  focus: chromeFrame(5),
  selected: chromeFrame(6),
  pressed: chromeFrame(7),
  disabled: chromeFrame(8),
});

const CARD_FRAMES: Readonly<Record<ModernUiControlState, string>> = Object.freeze({
  idle: chromeFrame(9),
  focus: chromeFrame(10),
  selected: chromeFrame(11),
  pressed: chromeFrame(12),
  disabled: chromeFrame(13),
});

const BUTTON_START: Readonly<Record<ModernUiButtonVariant, number>> = Object.freeze({
  secondary: 14,
  primary: 18,
  danger: 22,
});

const BUTTON_STATE_OFFSET: Readonly<Record<Exclude<ModernUiControlState, 'selected'>, number>> =
  Object.freeze({ idle: 0, focus: 1, pressed: 2, disabled: 3 });

const ICON_FRAMES: Readonly<Record<ModernUiIcon, string>> = Object.freeze({
  play: iconFrame(0),
  fighters: iconFrame(1),
  challenges: iconFrame(2),
  records: iconFrame(3),
  settings: iconFrame(4),
  party: iconFrame(5),
  queue: iconFrame(6),
  minimap: iconFrame(7),
  hud: iconFrame(8),
  results: iconFrame(9),
  health: iconFrame(10),
  armor: iconFrame(11),
  ammo: iconFrame(12),
  objective: iconFrame(13),
  focus: iconFrame(14),
  warning: iconFrame(15),
});

export interface ModernUiImportFrame {
  readonly assetId: string;
  readonly frameIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotated: false;
  readonly trimmed: false;
}

export interface ModernUiImportMetadata {
  readonly schemaVersion: 1;
  readonly atlas: {
    readonly id: typeof MODERN_UI_ATLAS_ID;
    readonly image: 'modern-ui.core.png';
    readonly width: number;
    readonly height: number;
    readonly format: 'RGBA8888';
    readonly padding: number;
    readonly extrude: number;
    readonly premultipliedAlpha: false;
  };
  readonly frames: Readonly<Record<string, ModernUiImportFrame>>;
  readonly integrity: { readonly textureSha256: string };
}

export function modernUiPanelFrame(role: ModernUiPanelRole): string {
  return PANEL_FRAMES[role];
}

export function modernUiTabFrame(state: ModernUiControlState): string {
  return TAB_FRAMES[state];
}

export function modernUiCardFrame(state: ModernUiControlState): string {
  return CARD_FRAMES[state];
}

export function modernUiButtonFrame(
  variant: ModernUiButtonVariant,
  state: Exclude<ModernUiControlState, 'selected'>,
): string {
  return chromeFrame(BUTTON_START[variant] + BUTTON_STATE_OFFSET[state]);
}

export function modernUiIconFrame(icon: ModernUiIcon): string {
  return ICON_FRAMES[icon];
}

export function modernUiTreatment(quality: ModernUiQuality): Readonly<{
  focusStroke: true;
  icons: true;
  bloom: false;
  secondaryParticles: false;
  quality: ModernUiQuality;
}> {
  return Object.freeze({
    focusStroke: true,
    icons: true,
    bloom: false,
    secondaryParticles: false,
    quality,
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

export function normalizeModernUiImportMetadata(value: unknown): ModernUiImportMetadata | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const atlas = value.atlas;
  const frames = value.frames;
  const integrity = value.integrity;
  if (!isRecord(atlas) || !isRecord(frames) || !isRecord(integrity)) return null;
  if (
    atlas.id !== MODERN_UI_ATLAS_ID ||
    atlas.image !== 'modern-ui.core.png' ||
    atlas.format !== 'RGBA8888' ||
    atlas.premultipliedAlpha !== false ||
    !positiveInteger(atlas.width) ||
    !positiveInteger(atlas.height) ||
    !positiveInteger(atlas.padding) ||
    !positiveInteger(atlas.extrude) ||
    typeof integrity.textureSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(integrity.textureSha256)
  ) {
    return null;
  }

  const requiredFrames = [
    ...Object.values(PANEL_FRAMES),
    ...Object.values(TAB_FRAMES),
    ...Object.values(CARD_FRAMES),
    ...Object.values(ICON_FRAMES),
    ...(['primary', 'secondary', 'danger'] as const).flatMap((variant) =>
      (['idle', 'focus', 'pressed', 'disabled'] as const).map((state) =>
        modernUiButtonFrame(variant, state),
      ),
    ),
  ];
  for (const name of requiredFrames) {
    const frame = frames[name];
    if (
      !isRecord(frame) ||
      typeof frame.assetId !== 'string' ||
      !Number.isInteger(frame.frameIndex) ||
      typeof frame.x !== 'number' ||
      !Number.isInteger(frame.x) ||
      typeof frame.y !== 'number' ||
      !Number.isInteger(frame.y) ||
      !positiveInteger(frame.width) ||
      !positiveInteger(frame.height) ||
      frame.rotated !== false ||
      frame.trimmed !== false ||
      frame.x + frame.width > atlas.width ||
      frame.y + frame.height > atlas.height
    ) {
      return null;
    }
  }
  return value as unknown as ModernUiImportMetadata;
}

export function contrastRatio(foreground: number, background: number): number {
  const luminance = (color: number): number => {
    const channel = (shift: number): number => {
      const value = ((color >> shift) & 0xff) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return channel(16) * 0.2126 + channel(8) * 0.7152 + channel(0) * 0.0722;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
