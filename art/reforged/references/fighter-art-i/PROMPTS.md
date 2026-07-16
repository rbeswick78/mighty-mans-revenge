# Fighter Art I production references

These three original reference boards were generated with the OpenAI built-in
image-generation path on 2026-07-16. They were prompted only from the checked-in
fighter identities and the Batch 25 written visual contract. No external image,
franchise reference, third-party style input, Batch 25 golden pixel, logo, or
trademark was supplied.

The boards are production references, not atlas inputs. The committed canonical
source sheets are newly drawn deterministic project geometry from
`tools/reforged-assets/create-fighter-art-i-sources.mjs`. That cleanup keeps an
exact 64x64 registration grid, reduces each fighter to one dominant body mass,
and corrects inconsistent pose scale or incidental detail from the references.

## Mighty Man

- Generation: `exec-ad46aa00-d221-4206-aaff-7110510fe9ef`
- Artifact: `mighty-man-production-reference.png`

```text
Use case: stylized-concept
Asset type: production reference for a top-down browser-game fighter sprite sheet
Primary request: Create an original top-down and high three-quarter production reference board for Mighty Man only, a balanced lean human wasteland rifleman. Show one clean hero pose and a compact grid of clearly separated key poses for four-direction idle, movement, rifle attack, cyan x-ray ability, directional damage reaction, and side-facing collapse/death. Preserve a square steady stance, dark soot-navy utility jacket, compact amber scarf, pale bone face guard/goggles, practical long rifle with visible negative space from the torso, and a compact cyan rib/optic x-ray cue.
Style/medium: browser-efficient stylized comic 2D, bold controlled ink contour, two-to-three matte cel-shaded value bands, clean antialiasing, minimal dry-brush only on the hero pose
Composition/framing: isolated full-body figures with consistent scale and foot registration; top-down poses must remain readable at 48-72 CSS pixels; keep generous gutters between poses
Lighting/mood: neutral production lighting
Color palette: soot navy, warm bone, muted steel, amber scarf, compact cyan ability accent
Constraints: Mighty Man only; no other fighter; no text; no logos; no watermark; no biome background; no UI; no pixel art; no photorealism; no 3D; no extra weapon; no body merging into rifle; mechanics and aim/facing remain visually consistent; this is a reference board, not an atlas
Avoid: perspective inconsistency, multiple dominant body masses, oversized glow, hidden hands, different outfits between poses, loose registration
```

## Bruce

- Generation: `exec-53f6d276-c30d-4878-807f-f48904b0d35e`
- Artifact: `bruce-production-reference.png`

```text
Use case: stylized-concept
Asset type: production reference for a top-down browser-game fighter sprite sheet
Primary request: Create an original top-down and high three-quarter production reference board for Bruce only, a compact stocky undead fire-breather. Show one clean hero pose and a compact grid of clearly separated key poses for four-direction idle, movement, heavy-hand attack, ember fire-breath ability, directional damage reaction, and side-facing collapse/death. Preserve a broad hunched torso, heavy hands, broad jaw, muted ashen violet-grey undead skin, torn soot-dark workwear, absolutely no carried gun, and a compact ember-orange throat/chest cue with a short forward flame cone.
Style/medium: browser-efficient stylized comic 2D, bold controlled ink contour, two-to-three matte cel-shaded value bands, clean antialiasing, minimal dry-brush only on the hero pose, non-gory
Composition/framing: isolated full-body figures with consistent scale and foot registration; top-down poses must remain readable at 48-72 CSS pixels; keep generous gutters between poses
Lighting/mood: neutral production lighting
Color palette: soot charcoal workwear, muted violet-grey skin, warm bone teeth/eyes, compact ember-orange ability accent
Constraints: Bruce only; no other fighter; no text; no logos; no watermark; no biome background; no UI; no pixel art; no photorealism; no 3D; no weapon or gun in any pose; mechanics and facing remain visually consistent; this is a reference board, not an atlas
Avoid: oversized mutant/tank mass, gore, changing outfit or body mass, long magical fire, multiple dominant body masses, loose registration
```

## Frost Wizard

- Generation: `exec-4006255a-e203-4da2-8600-20e36a9982c0`
- Artifact: `frost-wizard-production-reference.png`

```text
Use case: stylized-concept
Asset type: production reference for a top-down browser-game fighter sprite sheet
Primary request: Create an original top-down and high three-quarter production reference board for Frost Wizard only, a slim fast fragile human survivor caster. Show one clean hero pose and a compact grid of clearly separated key poses for four-direction idle, movement, wand attack, cyan/indigo frost ability, directional damage reaction, and side-facing collapse/death. Preserve a narrow long-limbed human mass, angular hood, layered winter wraps, short wand held with clear negative space, absolutely no gun, low foot mist, and compact sharp cyan/indigo ice cues.
Style/medium: browser-efficient stylized comic 2D, bold controlled ink contour, two-to-three matte cel-shaded value bands, clean antialiasing, minimal dry-brush only on the hero pose
Composition/framing: isolated full-body figures with consistent scale and foot registration; top-down poses must remain readable at 48-72 CSS pixels; keep generous gutters between poses
Lighting/mood: neutral production lighting
Color palette: soot navy and indigo wraps, warm bone face/trim, compact cyan frost highlights
Constraints: Frost Wizard only; clearly human; no other fighter; no text; no logos; no watermark; no biome background; no UI; no pixel art; no photorealism; no 3D; no gun in any pose; short wand remains visible; mechanics and facing remain visually consistent; this is a reference board, not an atlas
Avoid: bulky robe mass, undead face, oversized staff, floor-filling magic, multiple dominant body masses, outfit drift, loose registration
```

## Production cleanup and inspection record

The three reference boards were inspected at their original dimensions before
cleanup. The committed canonical source sheets and the packed
`fighter-art-i.core` atlas were then inspected at original size, at 844x390
mobile-landscape width, and in a 1280x720 live gameplay frame with 64 logical-
pixel bodies. Automated source decoding also checks every living frame for the
exact 64px grid, registered foot range, dominant opaque mass, transparent
negative space, and identity palette cues.

| Fighter      | Cleanup disposition and scale result                                                                                                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mighty Man   | Reference silhouette and palette accepted; deterministic cleanup fixed rifle/body separation, exact four-direction registration, compact amber/bone masses, and cyan ability release. Rifle identity remained readable at gameplay and mobile width.        |
| Bruce        | Reference ember/no-gun language accepted; deterministic cleanup reduced incidental tank-like detail to the locked compact stocky mass and removed every steel weapon cue. Heavy hands, broad jaw, and ember cone remained distinct at all inspected scales. |
| Frost Wizard | Reference hood/wrap/wand language accepted; deterministic cleanup fixed wand length, foot registration, narrow mass, and bounded frost shapes. Cyan/indigo cue and human no-gun silhouette remained distinct at all inspected scales.                       |

The packed atlas was visually compared with the sources after mip-safe
extrusion/padding. No trim, rotation, cross-frame bleed, missing state, golden
pixel, UI pixel, or provenance-only field appeared in runtime output. Desktop
Chromium supplied compositor and direct-renderer references. The staged mobile
project retained the documented RFG-003 black compositor limitation, while its
state/object assertions and non-black direct renderer pixels passed.
