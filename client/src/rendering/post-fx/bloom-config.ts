// Tunables for the camera Bloom FX. Bloom runs before the CRT post-pipeline
// (Phaser applies postFX, then postPipeline), so vignette/scanlines composite
// over the already-bloomed frame.

// Tint applied to the bloom contribution. White preserves the original
// brightness/hue of the source pixel.
export const BLOOM_COLOR = 0xffffff;

// Offsets the Gaussian sample kernel; 1.0 is Phaser's default. Halving
// this is the most direct way to tighten the halo without dimming the
// glow on bright pixels.
export const BLOOM_OFFSET_X = 0.6;
export const BLOOM_OFFSET_Y = 0.6;

// How wide the blur spreads. >1 = more halo, <1 = tighter.
export const BLOOM_BLUR_STRENGTH = 1.0;

// Overall bloom intensity (multiplier on the bloomed contribution).
export const BLOOM_STRENGTH = 0.7;

// Number of blur passes. 4 is Phaser's default; 2 is the mobile fallback if
// we ever hit a perf budget issue. Higher = smoother halo, more GPU cost.
export const BLOOM_STEPS = 4;
