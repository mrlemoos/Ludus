import type { Control } from './game';
export type QueueEntry = { user: string; control: Control; rated: boolean; rating: number; joinedAt: number; token: string };
export type Assignment = { id: string; players: { w: string; b: string }; control: Control; rated: boolean; createdAt: number };
export type QueueState = { status: 'computer'; id: string } | { status: 'queued'; entry: QueueEntry } | { status: 'assigned'; match: Assignment } | { status: 'invited'; token: string; expiresAt: number } | { status: 'idle' };
export function ratingTolerance(wait: number) { return Math.min(600, 200 + Math.floor(Math.max(0, wait) / 15_000) * 100); }
export function matchingOpponent(entry: QueueEntry, entries: QueueEntry[], now: number) {
  return entries.filter((other) => other.user !== entry.user && other.control === entry.control && other.rated === entry.rated && (!entry.rated || Math.abs(other.rating - entry.rating) <= Math.min(ratingTolerance(now - other.joinedAt), ratingTolerance(now - entry.joinedAt))))
    .sort((a, b) => a.joinedAt - b.joinedAt || a.user.localeCompare(b.user))[0] ?? null;
}
export function canAcceptAI(entry: QueueEntry, token: string, now: number) { return entry.token === token && now - entry.joinedAt >= 30_000; }
