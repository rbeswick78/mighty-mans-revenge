/**
 * Procedural UI tokens for the Reforged menu foundation. Production art is
 * intentionally out of scope until the visual-system milestone; these values
 * keep layout, contrast, motion, and control sizing consistent in the meantime.
 */
export const ReforgedMenuTokens = Object.freeze({
  color: Object.freeze({
    canvas: 0x090d14,
    surface: 0x121a26,
    surfaceRaised: 0x1b2938,
    border: 0x32485d,
    borderStrong: 0x72d6c9,
    text: 0xf3f0df,
    textMuted: 0x9eafbd,
    accent: 0xff8a3d,
    accentActive: 0xffb15c,
    focus: 0x72d6c9,
  }),
  space: Object.freeze({
    safeEdge: 32,
    xs: 8,
    sm: 12,
    md: 20,
    lg: 32,
    xl: 48,
  }),
  type: Object.freeze({
    title: 30,
    tab: 15,
    section: 22,
    body: 16,
    eyebrow: 12,
  }),
  control: Object.freeze({
    tabHeight: 84,
    tabGap: 12,
    focusStroke: 4,
    borderStroke: 2,
  }),
  motion: Object.freeze({
    activationMs: 80,
    fadeMs: 180,
  }),
});
