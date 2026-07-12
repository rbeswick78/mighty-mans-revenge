// Deterministic retro SFX synthesizer — writes 16-bit PCM mono 44.1kHz WAVs.
// Usage: node gen-sfx.mjs <outDir>
// All noise comes from a seeded mulberry32 PRNG so regeneration is exact.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SR = 44100;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simple state-variable band-pass filter (Chamberlin form).
function makeSVF() {
  let low = 0, band = 0;
  return (input, freq, q) => {
    const f = 2 * Math.sin((Math.PI * Math.min(freq, SR / 6)) / SR);
    low += f * band;
    const high = input - low - q * band;
    band += f * high;
    return band;
  };
}

function writeWav(path, samples) {
  // Normalize to 0.82 peak, then 16-bit PCM.
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0 ? 0.82 / peak : 0;
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * gain)) * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
  const rms = Math.sqrt(samples.reduce((a, s) => a + s * s, 0) / n) * gain;
  console.log(`${path}  ${(n / SR).toFixed(2)}s  rms=${rms.toFixed(3)}`);
}

// --- punch-whoosh: band-passed noise, center sweeps 2400 -> 450Hz, 180ms ---
function punchWhoosh() {
  const rng = mulberry32(0xf157);
  const n = Math.floor(SR * 0.18);
  const out = new Float64Array(n);
  const svf = makeSVF();
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const freq = 2400 * Math.pow(450 / 2400, t);
    const env = Math.min(1, i / (SR * 0.012)) * Math.pow(1 - t, 1.4);
    out[i] = svf((rng() * 2 - 1), freq, 0.6) * env;
  }
  return out;
}

// --- punch-impact: 130 -> 55Hz sine thump + 8ms noise click, soft-clipped, 150ms ---
function punchImpact() {
  const rng = mulberry32(0xbeef);
  const n = Math.floor(SR * 0.15);
  const out = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const freq = 130 * Math.pow(55 / 130, t * 2.2);
    phase += (2 * Math.PI * freq) / SR;
    const body = Math.sin(phase) * Math.exp(-t * 9);
    const click = i < SR * 0.008 ? (rng() * 2 - 1) * 0.5 * (1 - i / (SR * 0.008)) : 0;
    out[i] = Math.tanh((body + click) * 2.2);
  }
  return out;
}

// --- axe-whoosh: spinning-blade whoosh — band-passed noise 1900 -> 800Hz with
// ~9Hz rotation amplitude modulation deepening over 380ms ---
function axeWhoosh() {
  const rng = mulberry32(0xa7e0);
  const n = Math.floor(SR * 0.38);
  const out = new Float64Array(n);
  const svf = makeSVF();
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const freq = 1900 * Math.pow(800 / 1900, t);
    const spin = 0.55 + 0.45 * Math.sin(2 * Math.PI * 9 * t * (1 + t * 0.5));
    const env = Math.min(1, i / (SR * 0.02)) * Math.pow(1 - t, 1.1);
    out[i] = svf((rng() * 2 - 1), freq, 0.7) * spin * env;
  }
  return out;
}

// --- axe-chop (landing/impact): mid thunk 240 -> 90Hz + noise crack, 160ms ---
function axeChop() {
  const rng = mulberry32(0xc40b);
  const n = Math.floor(SR * 0.16);
  const out = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const freq = 240 * Math.pow(90 / 240, t * 1.8);
    phase += (2 * Math.PI * freq) / SR;
    const body = Math.sin(phase) * Math.exp(-t * 11);
    const crack = i < SR * 0.014 ? (rng() * 2 - 1) * 0.8 * (1 - i / (SR * 0.014)) : 0;
    out[i] = Math.tanh((body + crack) * 2.0);
  }
  return out;
}

// --- hit-confirm: two bright square-wave ticks + a tiny noise transient, 65ms ---
// Kept intentionally dry and short so it reads through rifle bursts without
// masking weapon audio. This is local-shooter feedback, not a world sound.
function hitConfirm() {
  const rng = mulberry32(0x417c0de);
  const n = Math.floor(SR * 0.065);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const seconds = i / SR;
    const t = i / n;
    const toneA = Math.sign(Math.sin(2 * Math.PI * 1320 * seconds));
    const toneB = Math.sign(Math.sin(2 * Math.PI * 1760 * seconds));
    const envelope = Math.exp(-t * 8.5);
    const click = i < SR * 0.004 ? (rng() * 2 - 1) * (1 - i / (SR * 0.004)) : 0;
    out[i] = Math.tanh((toneA * 0.42 + toneB * 0.22 + click * 0.35) * envelope);
  }
  return out;
}

const outDir = process.argv[2] ?? '.';
mkdirSync(outDir, { recursive: true });
writeWav(join(outDir, 'punch-whoosh.wav'), punchWhoosh());
writeWav(join(outDir, 'punch-impact.wav'), punchImpact());
writeWav(join(outDir, 'axe-whoosh.wav'), axeWhoosh());
writeWav(join(outDir, 'axe-chop.wav'), axeChop());
writeWav(join(outDir, 'hit-confirm.wav'), hitConfirm());
