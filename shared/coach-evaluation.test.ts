import { evaluateCoach, modelApproved } from './coach-evaluation';
import type { EvaluationObservation } from './coach-evaluation';
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
  it('coachFixtures, fixed corpus, contains forty distinct positions', () => {
    // Arrange
    const fixtures = coachFixtures;

    // Act
    const distinct = new Set(fixtures.map((position) => position.fen)).size;

    // Assert
    expect(fixtures).toHaveLength(40);
    expect(distinct).toBe(40);
  });

  it.each([
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3',
    'rnbqkbnr/ppp2ppp/3p4/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3',
    'rn1qkbnr/ppp2ppp/3p4/4p3/3PP1b1/5N2/PPP2PPP/RNBQKB1R w KQkq - 1 4',
    'rn1qkbnr/ppp2ppp/3p4/4P3/4P1b1/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 4',
    'rn1qkbnr/ppp2ppp/3p4/4P3/4P3/5b2/PPP2PPP/RNBQKB1R w KQkq - 0 5',
    'rn1qkbnr/ppp2ppp/3p4/4P3/4P3/5Q2/PPP2PPP/RNB1KB1R b KQkq - 0 5',
    'rn1qkbnr/ppp2ppp/8/4p3/4P3/5Q2/PPP2PPP/RNB1KB1R w KQkq - 0 6',
    'rn1qkbnr/ppp2ppp/8/4p3/2B1P3/5Q2/PPP2PPP/RNB1K2R b KQkq - 1 6',
    'rn1qkb1r/ppp2ppp/5n2/4p3/2B1P3/5Q2/PPP2PPP/RNB1K2R w KQkq - 2 7',
    'rn1qkb1r/ppp2ppp/5n2/4p3/2B1P3/1Q6/PPP2PPP/RNB1K2R b KQkq - 3 7',
    'rn2kb1r/ppp1qppp/5n2/4p3/2B1P3/1Q6/PPP2PPP/RNB1K2R w KQkq - 4 8',
    'rn2kb1r/ppp1qppp/5n2/4p3/2B1P3/1QN5/PPP2PPP/R1B1K2R b KQkq - 5 8',
    'rn2kb1r/pp2qppp/2p2n2/4p3/2B1P3/1QN5/PPP2PPP/R1B1K2R w KQkq - 0 9',
    'rn2kb1r/pp2qppp/2p2n2/4p1B1/2B1P3/1QN5/PPP2PPP/R3K2R b KQkq - 1 9',
    'rn2kb1r/p3qppp/2p2n2/1p2p1B1/2B1P3/1QN5/PPP2PPP/R3K2R w KQkq - 0 10',
    'rn2kb1r/p3qppp/2p2n2/1N2p1B1/2B1P3/1Q6/PPP2PPP/R3K2R b KQkq - 0 10',
    'rn2kb1r/p3qppp/5n2/1p2p1B1/2B1P3/1Q6/PPP2PPP/R3K2R w KQkq - 0 11',
    'rn2kb1r/p3qppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/R3K2R b KQkq - 0 11',
    'r3kb1r/p2nqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/R3K2R w KQkq - 1 12',
    'r3kb1r/p2nqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR3R b kq - 2 12',
    '3rkb1r/p2nqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR3R w k - 3 13',
    '3rkb1r/p2Rqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2K4R b k - 0 13',
    '4kb1r/p2rqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2K4R w k - 0 14',
    '4kb1r/p2rqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR4 b k - 1 14',
    '4kb1r/p2r1ppp/4qn2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 2 15',
    '4kb1r/p2B1ppp/4qn2/4p1B1/4P3/1Q6/PPP2PPP/2KR4 b k - 0 15',
    '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16',
    '1Q2kb1r/p2n1ppp/4q3/4p1B1/4P3/8/PPP2PPP/2KR4 b k - 1 16',
    '1n2kb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2KR4 w k - 0 17',
    'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
    'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2',
    'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2',
    'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
    'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR b KQkq - 1 3',
    'rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4',
    'rnbqkb1r/ppp2ppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR b KQkq - 3 4',
    'rnbqk2r/ppp1bppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR w KQkq - 4 5',
  ])('coach fixture %s, in the fixed corpus, is not over', (fen) => {
    // Arrange
    const position = new Chess(fen);

    // Act
    const over = position.isGameOver();

    // Assert
    expect(over).toBe(false);
  });

  it('observations, full profile and language matrix, contains 480 rows', () => {
    // Arrange
    const rows = observations();

    // Act
    const count = rows.length;

    // Assert
    expect(count).toBe(480);
  });

  it('evaluateCoach, a complete synthetic matrix, records a passing latency report', async () => {
    // Arrange
    const rows = observations();

    // Act
    const report = await evaluateCoach('synthetic-test-model', rows);

    // Assert
    expect(report).toMatchObject({
      passed: true,
      positions: 40,
      observations: 480,
      medianLatencyMs: 100,
      p95LatencyMs: 100,
    });
  });

  it('modelApproved, the evaluated model and its report, approves the model', async () => {
    // Arrange
    const report = await evaluateCoach('synthetic-test-model', observations());

    // Act
    const approved = await modelApproved('synthetic-test-model', JSON.stringify(report));

    // Assert
    expect(approved).toBe(true);
  });

  it('modelApproved, a different model, rejects the report', async () => {
    // Arrange
    const report = await evaluateCoach('synthetic-test-model', observations());

    // Act
    const approved = await modelApproved('another-model', JSON.stringify(report));

    // Assert
    expect(approved).toBe(false);
  });

  it('modelApproved, a missing report, rejects the model', async () => {
    // Arrange
    const model = 'synthetic-test-model';

    // Act
    const approved = await modelApproved(model, undefined);

    // Assert
    expect(approved).toBe(false);
  });

  it('evaluateCoach, one illegal suggestion, fails the release gate', async () => {
    // Arrange
    const rows = observations();
    rows[0].variations = [['e2e5']];

    // Act
    const report = await evaluateCoach('synthetic-test-model', rows);

    // Assert
    expect(report.passed).toBe(false);
  });

  it('evaluateCoach, one critical factual error, fails the release gate', async () => {
    // Arrange
    const rows = observations();
    rows[0].criticalError = true;

    // Act
    const report = await evaluateCoach('synthetic-test-model', rows);

    // Assert
    expect(report.passed).toBe(false);
  });

  it('requires at least 90 percent rubric pass in each language/profile, not merely overall', async () => {
    // Arrange
    const rows = observations();
    const failing = rows
      .filter((row) => row.language === 'fr-FR' && row.profile === 'beginner')
      .slice(0, 5);
    for (const row of failing) {
      row.rubricPass = false;
    }

    // Act
    const report = await evaluateCoach('synthetic-test-model', rows);

    // Assert
    expect(report.passed).toBe(false);
  });

  it('evaluateCoach, an incomplete matrix, fails the release gate', async () => {
    // Arrange
    const rows = observations().slice(0, 479);

    // Act
    const report = await evaluateCoach('synthetic-test-model', rows);

    // Assert
    expect(report.passed).toBe(false);
  });

  it('evaluateCoach, a duplicated observation, rejects the matrix', async () => {
    // Arrange
    const rows = observations();
    const duplicated = [...rows.slice(0, 479), rows[0]];

    // Act
    const evaluation = evaluateCoach('synthetic-test-model', duplicated);

    // Assert
    await expect(evaluation).rejects.toThrow('invalid_evaluation_observation');
  });

  it('evaluateCoach, an unreviewed rubric, rejects the matrix', async () => {
    // Arrange
    const rows = observations();
    rows[0].rubricPass = null as unknown as boolean;

    // Act
    const evaluation = evaluateCoach('synthetic-test-model', rows);

    // Assert
    await expect(evaluation).rejects.toThrow('invalid_evaluation_observation');
  });

  it('evaluateCoach, one observation above the cost limit, fails the release gate', async () => {
    // Arrange
    const rows = observations();
    rows[0].costUsd = 0.051;

    // Act
    const report = await evaluateCoach('synthetic-test-model', rows);

    // Assert
    expect(report.passed).toBe(false);
  });

  it('evaluateCoach, spending beyond the approved total, fails the release gate', async () => {
    // Arrange
    const rows = observations().map((row) => ({ ...row, costUsd: 0.025 }));

    // Act
    const report = await evaluateCoach('synthetic-test-model', rows);

    // Assert
    expect(report.passed).toBe(false);
  });
});
