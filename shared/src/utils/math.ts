import { Vec2 } from '../types/common.js';

export function vecAdd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vecSub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vecScale(v: Vec2, scalar: number): Vec2 {
  return { x: v.x * scalar, y: v.y * scalar };
}

export function vecLength(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vecNormalize(v: Vec2): Vec2 {
  const len = vecLength(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function vecDistance(a: Vec2, b: Vec2): number {
  return vecLength(vecSub(a, b));
}

export function vecLerp(a: Vec2, b: Vec2, t: number): Vec2 {
  const clamped = clamp(t, 0, 1);
  return {
    x: a.x + (b.x - a.x) * clamped,
    y: a.y + (b.y - a.y) * clamped,
  };
}

export function vecAngle(v: Vec2): number {
  return Math.atan2(v.y, v.x);
}

export function vecFromAngle(angle: number): Vec2 {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function lerpNumber(a: number, b: number, t: number): number {
  const clamped = clamp(t, 0, 1);
  return a + (b - a) * clamped;
}
