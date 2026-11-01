import { Chess } from 'chess.js';
import { isLanguage, type Language } from './waitlist';

export const teachingProfiles = ['beginner', 'developing', 'club', 'advanced'] as const;
export const STOCKFISH_ENGINE_VERSION = 'Stockfish 19 lite';
export type TeachingProfile = typeof teachingProfiles[number];
export const profileInstructions: Record<TeachingProfile, string> = {
  beginner: 'Explain rules and immediate threats in plain language. Define unfamiliar chess terms.',
  developing: 'Explain tactics and simple plans with short concrete variations.',
  club: 'Compare candidate moves and explain positional trade-offs with concrete variations.',
  advanced: 'Use concise variations, precise evaluation and deeper positional reasoning.',
};
export type SavedCoachMatch = { id: string; moves: string[]; result: unknown; colour: 'w' | 'b'; kind?: 'computer' | 'human'; completedAt?: number };
/** Browser supplied and always untrusted, even after the server checks every move. */
export type AnalysisLine = { ply: number; fen: string; engineVersion: string | null; perspective: 'side-to-move' | null; cp: number | null; mate: number | null; moves: string[]; variations: string[][]; depth: number | null; nodes: number | null };
export const mistakeTags = ['hanging-piece', 'missed-tactic', 'king-safety', 'endgame', 'time-management'] as const;
export type MistakeTag = typeof mistakeTags[number];
export type CoachDocument = { summary: string; variations: { ply: number; moves: string[]; explanation: string }[]; mistakes: { ply: number; tag: MistakeTag; explanation: string }[] };
export type SavedReview = { id: string; matchId: string; language: Language; profile: TeachingProfile; document: CoachDocument; createdAt: number; historyGaps?: number };
export type SavedReply = { id: string; reviewId: string; language: Language; question: string; document: CoachDocument; createdAt: number };
export type CoachHistoryInput = { matchId: string; analysis: AnalysisLine[] | null };
export type SavedCoachHistory = { matchId: string; moves: string[]; colour: 'w' | 'b'; result: unknown; kind: 'computer' | 'human'; completedAt: number; analysis: AnalysisLine[] | null };
export type SavedReviewWithAnalysis = SavedReview & { analysis: AnalysisLine[]; history?: SavedCoachHistory[]; historyGaps?: number };
export type CoachInput = { key: string; matchId: string; language: Language; profile: TeachingProfile; analysis: AnalysisLine[]; history: CoachHistoryInput[] };
export const monthKey = (now: number) => new Date(now).toISOString().slice(0, 7);
export function isTeachingProfile(value: unknown): value is TeachingProfile { return teachingProfiles.some((profile) => profile === value); }
export function positionAt(moves: readonly string[], ply: number): Chess {
  if (!Number.isInteger(ply) || ply < 0 || ply > moves.length) throw new Error('invalid_ply');
  const chess = new Chess();
  for (const move of moves.slice(0, ply)) chess.move(move);
  return chess;
}
export function legalVariation(moves: readonly string[], ply: number, variation: readonly string[]): boolean {
  if (variation.length === 0 || variation.length > 16) return false;
  try { const chess = positionAt(moves, ply); for (const move of variation) chess.move(move); return true; } catch { return false; }
}
export function validateAnalysis(match: SavedCoachMatch, input: unknown): AnalysisLine[] | null {
  if (!match.result || !Array.isArray(input) || input.length < 1 || input.length > 300) return null;
  const seen = new Set<number>();
  const output: AnalysisLine[] = [];
  for (const value of input) {
    if (!value || typeof value !== 'object') return null;
    const { ply, fen, engineVersion, perspective, cp, mate, moves, variations, depth, nodes } = value;
    if (!Number.isInteger(ply) || seen.has(ply) || !Number.isInteger(depth) || depth < 1 || depth > 80 ||
      engineVersion !== STOCKFISH_ENGINE_VERSION || perspective !== 'side-to-move' ||
      !Number.isSafeInteger(nodes) || nodes < 1 || nodes > 10_000_000_000 ||
      !(cp === null || Number.isInteger(cp) && Math.abs(cp) <= 100_000) || !(mate === null || Number.isInteger(mate) && Math.abs(mate) <= 1000) ||
      (cp === null) === (mate === null) || !Array.isArray(moves) || !moves.every((move) => typeof move === 'string' && move.length <= 12) || !legalVariation(match.moves, ply, moves) ||
      !Array.isArray(variations) || variations.length < 1 || variations.length > 4 || variations.some((line) => !Array.isArray(line) || !line.every((move) => typeof move === 'string' && move.length <= 12) || !legalVariation(match.moves, ply, line)) ||
      variations[0].join(' ') !== moves.join(' ')) return null;
    let expectedFen: string;
    try { expectedFen = positionAt(match.moves, ply).fen(); } catch { return null; }
    if (fen !== expectedFen) return null;
    seen.add(ply); output.push({ ply, fen, engineVersion, perspective, cp, mate, moves: [...moves], variations: variations.map((line) => [...line]), depth, nodes });
  }
  return output.sort((a, b) => a.ply - b.ply);
}
/** Normalise pre-metadata records loaded from our private review table for follow-up replies only. */
export function validateSavedAnalysis(match: SavedCoachMatch, input: unknown): AnalysisLine[] | null {
  const modern = validateAnalysis(match, input);
  if (modern) return modern;
  if (!match.result || !Array.isArray(input) || input.length < 1 || input.length > 300) return null;
  const output: AnalysisLine[] = [];
  const seen = new Set<number>();
  for (const value of input) {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    // Only accept the exact old shape. Partial or malformed new records stay invalid.
    if (['fen', 'engineVersion', 'perspective', 'variations', 'nodes'].some((key) => key in row)) return null;
    const { ply, cp, mate, moves, depth } = row;
    const validCp = cp === null || typeof cp === 'number' && Number.isInteger(cp) && Math.abs(cp) <= 100_000;
    const validMate = mate === null || typeof mate === 'number' && Number.isInteger(mate) && Math.abs(mate) <= 1000;
    if (!Number.isInteger(ply) || seen.has(ply as number) || (ply as number) < 0 || (ply as number) > match.moves.length ||
      !validCp || !validMate || (cp === null) === (mate === null) ||
      !Array.isArray(moves) || !moves.every((move) => typeof move === 'string' && move.length <= 12) || !legalVariation(match.moves, ply as number, moves)) return null;
    const validDepth = Number.isInteger(depth) && (depth as number) >= 1 && (depth as number) <= 80 ? depth as number : null;
    let fen: string;
    try { fen = positionAt(match.moves, ply as number).fen(); } catch { return null; }
    seen.add(ply as number);
    output.push({ ply: ply as number, fen, engineVersion: null, perspective: null, cp: cp as number | null, mate: mate as number | null, moves: [...moves], variations: [[...moves]], depth: validDepth, nodes: null });
  }
  return output.sort((a, b) => a.ply - b.ply);
}
export function validateDocument(match: SavedCoachMatch, value: unknown, analysis: readonly AnalysisLine[]): CoachDocument | null {
  if (!value || typeof value !== 'object') return null;
  const doc = value as CoachDocument;
  const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  if (!text(doc.summary, 8000) || !Array.isArray(doc.variations) || doc.variations.length > 12 || !Array.isArray(doc.mistakes) || doc.mistakes.length > 12) return null;
  for (const variation of doc.variations) {
    if (!variation || !Array.isArray(variation.moves) || !variation.moves.every((move) => typeof move === 'string' && move.length <= 12) || !text(variation.explanation, 2000) || !legalVariation(match.moves, variation.ply, variation.moves)) return null;
    // Ground each cited branch in a supplied engine candidate, without claiming the browser evaluation is trusted.
    if (!analysis.some((line) => line.ply === variation.ply && line.moves[0] === variation.moves[0])) return null;
  }
  for (const mistake of doc.mistakes) {
    if (!mistake || !Number.isInteger(mistake.ply) || mistake.ply < 1 || mistake.ply > match.moves.length || !mistakeTags.includes(mistake.tag) || mistake.tag === 'time-management' || !text(mistake.explanation, 2000) || !analysis.some((line) => line.ply === mistake.ply - 1)) return null;
  }
  return { summary: doc.summary, variations: doc.variations.map((v) => ({ ply: v.ply, moves: [...v.moves], explanation: v.explanation })), mistakes: doc.mistakes.map((m) => ({ ...m })) };
}
export function parseCoachInput(value: unknown): CoachInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as CoachInput;
  if (typeof input.key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.key) || typeof input.matchId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.matchId) || !isLanguage(input.language) || !isTeachingProfile(input.profile) || !Array.isArray(input.analysis) || !Array.isArray(input.history) || input.history.length > 3) return null;
  if (new Set(input.history.map((item) => item?.matchId)).size !== input.history.length || input.history.some((item) => !item || typeof item.matchId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.matchId) || !(item.analysis === null || Array.isArray(item.analysis)) || item.matchId === input.matchId)) return null;
  return input;
}
export function recurringMistakes(reviews: readonly SavedReview[]) {
  const counts = new Map<MistakeTag, Set<string>>();
  for (const review of reviews) for (const mistake of review.document.mistakes) {
    const matches = counts.get(mistake.tag) ?? new Set<string>(); matches.add(review.matchId); counts.set(mistake.tag, matches);
  }
  return [...counts].filter(([, ids]) => ids.size >= 2).map(([tag, ids]) => ({ tag, matches: ids.size })).sort((a, b) => b.matches - a.matches);
}
export function suggestedProfile(reviews: readonly SavedReview[], selected: TeachingProfile): TeachingProfile | null {
  const distinct = new Set(reviews.filter((review) => review.profile === selected).map((review) => review.matchId));
  const index = teachingProfiles.indexOf(selected);
  return distinct.size >= 10 && index < 3 ? teachingProfiles[index + 1] : null;
}
