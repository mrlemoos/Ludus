import type { SavedCoachMatch } from '../shared/coaching';
import { loadCoachHistory } from './coach-history';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';

function match(id: string, completedAt: number): SavedCoachMatch  { return ({
  id,
  completedAt,
  moves: ['e4'],
  colour: 'w',
  result: { reason: 'resignation' },
}); }
function database(known: { id: string; finished_at: number }[], legacy: { id: string }[] = []) {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        all: async () => ({ results: sql.includes('LIMIT 33') ? legacy : known }),
      })),
    })),
  } as unknown as D1Database;
}

describe('coach history', () => {
  it('selects only owned finished matches strictly before the reviewed match in SQLite', async () => {
    const sqlite = new DatabaseSync(':memory:');
    for (const file of readdirSync('drizzle')
      .filter((name) => name.endsWith('.sql'))
      .sort())
      {sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));}
    for (const id of ['owner', 'other'])
      {sqlite
        .prepare(
          'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,1,0,0)',
        )
        .run(id, id, `${id}@example.test`);}
    for (const [id, owner, finished] of [
      ['old', 'owner', 300],
      ['later', 'owner', 600],
      ['other', 'other', 400],
    ] as const) {
      sqlite
        .prepare('INSERT INTO matches(id,owner,created_at,result,finished_at) VALUES(?,?,0,?,?)')
        .run(id, owner, '{}', finished);
    }
    sqlite
      .prepare(
        "INSERT INTO online_matches(id,white_id,black_id,control,rated,result,finished_at) VALUES('human','other','owner','5+3',0,'{}',450)",
      )
      .run();
    const db = {
      prepare: (query: string) => ({
        bind: (...values: (string | number)[]) => ({
          all: async () => ({ results: sqlite.prepare(query).all(...values) }),
        }),
      }),
    } as unknown as D1Database;
    const load = vi.fn(async (_owner: string, id: string) => match(id, id === 'human' ? 450 : 300));
    const result = await loadCoachHistory(db, 'owner', match('current', 500), load);
    expect(result.matches.map((item) => item.match.id)).toEqual(['human', 'old']);
    expect(load.mock.calls.map((call) => call[1])).toEqual(['human', 'old']);
    sqlite.close();
  });

  it('uses actual completion order across legacy snapshots and excludes later matches', async () => {
    const db = database(
      [
        { id: 'a', finished_at: 400 },
        { id: 'b', finished_at: 300 },
        { id: 'c', finished_at: 200 },
      ],
      [{ id: 'legacy' }, { id: 'later' }],
    );
    const snapshots = [
      match('a', 400),
      match('b', 300),
      match('c', 200),
      match('legacy', 450),
      match('later', 600),
    ];
    const result = await loadCoachHistory(db, 'owner', match('current', 500), async (owner, id) => {
      expect(owner).toBe('owner');
      return snapshots.find((item) => item.id === id) ?? null;
    });
    expect(result.matches.map((item) => item.match.id)).toEqual(['legacy', 'a', 'b']);
    expect(result.gaps).toBe(0);
  });

  it('does not invent gaps for a player with fewer than three previous games', async () => {
    const result = await loadCoachHistory(
      database([]),
      'owner',
      match('current', 500),
      async () => null,
    );
    expect(result).toEqual({ matches: [], gaps: 0 });
  });

  it('discloses unavailable history rather than claiming older snapshots are the latest', async () => {
    const result = await loadCoachHistory(
      database([
        { id: 'missing', finished_at: 400 },
        { id: 'available', finished_at: 300 },
      ]),
      'owner',
      match('current', 500),
      async (_owner, id) => (id === 'available' ? match(id, 300) : null),
    );
    expect(result).toEqual({ matches: [], gaps: 2 });
  });

  it('bounds legacy recovery and performs no unbounded Durable Object reads', async () => {
    const load = vi.fn();
    const result = await loadCoachHistory(
      database(
        [],
        Array.from({ length: 33 }, (_, i) => ({ id: `old-${i}` })),
      ),
      'owner',
      match('current', 500),
      load,
    );
    expect(result).toEqual({ matches: [], gaps: 3 });
    expect(load).not.toHaveBeenCalled();
  });
});
