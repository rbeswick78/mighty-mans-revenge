// Single source of truth for menu typography. Press Start 2P provides the
// chunky arcade pixel logo feel; Silkscreen is the clean modern pixel font
// for body text. Both load as Google Fonts via <link> tags in index.html.
// The Courier fallback covers the brief window before web fonts resolve
// (BootScene also awaits document.fonts.ready before revealing LobbyScene).
export const MENU_FONTS = Object.freeze({
  LOGO: '"Press Start 2P", "Courier New", monospace',
  HEADER: '"Press Start 2P", "Courier New", monospace',
  BODY: '"Silkscreen", "Courier New", monospace',
  MONO_FALLBACK: '"Courier New", Courier, monospace',
});

// Font families that BootScene must wait for before kicking off LobbyScene.
// Listed at 16px because document.fonts.check requires a size; family-name
// match doesn't care about the actual px value.
export const MENU_FONT_CHECK_LIST: readonly string[] = Object.freeze([
  '16px "Press Start 2P"',
  '16px "Silkscreen"',
]);
