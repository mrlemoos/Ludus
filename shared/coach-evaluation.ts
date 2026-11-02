import { coachFixtures } from './coach-fixtures';
import { type TeachingProfile, teachingProfiles } from './coaching';
import { type Language, languages } from './waitlist';
import { Chess } from 'chess.js';
export type EvaluationObservation = {
  position: string;
  profile: TeachingProfile;
  language: Language;
  rubricPass: boolean;
  criticalError: boolean;
  variations: string[][];
  latencyMs: number;
  costUsd: number;
  model: string;
};
export type EvaluationReport = {
  version: 1;
  model: string;
  corpusHash: string;
  positions: number;
  observations: number;
  groups: { profile: TeachingProfile; language: Language; count: number; passRate: number }[];
  allLegal: boolean;
  criticalErrors: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  totalCostUsd: number;
  maxCostUsd: number;
  passed: boolean;
  evaluatedAt: string;
};
export async function corpusHash(): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(coachFixtures)),
  );
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function evaluateCoach(
  model: string,
  observations: EvaluationObservation[],
  now = Date.now(),
): Promise<EvaluationReport> {
  const seen = new Set<string>();
  let allLegal = true;
  const groups = teachingProfiles.flatMap((profile) =>
    languages.map((language) => {
      const rows = observations.filter(
        (row) => row.profile === profile && row.language === language,
      );
      return {
        profile,
        language,
        count: rows.length,
        passRate: rows.length ? rows.filter((row) => row.rubricPass).length / rows.length : 0,
      };
    }),
  );
  for (const row of observations) {
    const fixture = coachFixtures.find((position) => position.id === row.position);
    const key = `${row.position}:${row.profile}:${row.language}`;
    if (
      !fixture ||
      seen.has(key) ||
      row.model !== model ||
      !teachingProfiles.includes(row.profile) ||
      !languages.includes(row.language) ||
      !Number.isFinite(row.latencyMs) ||
      row.latencyMs <= 0 ||
      !Number.isFinite(row.costUsd) ||
      row.costUsd < 0 ||
      typeof row.rubricPass !== 'boolean' ||
      typeof row.criticalError !== 'boolean' ||
      !Array.isArray(row.variations)
    )
      throw new Error('invalid_evaluation_observation');
    seen.add(key);
    for (const line of row.variations) {
      if (!Array.isArray(line) || !line.length || line.length > 16) {
        allLegal = false;
        continue;
      }
      try {
        const chess = new Chess(fixture.fen);
        for (const move of line) chess.move(move);
      } catch {
        allLegal = false;
      }
    }
  }
  const latencies = observations.map((row) => row.latencyMs).sort((a, b) => a - b);
  const totalCostUsd = observations.reduce((sum, row) => sum + row.costUsd, 0);
  const maxCostUsd = Math.max(0, ...observations.map((row) => row.costUsd));
  const criticalErrors = observations.filter((row) => row.criticalError).length;
  const passed =
    observations.length === 480 &&
    groups.every((group) => group.count === 40 && group.passRate >= 0.9) &&
    allLegal &&
    criticalErrors === 0 &&
    totalCostUsd <= 10 &&
    maxCostUsd <= 0.05;
  return {
    version: 1,
    model,
    corpusHash: await corpusHash(),
    positions: coachFixtures.length,
    observations: observations.length,
    groups,
    allLegal,
    criticalErrors,
    medianLatencyMs: latencies[Math.floor(latencies.length / 2)] ?? 0,
    p95LatencyMs: latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)] ?? 0,
    totalCostUsd,
    maxCostUsd,
    passed,
    evaluatedAt: new Date(now).toISOString(),
  };
}
export async function modelApproved(
  model: string | undefined,
  json: string | undefined,
): Promise<boolean> {
  if (!model || !json) return false;
  try {
    const report = JSON.parse(json) as EvaluationReport;
    return (
      report.version === 1 &&
      report.model === model &&
      report.corpusHash === (await corpusHash()) &&
      report.passed === true &&
      report.positions >= 40 &&
      report.observations >= 480 &&
      report.allLegal === true &&
      report.criticalErrors === 0 &&
      report.totalCostUsd <= 10 &&
      report.maxCostUsd <= 0.05 &&
      Number.isFinite(report.medianLatencyMs) &&
      report.medianLatencyMs > 0 &&
      Number.isFinite(report.p95LatencyMs) &&
      report.p95LatencyMs >= report.medianLatencyMs &&
      teachingProfiles.every((profile) =>
        languages.every((language) =>
          report.groups.some(
            (group) =>
              group.profile === profile &&
              group.language === language &&
              group.count >= 40 &&
              group.passRate >= 0.9,
          ),
        ),
      )
    );
  } catch {
    return false;
  }
}
