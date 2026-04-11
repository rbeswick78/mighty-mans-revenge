import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Loading bar
    const barWidth = 320;
    const barHeight = 20;
    const barX = (this.cameras.main.width - barWidth) / 2;
    const barY = this.cameras.main.height / 2;

    const bgBar = this.add.graphics();
    bgBar.fillStyle(0x333333, 1);
    bgBar.fillRect(barX, barY, barWidth, barHeight);

    const progressBar = this.add.graphics();

    const loadingText = this.add.text(
      this.cameras.main.width / 2,
      barY - 30,
      'LOADING...',
      {
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: '16px',
        color: '#e94560',
      },
    );
    loadingText.setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0xe94560, 1);
      progressBar.fillRect(barX + 2, barY + 2, (barWidth - 4) * value, barHeight - 4);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      bgBar.destroy();
      loadingText.destroy();
    });

    // Generate placeholder textures
    this.generatePlaceholderAssets();
  }

  create(): void {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('LobbyScene');
    });
  }

  private generatePlaceholderAssets(): void {
    // Helper to create a graphics object not added to the display list
    const gfx = (): Phaser.GameObjects.Graphics => this.add.graphics().setVisible(false);

    // Player — 24x24 green square
    const playerGfx = gfx();
    playerGfx.fillStyle(0x00ff66, 1);
    playerGfx.fillRect(0, 0, 24, 24);
    playerGfx.generateTexture('player', 24, 24);
    playerGfx.destroy();

    // Enemy — 24x24 red square
    const enemyGfx = gfx();
    enemyGfx.fillStyle(0xff3333, 1);
    enemyGfx.fillRect(0, 0, 24, 24);
    enemyGfx.generateTexture('enemy', 24, 24);
    enemyGfx.destroy();

    // Bullet trail — 4x2 yellow rectangle
    const bulletGfx = gfx();
    bulletGfx.fillStyle(0xffff00, 1);
    bulletGfx.fillRect(0, 0, 4, 2);
    bulletGfx.generateTexture('bullet-trail', 4, 2);
    bulletGfx.destroy();

    // Grenade — 8x8 orange circle
    const grenadeGfx = gfx();
    grenadeGfx.fillStyle(0xff8800, 1);
    grenadeGfx.fillCircle(4, 4, 4);
    grenadeGfx.generateTexture('grenade', 8, 8);
    grenadeGfx.destroy();

    // Pickup ammo — 12x12 blue square
    const ammoGfx = gfx();
    ammoGfx.fillStyle(0x4488ff, 1);
    ammoGfx.fillRect(0, 0, 12, 12);
    ammoGfx.generateTexture('pickup-ammo', 12, 12);
    ammoGfx.destroy();

    // Pickup grenade — 12x12 orange square
    const pickupGrenadeGfx = gfx();
    pickupGrenadeGfx.fillStyle(0xff8800, 1);
    pickupGrenadeGfx.fillRect(0, 0, 12, 12);
    pickupGrenadeGfx.generateTexture('pickup-grenade', 12, 12);
    pickupGrenadeGfx.destroy();

    // Tile floor — 48x48 dark gray square
    const floorGfx = gfx();
    floorGfx.fillStyle(0x2a2a3e, 1);
    floorGfx.fillRect(0, 0, 48, 48);
    floorGfx.lineStyle(1, 0x3a3a4e, 0.3);
    floorGfx.strokeRect(0, 0, 48, 48);
    floorGfx.generateTexture('tile-floor', 48, 48);
    floorGfx.destroy();

    // Tile wall — 48x48 brown square
    const wallGfx = gfx();
    wallGfx.fillStyle(0x5c4033, 1);
    wallGfx.fillRect(0, 0, 48, 48);
    wallGfx.lineStyle(2, 0x3d2b22, 1);
    wallGfx.strokeRect(1, 1, 46, 46);
    wallGfx.generateTexture('tile-wall', 48, 48);
    wallGfx.destroy();

    // Tile cover — 48x48 lighter brown square
    const coverGfx = gfx();
    coverGfx.fillStyle(0x7a5c47, 1);
    coverGfx.fillRect(0, 0, 48, 48);
    coverGfx.lineStyle(1, 0x5c4033, 1);
    coverGfx.strokeRect(1, 1, 46, 46);
    coverGfx.generateTexture('tile-cover', 48, 48);
    coverGfx.destroy();

    // Explosion — 32x32 red/orange circle
    const explosionGfx = gfx();
    explosionGfx.fillStyle(0xff4400, 1);
    explosionGfx.fillCircle(16, 16, 16);
    explosionGfx.fillStyle(0xff8800, 0.7);
    explosionGfx.fillCircle(16, 16, 10);
    explosionGfx.fillStyle(0xffcc00, 0.5);
    explosionGfx.fillCircle(16, 16, 5);
    explosionGfx.generateTexture('explosion', 32, 32);
    explosionGfx.destroy();
  }
}
