import type { CharacterDef } from '@shared/types/character.js';

/**
 * Choose a cosmetic death animation from authoritative, reconnect-safe state.
 * The base collapse always plays first; later deaths cycle through any extra
 * strips and back to the base without client RNG or new wire state.
 */
export function deathVariantPrefix(
  character: CharacterDef,
  axeless: boolean,
  deathCount: number,
): string {
  const body = axeless && character.altBody ? character.altBody : character;
  const variants = body.deathVariants ?? [];
  const safeDeathCount = Number.isFinite(deathCount)
    ? Math.max(1, Math.floor(deathCount))
    : 1;
  const variantIndex = (safeDeathCount - 1) % (variants.length + 1);
  return variantIndex === 0
    ? body.spritePrefix
    : variants[variantIndex - 1].spritePrefix;
}
