import {
  type EvaluationObservation,
  evaluateCoach,
  modelApproved,
} from './coach-evaluation';
import { coachFixtures } from './coach-fixtures';
import { teachingProfiles } from './coaching';
import { languages } from './waitlist';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

// Synthetic observations test the gate, never select or certify an actual model.
function observations(): EvaluationObservation[] {
  return coachFixtures.flatMap((fixture) =>
    teachingProfiles.flatMap((profile) =>
      languages.map((language) => {
        const move = new Chess(fixture.fen).moves({ verbose: true })[0];
        return {
          position: fixture.id,
          profile,
          language,
          model: 'synthetic-test-model',
          rubricPass: true,
          criticalError: false,
          variations: [[move.from + move.to + (move.promotion ?? '')]],
          latencyMs: 100,
          costUsd: 0.001,
        };
      }),
    ),
  );
}
describe('coach model evaluation release gate', () => {
  it('has forty fixed distinct legal positions and a complete 480-cell matrix', () => {
    expect(coachFixtures).toHaveLength(40);
    expect(new Set(coachFixtures.map((position) => position.fen)).size).toBe(40);
    for (const fixture of coachFixtures) expect(new Chess(fixture.fen).isGameOver()).toBe(false);
    expect(observations()).toHaveLength(480);
  });
  it('records latency, cost and per-language/profile quality before approving exactly the evaluated model', async () => {
    const report = await evaluateCoach('synthetic-test-model', observations());
    expect(report).toMatchObject({
      passed: true,
      positions: 40,
      observations: 480,
      medianLatencyMs: 100,
      p95LatencyMs: 100,
    });
    expect(await modelApproved('synthetic-test-model', JSON.stringify(report))).toBe(true);
    expect(await modelApproved('another-model', JSON.stringify(report))).toBe(false);
    expect(await modelApproved('synthetic-test-model', undefined)).toBe(false);
  });
  it('rejects a single illegal suggestion or critical factual error', async () => {
    const illegal = observations();
    illegal[0].variations = [['e2e5']];
    expect((await evaluateCoach('synthetic-test-model', illegal)).passed).toBe(false);
    const critical = observations();
    critical[0].criticalError = true;
    expect((await evaluateCoach('synthetic-test-model', critical)).passed).toBe(false);
  });
  it('requires at least 90 percent rubric pass in each language/profile, not merely overall', async () => {
    const rows = observations();
    rows
      .filter((row) => row.language === 'fr-FR' && row.profile === 'beginner')
      .slice(0, 5)
      .forEach((row) => {
        row.rubricPass = false;
      });
    expect((await evaluateCoach('synthetic-test-model', rows)).passed).toBe(false);
  });
  it('rejects incomplete, duplicate and unreviewed results and spending beyond approved limits', async () => {
    const rows = observations();
    expect((await evaluateCoach('synthetic-test-model', rows.slice(0, 479))).passed).toBe(false);
    await expect(
      evaluateCoach('synthetic-test-model', [...rows.slice(0, 479), rows[0]]),
    ).rejects.toThrow('invalid_evaluation_observation');
    const unreviewed = observations();
    unreviewed[0].rubricPass = null as unknown as boolean;
    await expect(evaluateCoach('synthetic-test-model', unreviewed)).rejects.toThrow(
      'invalid_evaluation_observation',
    );
    const expensive = observations();
    expensive[0].costUsd = 0.051;
    expect((await evaluateCoach('synthetic-test-model', expensive)).passed).toBe(false);
    expect(
      (
        await evaluateCoach(
          'synthetic-test-model',
          observations().map((row) => ({ ...row, costUsd: 0.025 })),
        )
      ).passed,
    ).toBe(false);
  });
});
