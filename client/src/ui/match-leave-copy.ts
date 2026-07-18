import type { PracticeKind } from '@shared/config/game.js';
import type { MatchKind } from '@shared/types/game.js';

export interface MatchMenuContext {
  matchKind?: MatchKind;
  practiceKind?: PracticeKind;
}

export interface MatchLeaveCopy {
  headline: string;
  detail: string;
}

export function matchLeaveCopy(context: MatchMenuContext): MatchLeaveCopy {
  if (context.practiceKind === 'gauntlet' || context.practiceKind === 'daily') {
    return {
      headline: 'ABANDON THIS RUN?',
      detail: 'CURRENT RUN PROGRESS WILL END. RETURN TO THE OUTPOST?',
    };
  }
  if (context.practiceKind === 'crew_battle') {
    return {
      headline: 'LEAVE YOUR CREW?',
      detail: 'THE CREW BATTLE WILL END FOR EVERYONE IN THIS PRACTICE GROUP.',
    };
  }
  if (context.practiceKind) {
    return {
      headline: 'END PRACTICE?',
      detail: 'THIS PRACTICE FIGHT WILL END AND RETURN TO THE OUTPOST.',
    };
  }
  if (context.matchKind === 'rumble') {
    return {
      headline: 'LEAVE THE RUMBLE?',
      detail: 'YOU WILL BE ELIMINATED. THE OTHER FIGHTERS KEEP GOING.',
    };
  }
  if (context.matchKind === 'battle_royale') {
    return {
      headline: 'LEAVE BATTLE ROYALE?',
      detail: 'YOU WILL BE ELIMINATED. YOUR SERVER-AUTHORED PLACEMENT IS FINAL.',
    };
  }
  return {
    headline: 'FORFEIT THIS FIGHT?',
    detail: 'YOUR OPPONENT WILL TAKE THE WIN. THIS CANNOT BE UNDONE.',
  };
}
