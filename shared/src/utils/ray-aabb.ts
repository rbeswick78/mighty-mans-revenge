/**
 * Ray vs AABB intersection test.
 * Returns the distance along the ray to the nearest intersection point,
 * or null if the ray does not hit the box. The AABB is specified by its
 * center plus half-extents.
 */
export function rayIntersectsAABB(
  rayOriginX: number,
  rayOriginY: number,
  rayDirX: number,
  rayDirY: number,
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight: number,
): number | null {
  const minX = centerX - halfWidth;
  const maxX = centerX + halfWidth;
  const minY = centerY - halfHeight;
  const maxY = centerY + halfHeight;

  let tmin = -Infinity;
  let tmax = Infinity;

  if (rayDirX !== 0) {
    const t1 = (minX - rayOriginX) / rayDirX;
    const t2 = (maxX - rayOriginX) / rayDirX;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else {
    if (rayOriginX < minX || rayOriginX > maxX) return null;
  }

  if (rayDirY !== 0) {
    const t1 = (minY - rayOriginY) / rayDirY;
    const t2 = (maxY - rayOriginY) / rayDirY;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  } else {
    if (rayOriginY < minY || rayOriginY > maxY) return null;
  }

  if (tmax < 0 || tmin > tmax) return null;

  return tmin >= 0 ? tmin : tmax >= 0 ? tmax : null;
}
