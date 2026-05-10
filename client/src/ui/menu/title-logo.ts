import Phaser from 'phaser';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { MENU_FONTS } from './fonts.js';

export interface TitleLogoOpts {
  fontSize?: number;
  fillColor?: number;
  strokeColor?: number;
  strokeThickness?: number;
  shadowColor?: number;
  shadowOffset?: number;
  shadowAlpha?: number;
  chromaticOffset?: number;
  chromaticAlpha?: number;
  lineSpacing?: number;
}

// Multi-line Press Start 2P logo with stroke, drop shadow, and
// chromatic-aberration smear duplicates behind the main fill — sells the
// CRT/old-TV feel. Used for both the lobby title (MIGHTY MAN'S / REVENGE)
// and the end-screen banner (VICTORY / DEFEAT / DRAW).
export class TitleLogo extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    lines: string[],
    opts?: TitleLogoOpts,
  ) {
    super(scene, x, y);

    const fontSize = opts?.fontSize ?? 36;
    const fillColor = opts?.fillColor ?? Wasteland.LOADING_BAR_FILL;
    const strokeColor = opts?.strokeColor ?? Wasteland.CANVAS_BG;
    const strokeThickness = opts?.strokeThickness ?? 3;
    const shadowColor = opts?.shadowColor ?? Wasteland.HIT_FLASH;
    const shadowOffset = opts?.shadowOffset ?? 2;
    const shadowAlpha = opts?.shadowAlpha ?? 0.6;
    const chromaticOffset = opts?.chromaticOffset ?? 1;
    const chromaticAlpha = opts?.chromaticAlpha ?? 0.4;
    const lineSpacing = opts?.lineSpacing ?? 8;
    const text = lines.join('\n');

    const baseStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: MENU_FONTS.LOGO,
      fontSize: `${fontSize}px`,
      align: 'center',
      lineSpacing,
    };

    // Order: shadow (back), cyan/magenta chroma duplicates, main (front).
    // Container.add() appends — later additions render on top.
    const shadow = scene.add
      .text(shadowOffset, shadowOffset, text, {
        ...baseStyle,
        color: cssHex(shadowColor),
      })
      .setOrigin(0.5)
      .setAlpha(shadowAlpha);

    const cyan = scene.add
      .text(-chromaticOffset, 0, text, {
        ...baseStyle,
        color: '#00ffff',
      })
      .setOrigin(0.5)
      .setAlpha(chromaticAlpha);

    const magenta = scene.add
      .text(chromaticOffset, 0, text, {
        ...baseStyle,
        color: '#ff00ff',
      })
      .setOrigin(0.5)
      .setAlpha(chromaticAlpha);

    const main = scene.add
      .text(0, 0, text, {
        ...baseStyle,
        color: cssHex(fillColor),
        stroke: cssHex(strokeColor),
        strokeThickness,
      })
      .setOrigin(0.5);

    this.add([shadow, cyan, magenta, main]);

    scene.add.existing(this);
  }
}
