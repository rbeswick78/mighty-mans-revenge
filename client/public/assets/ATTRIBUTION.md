# Asset Attribution

This game uses pixel art assets from third-party packs. Source archives are
**not** redistributed — only the curated subset we render is checked in.

## Post-Apocalyptic Pixel Art Asset Pack

- **Author:** TheLazyStone
- **Source:** https://thelazystone.itch.io/post-apocalyptic-pixel-art-asset-pack
- **Version:** 1.1.2
- **License terms:**
  - Free for non-commercial use.
  - Commercial use requires a one-time payment of at least $2 USD to the author.
  - No redistribution of the original asset pack (modified or unmodified).
  - Credit is appreciated but not required.

### Files used

- `player/character_*_idle.png` — Character/Main/Idle (4 directions)
- `enemies/zombie_*_idle.png` — Enemies/Zombie_Small idle (4 directions)
- `tiles/background_bleak-yellow.png` — Tiles/Background_Bleak-Yellow_TileSet
- `tiles/brick-wall.png` — Tiles/Brick-Wall_TileSet
- `tiles/wire-fence-closing-no-lock.png` — Tiles/Wire-Fence/Wire-Fence_Closing_No-Lock_Sheet7
- `tiles/iron-fence.png` — Tiles/Iron-Fence_TileSet
- `pickups/ammo-crate_blue.png` — Objects/Pickable
- `pickups/ammo-crate_red.png` — Objects/Pickable
- `pickups/shotgun.png` — Objects/Pickable/Shotgun
- `pickups/bandage.png` — Objects/Pickable/Bandage
- `player/shotgun_*_hold.png` — Character/Guns/Shotgun idle-and-run Sheet6 (4 directions)
- `player/shotgun_*_shoot.png` — Character/Guns/Shotgun shoot Sheet3 (4 directions)
- `player/shotgun_*_racking.png` — Character/Guns/Shotgun racking Sheet2 (4 directions)
- `player/shotgun-bullet.png` — Character/Guns/Bullets/Shotgun-bullet
- `ui/shotgun-bullet-indicator.png` (+ `_empty`) — UI/Bullet Indicators/Shotgun-Bullet
- `ui/shotgun-bullet-indicator_small.png` (+ `_small_empty`) — UI/Bullet Indicators/Small
- `tiles/background_green.png` — Tiles/Background_Green_TileSet
- `tiles/background_dark-green.png` — Tiles/Background_Dark-Green_TileSet
- `tiles/garbage.png` — Tiles/Garbage_TileSet
- `tiles/roof.png` — Tiles/Roof_TileSet
- `decor/car-overgrown_red.png` (+ `_blue`) — Objects/Vehicles/Overgrown/Car_1_Overgrown/Green
- `decor/car-scrap_gray.png` (+ `_red`) — Objects/Vehicles/Normal/Car_6_Scrap
- `decor/container-overgrown_gray.png` — Objects/Container/Container_4_Gray_Horizontal_Overgrown_Dark-Green
- `decor/container-overgrown_red.png` — Objects/Container/Container_8_Red_Horizontal_Overgrown_Dark-Green
- `enemies/zombie-big_*_idle.png` — Enemies/Zombie_Big idle Sheet6 (4 directions)
- `enemies/zombie-big_*_run.png` — Enemies/Zombie_Big walk Sheet8 (4 directions)
- `enemies/zombie-axe_*_idle.png` — Enemies/Zombie_Axe (with-axe) idle Sheet6 (4 directions)
- `enemies/zombie-axe_*_run.png` — Enemies/Zombie_Axe (with-axe) walk Sheet8 (4 directions)
- `enemies/axe_{side,side-left,vertical}_thrown.png` — Enemies/Zombie_Axe/Axe thrown Sheet9
- `enemies/axe_*_landing.png` — Enemies/Zombie_Axe/Axe landing Sheet5 (4 directions)
- `enemies/axe_*_landed.png` — Enemies/Zombie_Axe/Axe landed singles (4 directions)
- `player/pistol_*_hold.png` — Character/Guns/Pistol idle-and-run Sheet6 (4 directions)
- `player/pistol_*_shoot.png` — Character/Guns/Pistol shoot Sheet3 (4 directions)
- `ui/pistol-bullet-indicator.png` (+ `_empty`) — UI/Bullet Indicators/Pistol-Bullet
- `player/character_*_attack.png` — Character/Main/Punch (with-hands) Sheet4 (4 directions)
- `enemies/zombie_*_attack.png` — Enemies/Zombie_Small First-Attack Sheet4 (4 directions)
- `enemies/zombie-big_*_attack.png` — Enemies/Zombie_Big First-Attack Sheet8 (4 directions)
- `enemies/zombie-axe_*_attack.png` — Enemies/Zombie_Axe (with-axe) First-Attack Sheet7 (4 directions)
- `pickups/pistol.png` — Objects/Pickable/Pistol
- `enemies/zombie-axe-noaxe_*_idle.png` — Enemies/Zombie_Axe/No-Axe idle Sheet6 (4 directions)
- `enemies/zombie-axe-noaxe_*_run.png` — Enemies/Zombie_Axe/No-Axe walk Sheet8 (4 directions)
- `enemies/zombie-axe-noaxe_*_attack.png` — Enemies/Zombie_Axe/No-Axe First-Attack Sheet7 (4 directions)

- `player/character_{side,side-left}_death.png` — Character/Main/Death death1 NoHands Sheet6
- `enemies/zombie_{side,side-left}_death.png` — Enemies/Zombie_Small First-Death Sheet6
- `enemies/zombie-big_{side,side-left}_death.png` — Enemies/Zombie_Big First-Death Sheet7
- `enemies/zombie-axe_{side,side-left}_death.png` — Enemies/Zombie_Axe First-Death Sheet6
- `enemies/zombie-axe-noaxe_{side,side-left}_death.png` — Enemies/Zombie_Axe/No-Axe First-Death Sheet6
- `effects/player-hit-1.png` — Enemies/Shot/shot_1 Sheet3
- `effects/player-hit-2.png` — Enemies/Shot/shot_2 Sheet3

- `decor/barrel-red.png` - Objects/Barrel_red_1

## Original audio

The pack ships no audio. `audio/punch-whoosh.wav`, `audio/punch-impact.wav`,
`audio/axe-whoosh.wav`, `audio/axe-chop.wav`, and `audio/hit-confirm.wav` are
original works, procedurally synthesized by `client/scripts/gen-sfx.mjs`
(deterministic — rerunning the script reproduces the files byte-for-byte). No
third-party license applies.

If we ever ship this commercially (charge money, run ads, promote a paid
product) we owe the author at least $2 — pay before release.
