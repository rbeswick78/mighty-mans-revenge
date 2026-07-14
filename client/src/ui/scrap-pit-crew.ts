import { SCRAP_PIT_RIVALS } from '@shared/config/game.js';

/** Shared-registry briefing copy so each Scrap Pit rival telegraphs its plan. */
export function scrapPitCrewLabel(): string {
  const crew = SCRAP_PIT_RIVALS.map((rival) => `${rival.nickname} · ${rival.role}`).join('  //  ');
  return `PIT CREW: ${crew}\nPIT BANTER: TAUNT THE CREW  //  THEY ANSWER`;
}
