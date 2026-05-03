import Phaser from 'phaser';

// Vignette: 0 darkens nothing, 1 hard-blacks the corners. Falloff is the
// normalized distance from center where dimming starts (0..1, where 1 is the
// corners of a 16:9-ish screen). Smaller falloff = the dim ring starts
// closer to the middle.
const VIGNETTE_STRENGTH = 0.55;
const VIGNETTE_FALLOFF = 0.55;

// Scanlines modulate brightness sinusoidally along the Y axis. Intensity is
// how dark the dark stripes get; period is the spacing in screen pixels.
// Subtle is the goal — too much is unreadable on mobile.
const SCANLINE_INTENSITY = 0.08;
const SCANLINE_PERIOD_PX = 3.0;

// Chromatic aberration offset peak (pixels) and decay duration (ms). Game
// scene fires it on local-player damage; the pipeline only stores a
// strength uniform, the lifecycle lives in GameScene.
export const CHROMATIC_INITIAL_PIXELS = 6.0;
export const CHROMATIC_DECAY_MS = 250;

/**
 * Max concurrent shockwaves the shader's fixed-size uniform arrays can
 * carry. Must match the loop bound in FRAG_SHADER. Bump both together if
 * you need more headroom — extra slots cost a constant per-pixel hit even
 * when unused (the loop is unrolled and runs every iteration regardless).
 */
export const MAX_SHOCKWAVES = 4;
export const SHOCKWAVE_THICKNESS_PX = 24;

// Loop bound matches MAX_SHOCKWAVES. WebGL ES 1.0 requires constant loop
// bounds, so this is hard-coded — keep the JS constant in sync.
const FRAG_SHADER = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uVignetteStrength;
uniform float uVignetteFalloff;
uniform float uScanlineIntensity;
uniform float uScanlinePeriod;
uniform float uChromaticUv;

uniform vec2 uResolution;
uniform vec2 uShockOrigins[4];
uniform float uShockRadii[4];
uniform float uShockStrengths[4];
uniform float uShockThickness;

varying vec2 outTexCoord;

void main(void) {
    // Shockwave displacement first — every later sample reads from the
    // displaced UV so chromatic aberration / vignette / scanlines all
    // get the warped result for visual coherence. Inactive shockwaves
    // carry uShockStrengths[i] = 0 so their contribution is a no-op
    // without any branching (constant-time loop on every pixel).
    //
    // Phaser's PostFX quad maps outTexCoord.y = 0 to the screen BOTTOM
    // and = 1 to the TOP (see PostFXPipeline.js vertex buffer), but
    // game/world Y has 0 at the TOP. Flip Y here so pixelPos is in the
    // same coordinate space as uShockOrigins (world == screen pixels).
    vec2 pixelPos = vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uResolution;
    vec2 displacementPx = vec2(0.0);
    for (int i = 0; i < 4; i++) {
        vec2 delta = pixelPos - uShockOrigins[i];
        float dist = length(delta);
        float ringDist = abs(dist - uShockRadii[i]);
        float falloff = smoothstep(uShockThickness, 0.0, ringDist);
        vec2 dir = delta / max(dist, 0.0001);
        displacementPx += dir * falloff * uShockStrengths[i];
    }
    vec2 displacedUv = outTexCoord + displacementPx / uResolution;

    // Chromatic aberration — sample R/B at horizontal UV offsets, all
    // anchored at the displaced UV so the warp doesn't tear the channels.
    vec2 uvOffset = vec2(uChromaticUv, 0.0);
    float r = texture2D(uMainSampler, displacedUv + uvOffset).r;
    float g = texture2D(uMainSampler, displacedUv).g;
    float b = texture2D(uMainSampler, displacedUv - uvOffset).b;
    float a = texture2D(uMainSampler, displacedUv).a;
    vec4 color = vec4(r, g, b, a);

    // Vignette — distance from screen center in UV space, scaled so the
    // corners reach ~1.0. Below uVignetteFalloff the image is untouched;
    // above it, brightness ramps down to (1 - uVignetteStrength).
    vec2 d = outTexCoord - 0.5;
    float dist2 = length(d) * 1.41421356;
    float vignette = smoothstep(uVignetteFalloff, 1.0, dist2) * uVignetteStrength;
    color.rgb *= (1.0 - vignette);

    // Scanlines — sin² over screen Y. gl_FragCoord is in pixels so the
    // period is independent of resolution scaling.
    float s = sin(gl_FragCoord.y * 3.14159265 / uScanlinePeriod);
    float scan = 1.0 - uScanlineIntensity * (s * s);
    color.rgb *= scan;

    gl_FragColor = color;
}
`;

/**
 * Single-pass CRT post-process: chromatic aberration + vignette + scanlines
 * combined into one fragment shader. Attached to the GameScene's main camera
 * so the entire frame (playfield + HUD) reads as a CRT monitor.
 */
export class CrtPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private chromaticPixels = 0;
  // Pre-allocated uniform buffers — refilled in-place by the controller
  // every frame; no per-frame allocation. Length matches MAX_SHOCKWAVES.
  private readonly shockOrigins: Float32Array = new Float32Array(MAX_SHOCKWAVES * 2);
  private readonly shockRadii: Float32Array = new Float32Array(MAX_SHOCKWAVES);
  private readonly shockStrengths: Float32Array = new Float32Array(MAX_SHOCKWAVES);

  constructor(game: Phaser.Game) {
    super({
      game,
      name: 'CrtPipeline',
      fragShader: FRAG_SHADER,
    });
  }

  setChromaticPixels(pixels: number): void {
    this.chromaticPixels = pixels;
  }

  /**
   * Push the current shockwave state into the pre-allocated uniform buffers.
   * Caller passes flat arrays of length `MAX_SHOCKWAVES`:
   *   originsXY[i*2]   = x in pixels
   *   originsXY[i*2+1] = y in pixels
   *   radiiPx[i]       = current ring radius in pixels
   *   strengthsPx[i]   = current displacement amplitude in pixels (0 = inactive)
   * The controller is responsive for zeroing strength on inactive slots.
   */
  setShockwaves(
    originsXY: ArrayLike<number>,
    radiiPx: ArrayLike<number>,
    strengthsPx: ArrayLike<number>,
  ): void {
    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      this.shockOrigins[i * 2] = originsXY[i * 2];
      this.shockOrigins[i * 2 + 1] = originsXY[i * 2 + 1];
      this.shockRadii[i] = radiiPx[i];
      this.shockStrengths[i] = strengthsPx[i];
    }
  }

  onPreRender(): void {
    this.set1f('uVignetteStrength', VIGNETTE_STRENGTH);
    this.set1f('uVignetteFalloff', VIGNETTE_FALLOFF);
    this.set1f('uScanlineIntensity', SCANLINE_INTENSITY);
    this.set1f('uScanlinePeriod', SCANLINE_PERIOD_PX);
    // Convert the pixel-space chromatic offset to UV space using the
    // current renderer width. Done here (not in setChromaticPixels) so
    // resizes are handled automatically.
    const uv =
      this.renderer.width > 0 ? this.chromaticPixels / this.renderer.width : 0;
    this.set1f('uChromaticUv', uv);

    this.set2f('uResolution', this.renderer.width, this.renderer.height);
    this.set1f('uShockThickness', SHOCKWAVE_THICKNESS_PX);
    this.set2fv('uShockOrigins', this.shockOrigins);
    this.set1fv('uShockRadii', this.shockRadii);
    this.set1fv('uShockStrengths', this.shockStrengths);
  }
}
