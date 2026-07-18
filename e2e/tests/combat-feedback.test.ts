import { expect, test, type Page, type TestInfo } from '@playwright/test';

const shellAdvertised = process.env.CAPABILITY_NEW_SHELL === 'true';

async function waitForMenuOwner(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('load');
  await expect
    .poll(
      () =>
        page.evaluate(
          (useReforgedShell) =>
            (window as unknown as { game?: Phaser.Game }).game?.scene
              .getScenes(true)
              .some(
                (scene) =>
                  scene.scene.key === (useReforgedShell ? 'ReforgedShellScene' : 'LobbyScene'),
              ) ?? false,
          shellAdvertised,
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
}

async function stageFeedback(
  page: Page,
  quality: 'full' | 'reduced',
): Promise<{ poolSize: number; visible: number; fallbackCreated: boolean }> {
  return page.evaluate(
    async ({ tier, useReforgedShell }) => {
      const game = (window as unknown as { game?: Phaser.Game }).game;
      const scene = game?.scene.getScene(useReforgedShell ? 'ReforgedShellScene' : 'LobbyScene');
      if (!scene) throw new Error('active menu owner unavailable');
      const modulePath = '/src/rendering/reforged-combat-feedback-renderer.ts';
      const { ReforgedCombatFeedbackRenderer } = await import(modulePath);
      const budget = () => ({ tier }) as never;
      const fallback = ReforgedCombatFeedbackRenderer.create(scene, false, budget);
      const renderer = ReforgedCombatFeedbackRenderer.create(scene, true, budget);
      if (!renderer) throw new Error('Combat-feedback atlas was not registered');

      const directions = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      directions.forEach((angle, index) => renderer.showMuzzle(130 + index * 120, 145, angle));
      directions.forEach((angle, index) =>
        renderer.showImpact('scenery', 130 + index * 120, 235, angle),
      );
      directions.forEach((angle, index) =>
        renderer.showImpact('player', 130 + index * 120, 315, angle),
      );
      renderer.showExplosion(740, 205, 96);
      renderer.showHealing(670, 350);
      renderer.showArmor(790, 350);
      renderer.showElimination(890, 350, -Math.PI / 2);
      renderer.showRarityPreview(670, 470, 'mythic');
      renderer.showZonePreview(810, 480);

      const fighters = ['mighty_man', 'bruce', 'frost_wizard', 'bubba', 'jack', 'rook'];
      const players = fighters.map((characterId, index) => ({
        id: `feedback-${characterId}`,
        characterId,
        position: { x: 160 + index * 125, y: 590 },
        aimAngle: (Math.PI * index) / 3,
        abilityActiveSeconds: 0,
        abilityCooldownSeconds: 0,
        isDead: false,
      }));
      renderer.update(players as never, 0);
      renderer.update(
        players.map((player) => ({
          ...player,
          abilityActiveSeconds: ['mighty_man', 'bruce', 'bubba'].includes(player.characterId)
            ? 1
            : 0,
          abilityCooldownSeconds: ['frost_wizard', 'jack', 'rook'].includes(player.characterId)
            ? 8
            : 0,
        })) as never,
        16,
      );

      (window as unknown as { __combatFeedbackEvidence?: unknown }).__combatFeedbackEvidence =
        renderer;
      const sprites = scene.children.list.filter(
        (child) =>
          'texture' in child &&
          (child as Phaser.GameObjects.Image).texture.key === 'reforged-combat-feedback-art',
      ) as Phaser.GameObjects.Image[];
      return {
        poolSize: sprites.length,
        visible: sprites.filter((sprite) => sprite.visible && sprite.active).length,
        fallbackCreated: fallback !== null,
      };
    },
    { tier: quality, useReforgedShell: shellAdvertised },
  );
}

async function attachCanvasEvidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await testInfo.attach(name, {
    body: await page.locator('canvas').screenshot(),
    contentType: 'image/png',
  });
}

test('full feedback set is pooled, capability-owned, and directly rendered', async ({
  page,
}, testInfo) => {
  await waitForMenuOwner(page);
  const evidence = await stageFeedback(page, 'full');
  expect(evidence).toEqual({ poolSize: 32, visible: 24, fallbackCreated: false });
  await attachCanvasEvidence(page, testInfo, 'combat-feedback-full');
  await page.locator('canvas').evaluate((canvas) => {
    canvas.style.filter = 'grayscale(1)';
  });
  await attachCanvasEvidence(page, testInfo, 'combat-feedback-full-grayscale');
});

test('reduced feedback retains essentials inside the smaller pool budget', async ({
  page,
}, testInfo) => {
  await waitForMenuOwner(page);
  const evidence = await stageFeedback(page, 'reduced');
  expect(evidence).toEqual({ poolSize: 32, visible: 16, fallbackCreated: false });
  await attachCanvasEvidence(page, testInfo, 'combat-feedback-reduced');
});
