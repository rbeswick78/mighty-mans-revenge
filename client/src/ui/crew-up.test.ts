import { describe, expect, it } from 'vitest';
import { crewUpBriefingLabel } from './crew-up.js';

const playerTeams = { local: 'blue', ally: 'blue', rivalA: 'red', rivalB: 'red' } as const;

describe('Crew Up briefing', () => {
  it('celebrates a real human teammate from authoritative side assignments', () => {
    expect(
      crewUpBriefingLabel(
        {
          opponents: [
            { id: 'ally', nickname: 'Bravo' },
            { id: 'rivalA', nickname: 'Scrapjaw' },
          ],
          playerTeams,
        },
        'local',
      ),
    ).toBe('HUMAN ALLY: BRAVO // CREWED UP');
  });

  it('calls out Rusty when the ally window used its bot fallback', () => {
    expect(
      crewUpBriefingLabel(
        {
          opponents: [{ id: 'bot:rusty', nickname: 'Rusty' }],
          playerTeams: { local: 'blue', 'bot:rusty': 'blue' },
        },
        'local',
      ),
    ).toBe('ALLY: RUSTY // RUSTY FILLED IN');
  });

  it('stays silent without local side authority or an assigned ally', () => {
    expect(crewUpBriefingLabel({ opponents: [], playerTeams }, null)).toBeNull();
    expect(crewUpBriefingLabel({ opponents: [], playerTeams }, 'local')).toBeNull();
    expect(crewUpBriefingLabel({ opponents: [], playerTeams: undefined }, 'local')).toBeNull();
  });
});
