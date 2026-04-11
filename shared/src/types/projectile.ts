import { PlayerId, Vec2 } from './common.js';

export interface BulletTrail {
  startPos: Vec2;
  endPos: Vec2;
  shooterId: PlayerId;
  timestamp: number;
}

export interface GrenadeState {
  id: string;
  position: Vec2;
  velocity: Vec2;
  fuseTimer: number;
  throwerId: PlayerId;
}
