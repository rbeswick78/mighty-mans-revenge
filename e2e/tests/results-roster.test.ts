import { test, expect } from '../fixtures';

const modernArtAdvertised = process.env.CAPABILITY_MODERN_ART === 'true';

async function waitForLobby(gamePage: import('@playwright/test').Page): Promise<void> {
  await expect
    .poll(
      () =>
        gamePage.evaluate(() => {
          const game = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game;
          const lobby = game?.scene.getScene('LobbyScene') as {
            sys?: { settings: { active: boolean } };
          };
          return lobby?.sys?.settings.active ?? false;
        }),
      { timeout: 15000, message: 'expected the lobby before staging roster results' },
    )
    .toBe(true);
}

test.describe('Result fighter roster', () => {
  test('renders authoritative characters in Rumble standings and duel tableau', async ({
    gamePage,
  }) => {
    await waitForLobby(gamePage);
    await gamePage.evaluate((advertiseModernArt) => {
      const w = window as unknown as {
        game?: {
          scene: {
            scenes: Array<{
              scene: { start: (key: string, data: unknown) => void };
              sys: { settings: { active: boolean } };
            }>;
            getScene: (key: string) => unknown;
          };
        };
      };
      const active = w.game?.scene.scenes.find((scene) => scene.sys.settings.active);
      const lobby = w.game?.scene.getScene('LobbyScene') as {
        gameService?: {
          getPlayerId: () => string | null;
          getServerCapabilities: () => Record<string, boolean>;
        };
      };
      if (!active || !lobby.gameService) throw new Error('lobby is not ready');
      lobby.gameService.getPlayerId = () => 'local';
      const currentCapabilities = lobby.gameService.getServerCapabilities();
      lobby.gameService.getServerCapabilities = () => ({
        ...currentCapabilities,
        modernArt: advertiseModernArt,
      });
      const stats = {
        kills: 4,
        assists: 2,
        deaths: 3,
        shotsFired: 20,
        shotsHit: 10,
        damageDealt: 500,
        damageTaken: 300,
        grenadesThrown: 1,
        killsByWeapon: {
          gun: 4,
          grenade: 0,
          fire: 0,
          shotgun: 0,
          axe: 0,
          pistol: 0,
          punch: 0,
          bat: 0,
          barrel: 0,
        },
        longestKillStreak: 2,
        distanceTraveled: 800,
        hillSeconds: 0,
      };
      active.scene.start('ResultsScene', {
        nickname: 'Courier',
        result: {
          matchId: 'roster-rumble',
          winnerId: 'bubba',
          playerStats: new Map([
            ['local', stats],
            ['bubba', { ...stats, kills: 8, deaths: 1 }],
            ['frost', { ...stats, kills: 5 }],
            ['jack', { ...stats, kills: 3, deaths: 5 }],
          ]),
          duration: 120,
          gameMode: 'deathmatch',
          matchKind: 'rumble',
          scores: { local: 4, bubba: 8, frost: 5, jack: 3 },
          playerNicknames: {
            local: 'Courier',
            bubba: 'Big Rig',
            frost: 'Cold Snap',
            jack: 'Hatchet',
          },
          playerCharacters: {
            local: 'rook',
            bubba: 'bubba',
            frost: 'frost_wizard',
            jack: 'jack',
          },
          departedPlayerIds: [],
          awards: [],
          rivalry: null,
          rivalrySet: null,
          isPractice: false,
          nextMapName: 'Scrapyard',
          nextGameMode: 'gun_game',
          wentToOvertime: false,
        },
      });
    }, modernArtAdvertised);

    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('ResultsScene') as {
            children?: {
              list: Array<{
                name?: string;
                text?: string;
                visible?: boolean;
                getData?: (key: string) => unknown;
                list?: Array<{
                  name?: string;
                  text?: string;
                  visible?: boolean;
                  getData?: (key: string) => unknown;
                }>;
              }>;
            };
          };
          const all = (scene?.children?.list ?? []).flatMap((child) => [
            child,
            ...(child.list ?? []),
          ]);
          return {
            portraits: ['local', 'bubba', 'frost', 'jack'].map((id) => {
              const portrait = all.find((child) => child.name === `result-fighter-${id}`);
              return [id, portrait?.getData?.('resultCharacterId'), portrait?.visible];
            }),
            rookLayers: all.filter((child) => child.getData?.('resultCharacterId') === 'rook')
              .length,
            labels: ['ROOK', 'BUBBA', 'FROST WIZARD', 'JACK'].map(
              (label) => all.find((child) => child.text === label)?.text,
            ),
          };
        }),
      )
      .toEqual({
        portraits: [
          ['local', 'rook', true],
          ['bubba', 'bubba', true],
          ['frost', 'frost_wizard', true],
          ['jack', 'jack', true],
        ],
        rookLayers: 2,
        labels: ['ROOK', 'BUBBA', 'FROST WIZARD', 'JACK'],
      });

    const modernTextures = await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('ResultsScene') as {
        children?: {
          list: Array<{
            texture?: { key?: string };
            list?: Array<{ texture?: { key?: string } }>;
          }>;
        };
      };
      return (scene?.children?.list ?? [])
        .flatMap((child) => [child, ...(child.list ?? [])])
        .map((child) => child.texture?.key)
        .filter((key): key is string => Boolean(key));
    });
    expect(modernTextures.includes('reforged-biome-environment-art')).toBe(modernArtAdvertised);
    expect(modernTextures.includes('reforged-fighter-art-i')).toBe(modernArtAdvertised);
    expect(modernTextures.includes('reforged-fighter-art-ii')).toBe(modernArtAdvertised);

    await gamePage.evaluate(() => {
      const scene = (
        window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
      ).game?.scene.getScene('ResultsScene') as {
        scene: { restart: (data: unknown) => void };
      };
      const stats = {
        kills: 6,
        assists: 0,
        deaths: 2,
        shotsFired: 30,
        shotsHit: 18,
        damageDealt: 700,
        damageTaken: 250,
        grenadesThrown: 2,
        killsByWeapon: {
          gun: 6,
          grenade: 0,
          fire: 0,
          shotgun: 0,
          axe: 0,
          pistol: 0,
          punch: 0,
          bat: 0,
          barrel: 0,
        },
        longestKillStreak: 3,
        distanceTraveled: 900,
        hillSeconds: 0,
      };
      scene.scene.restart({
        nickname: 'Courier',
        matchData: { opponents: [{ id: 'rival', nickname: 'Rook' }] },
        result: {
          matchId: 'roster-duel',
          winnerId: 'local',
          playerStats: new Map([
            ['local', stats],
            ['rival', { ...stats, kills: 2, deaths: 6 }],
          ]),
          duration: 90,
          gameMode: 'deathmatch',
          matchKind: 'duel',
          playerCharacters: { local: 'bubba', rival: 'rook' },
          awards: [],
          rivalry: null,
          rivalrySet: null,
          isPractice: false,
          nextMapName: 'Checkpoint Zero',
          nextGameMode: 'koth',
          wentToOvertime: false,
        },
      });
    });

    await expect
      .poll(() =>
        gamePage.evaluate(() => {
          const scene = (
            window as unknown as { game?: { scene: { getScene: (key: string) => unknown } } }
          ).game?.scene.getScene('ResultsScene') as {
            children?: {
              list: Array<{
                active?: boolean;
                getData?: (key: string) => unknown;
                texture?: { key: string };
                x?: number;
                y?: number;
                rotation?: number;
              }>;
            };
          };
          const children = scene?.children?.list ?? [];
          const rookLayers = children.filter(
            (child) => child.getData?.('resultCharacterId') === 'rook',
          );
          const rookBody =
            rookLayers.find((child) => child.texture?.key === 'mighty_man_side_idle') ??
            rookLayers[0];
          const rookHelmet =
            rookLayers.find((child) => child.texture?.key === 'rook-helmet_side_idle') ??
            rookLayers[1];
          const aligned =
            rookBody?.x !== undefined &&
            rookBody.y !== undefined &&
            rookBody.rotation !== undefined &&
            rookHelmet?.x !== undefined &&
            rookHelmet.y !== undefined &&
            rookHelmet.rotation !== undefined
              ? {
                  sameRotation: Math.abs(rookBody.rotation - rookHelmet.rotation) < 0.001,
                  layerOffset: Math.round(
                    Math.hypot(rookBody.x - rookHelmet.x, rookBody.y - rookHelmet.y),
                  ),
                }
              : null;
          return {
            characters: children
              .map((child) => child.getData?.('resultCharacterId'))
              .filter(Boolean)
              .sort(),
            aligned,
          };
        }),
      )
      .toEqual({
        characters: ['bubba', 'rook', 'rook'],
        aligned: { sameRotation: true, layerOffset: modernArtAdvertised ? 0 : 40 },
      });
  });
});
