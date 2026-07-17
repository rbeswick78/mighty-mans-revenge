import {
  REFORGED_ENVIRONMENT_FRAME_SIZE,
  REFORGED_ENVIRONMENT_TEXTURE_KEY,
  reforgedEnvironmentFrame,
  reforgedEnvironmentGroundRole,
  type ReforgedBiomeFamily,
} from '../rendering/reforged-environment-contract.js';
import { ReforgedMenuTokens } from './reforged/design-tokens.js';

type Outcome = 'victory' | 'defeat' | 'draw';

/** Atlas-owned menu backdrop used only after the atomic Reforged cutover passes. */
export class ReforgedVisualBackdrop {
  private readonly wash: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, family: ReforgedBiomeFamily) {
    const width = scene.cameras.main.width;
    const height = scene.cameras.main.height;
    scene.add
      .rectangle(0, 0, width, height, ReforgedMenuTokens.color.canvas)
      .setOrigin(0)
      .setDepth(0);

    const columns = Math.ceil(width / REFORGED_ENVIRONMENT_FRAME_SIZE);
    const firstGroundRow = Math.max(0, Math.floor(height / REFORGED_ENVIRONMENT_FRAME_SIZE) - 4);
    for (let row = firstGroundRow; row <= Math.ceil(height / 64); row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const role =
          row === firstGroundRow ? 'wall-intact' : reforgedEnvironmentGroundRole(row, col);
        scene.add
          .image(
            col * 64 + 32,
            row * 64 + 32,
            REFORGED_ENVIRONMENT_TEXTURE_KEY,
            reforgedEnvironmentFrame(family, role),
          )
          .setDisplaySize(64, 64)
          .setDepth(row === firstGroundRow ? 4 : 6);
      }
    }
    for (let col = 2; col < columns; col += 5) {
      scene.add
        .image(
          col * 64 + 32,
          firstGroundRow * 64 + 20,
          REFORGED_ENVIRONMENT_TEXTURE_KEY,
          reforgedEnvironmentFrame(family, col % 2 === 0 ? 'prop-a-intact' : 'prop-b-intact'),
        )
        .setDisplaySize(64, 64)
        .setDepth(7);
    }

    this.wash = scene.add.rectangle(0, 0, width, height, 0x000000, 0).setOrigin(0).setDepth(9);
  }

  setOutcomeWash(outcome: Outcome): void {
    const color = outcome === 'victory' ? 0x2f6b58 : outcome === 'defeat' ? 0x6b2f35 : 0x7b5a20;
    this.wash.setFillStyle(color, 0.22);
  }
}
