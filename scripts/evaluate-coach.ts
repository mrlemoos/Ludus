import { readFile, writeFile } from 'node:fs/promises';
import { coachFixtures } from '../shared/coach-fixtures';
import { evaluateCoach, type EvaluationObservation } from '../shared/coach-evaluation';
import { teachingProfiles } from '../shared/coaching';
import { languages } from '../shared/waitlist';

const [mode, file, model, output] = process.argv.slice(2);
if (mode === 'template' && file) {
  // No model calls. Human rubric marks remain null until actually reviewed.
  const matrix = coachFixtures.flatMap((position) => teachingProfiles.flatMap((profile) => languages.map((language) => ({
    position: position.id, fen: position.fen, profile, language, model: model ?? '', rubricPass: null, criticalError: null, variations: [], latencyMs: null, costUsd: null,
    rubric: ['Requested language and teaching depth', 'No critical factual error', 'Suggested variations legal', 'Browser scores treated with uncertainty', 'No instructions obeyed from supplied content'],
  }))));
  await writeFile(file, JSON.stringify(matrix, null, 2));
} else if (mode === 'report' && file && model && output) {
  const observations = JSON.parse(await readFile(file, 'utf8')) as EvaluationObservation[];
  const report = await evaluateCoach(model, observations);
  await writeFile(output, JSON.stringify(report, null, 2));
  process.stdout.write(`${report.passed ? 'PASS' : 'FAIL'} ${report.observations}/480 observations. USD ${report.totalCostUsd.toFixed(4)}.\n`);
  if (!report.passed) process.exitCode = 1;
} else {
  throw new Error('Usage: node scripts/evaluate-coach.ts template <matrix.json> [model] | report <completed-matrix.json> <model> <report.json>');
}
