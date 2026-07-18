import {
  buildReforgedBalanceEvidence,
  buildReforgedRegulationEvidence,
  REFORGED_BALANCE_CONTEXT,
} from '../game/reforged-balance-evidence.js';

const forcedDiagnostics = Object.keys(process.env).filter((key) => key.startsWith('FORCE_'));
if (forcedDiagnostics.length > 0) {
  throw new Error(
    `Deterministic balance evidence rejects FORCE diagnostics: ${forcedDiagnostics.join(', ')}`,
  );
}

const evidence = buildReforgedBalanceEvidence();
const regulations = buildReforgedRegulationEvidence();

process.stdout.write(
  `REFORGED_BALANCE_EVIDENCE ${JSON.stringify({
    context: REFORGED_BALANCE_CONTEXT,
    productCount: evidence.productCount,
    modes: evidence.modes,
    arenas: evidence.arenas,
    regulations,
  })}\n`,
);
