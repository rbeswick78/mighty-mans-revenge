export interface RawInput {
  moveX: number;
  moveY: number;
  aimAngle: number;
  /** LMB held this frame — show the bullet aim line. */
  aimingGun: boolean;
  /** LMB released since the last input — fire a 3-round burst. */
  firePressed: boolean;
  /** RMB held this frame with no live grenade — show the grenade aim arc. */
  aimingGrenade: boolean;
  /** RMB released after an aim phase — throw the grenade. */
  throwPressed: boolean;
  /** RMB pressed while a live grenade exists — detonate it. */
  detonatePressed: boolean;
  sprint: boolean;
  reload: boolean;
}
