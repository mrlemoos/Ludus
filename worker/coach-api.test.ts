import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./auth', () => ({
  authFor: () => ({ api: { getSession: async () => null } }),
}));
import { positionAt } from '../shared/coaching';
import type { AnalysisLine, SavedCoachMatch } from '../shared/coaching';
import { coachApi } from './coach';
import type { CoachDependencies } from './coach';
import type { CoachEnvironment } from './coach-provider';
import { CoachStore } from './coach-store';
import { reserveCoachReviewCredit, reviewCreditStatus } from './review-credits';

const now = Date.parse('2026-10-30T12:00:00Z');
function lineFor(match: SavedCoachMatch): AnalysisLine {
  const move = positionAt(match.moves, 0).move(match.moves[0]);
  const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
  return {
    ply: 0,
    fen: positionAt(match.moves, 0).fen(),
    engineVersion: 'Stockfish 19 lite',
    perspective: 'side-to-move',
    cp: 20,
    mate: null,
    depth: 12,
    nodes: 1000,
    moves: [uci],
    variations: [[uci]],
  };
}
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync('drizzle')
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  }
  for (const id of ['owner', 'other']) {
    sqlite
      .prepare(
        'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      )
      .run(id, id, `${id}@example.com`, 1, 0, 0);
    sqlite
      .prepare(
        "INSERT INTO player_profiles(user_id,username,language,timezone,chess_level,teaching_profile,adult_attested_at,policy_version,onboarded_at,trial_expires_at) VALUES (?,?,'en-GB','Europe/Madrid','casual','beginner',0,'v1',0,0)",
      )
      .run(id, id);
  }
  function statement(query: string, parameters: unknown[] = []) {
    const bindings = parameters as (string | number | null)[];
    function execute() {
      return {
        meta: { changes: Number(sqlite.prepare(query).run(...bindings).changes) },
      };
    }
    return {
      bind: (...values: unknown[]) => statement(query, values),
      first: async <T>() => (sqlite.prepare(query).get(...bindings) as T) ?? null,
      all: async <T>() => ({ results: sqlite.prepare(query).all(...bindings) as T[] }),
      run: async () => execute(),
      execute,
    };
  }
  const db = {
    prepare: (query: string) => statement(query),
    batch: async (queries: ReturnType<typeof statement>[]) => {
      sqlite.exec('BEGIN');
      try {
        const result = queries.map((query) => query.execute());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  const current: SavedCoachMatch = {
    id: 'match-1',
    moves: ['e4', 'e5', 'Nf3'],
    result: { reason: 'resignation' },
    colour: 'w',
    kind: 'computer',
    completedAt: now,
  };
  const previous: SavedCoachMatch = {
    id: 'earlier-1',
    moves: ['d4', 'd5', 'c4'],
    result: { reason: 'resignation' },
    colour: 'b',
    kind: 'human',
    completedAt: now - 10_000,
  };
  const older2: SavedCoachMatch = {
    id: 'earlier-2',
    moves: ['Nf3', 'd5', 'g3'],
    result: { reason: 'resignation' },
    colour: 'w',
    kind: 'computer',
    completedAt: now - 20_000,
  };
  const older3: SavedCoachMatch = {
    id: 'earlier-3',
    moves: ['c4', 'e5', 'Nc3'],
    result: { reason: 'resignation' },
    colour: 'b',
    kind: 'human',
    completedAt: now - 30_000,
  };
  const matches = new Map([
    [current.id, current],
    [previous.id, previous],
    [older2.id, older2],
    [older3.id, older3],
  ]);
  const generated = {
    summary: 'Develop your pieces.',
    variations: [{ ply: 0, moves: ['e2e4'], explanation: 'Occupy the centre.' }],
    mistakes: [],
  };
  const generate = vi.fn().mockResolvedValue({ document: generated, costMicros: 100 });
  let expiry = 0,
    owner = 'owner',
    selected = 'beginner' as const,
    clock = now;
  let history: { matches: { match: SavedCoachMatch; completedAt: number }[]; gaps: number } = {
    matches: [],
    gaps: 0,
  };
  const dependencies: CoachDependencies = {
    session: async () => (owner ? { id: owner } : null),
    account: async () => ({ trialExpiresAt: expiry, teachingProfile: selected }),
    loadMatch: async (player, id) => (player === 'owner' ? (matches.get(id) ?? null) : null),
    loadHistory: async (player, id, match) =>
      player === owner && match.id === id ? history : { matches: [], gaps: 0 },
    available: async () => true,
    generate,
    now: () => clock,
  };
  const env = {
    DB: db,
    MATCHES: {},
    COACH_MODEL: 'test-model',
    COACH_INPUT_USD_PER_MILLION: '.5',
    COACH_OUTPUT_USD_PER_MILLION: '.5',
  } as unknown as CoachEnvironment;
  return {
    sqlite,
    db,
    env,
    dependencies,
    current,
    previous,
    older2,
    older3,
    matches,
    generated,
    generate,
    setOwner: (value: string) => {
      owner = value;
    },
    setExpiry: (value: number) => {
      expiry = value;
    },
    setHistory: (value: typeof history) => {
      history = value;
    },
    setNow: (value: number) => {
      clock = value;
    },
  };
}
function input(
  key = 'idempotency-key-0001',
  matchId = 'match-1',
  history: { matchId: string; analysis: AnalysisLine[] | null }[] = [],
) {
  return {
    key,
    matchId,
    language: 'en-GB',
    profile: 'beginner',
    analysis: [
      lineFor({
        id: matchId,
        moves: ['e4', 'e5', 'Nf3'],
        result: { reason: 'resignation' },
        colour: 'w',
      }),
    ],
    history,
  };
}
function request(
  path = '/api/coach/reviews',
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
) {
  return new Request(`https://ludus.example${path}`, {
    method,
    headers: { Origin: 'https://ludus.example', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function generateReview(f: ReturnType<typeof fixture>, body = input()) {
  const response = await coachApi(request('/api/coach/reviews', body), f.env, f.dependencies);
  expect(response.status).toBe(200);
  return (
    (await response.json()) as {
      review: { id: string; language: string; profile: string; history?: unknown[] };
    }
  ).review;
}
describe('private engine-grounded coach API', () => {
  it('exposes credit counts, unlimited local-analysis entitlement and five replies per review', async () => {
    const f = fixture();
    const response = await coachApi(request('/api/coach/status'), f.env, f.dependencies);
    await expect(response.json()).resolves.toMatchObject({
      replyLimit: 5,
      reviewCredits: {
        available: 1,
        monthlyFreeRemaining: 0,
        introAvailable: true,
        paidRemaining: 0,
      },
      usage: { reviews: 0, replies: 0 },
    });
  });

  it('validates and sends the current game plus the three chronologically preceding games, omitting private IDs', async () => {
    const f = fixture();
    f.setHistory({
      matches: [
        { match: f.previous, completedAt: now - 10_000 },
        { match: f.older2, completedAt: now - 20_000 },
        { match: f.older3, completedAt: now - 30_000 },
      ],
      gaps: 1,
    });
    const payload = {
      ...input(),
      history: [
        { matchId: f.previous.id, analysis: [lineFor(f.previous)] },
        { matchId: f.older2.id, analysis: null },
        { matchId: f.older3.id, analysis: [lineFor(f.older3)] },
      ],
    };
    await generateReview(f, payload);
    const provider = JSON.stringify(f.generate.mock.calls[0][0]);
    expect(provider).toContain('earlierGame');
    expect(provider).toContain('Stockfish 19 lite');
    expect(provider).toContain('e2e4');
    expect(provider).toContain('d2d4');
    expect(provider).toContain('c2c4');
    const userPrompt = JSON.parse(f.generate.mock.calls[0][0].messages[1].content);
    expect(provider).not.toContain(f.current.id);
    expect(provider).not.toContain(f.previous.id);
    expect(userPrompt.missingHistoryAnalysis).toBe(2);
    const saved = (await new CoachStore(f.db).reviewByMatch('owner', f.current.id))!;
    expect(saved.analysis[0]).toMatchObject({
      fen: lineFor(f.current).fen,
      depth: 12,
      nodes: 1000,
      perspective: 'side-to-move',
      engineVersion: 'Stockfish 19 lite',
      variations: [['e2e4']],
    });
    expect(saved.historyGaps).toBe(2);
    expect(saved.history?.map((entry) => entry.matchId)).toEqual([
      f.previous.id,
      f.older2.id,
      f.older3.id,
    ]);
    expect(saved.history?.[1].analysis).toBeNull();
  });

  it('rejects history omitted or reordered by the browser and rejects forged FEN metadata', async () => {
    const f = fixture();
    f.setHistory({ matches: [{ match: f.previous, completedAt: now - 10_000 }], gaps: 0 });
    expect(
      (await coachApi(request('/api/coach/reviews', input()), f.env, f.dependencies)).status,
    ).toBe(409);
    const forged = input('idempotency-key-0002', 'match-1', [
      {
        matchId: f.previous.id,
        analysis: [{ ...lineFor(f.previous), fen: '8/8/8/8/8/8/8/8 w - - 0 1' }],
      },
    ]);
    expect(
      (await coachApi(request('/api/coach/reviews', forged), f.env, f.dependencies)).status,
    ).toBe(400);
    expect(f.generate).not.toHaveBeenCalled();
  });

  it('returns a saved review for the same match despite a new key or language and never generates or consumes another credit', async () => {
    const f = fixture();
    const saved = await generateReview(f);
    const response = await coachApi(
      request('/api/coach/reviews', {
        ...input('different-idempotency-key-02'),
        language: 'fr-FR',
        analysis: [],
      }),
      f.env,
      f.dependencies,
    );
    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { review: { id: string; language: string } }).review,
    ).toMatchObject({ id: saved.id, language: 'en-GB' });
    expect(f.generate).toHaveBeenCalledTimes(1);
    expect(
      f.sqlite
        .prepare("SELECT COUNT(*) AS count FROM review_credit_reservations WHERE state='committed'")
        .get()?.count,
    ).toBe(1);
    expect(
      (await coachApi(request('/api/coach/matches/match-1/review'), f.env, f.dependencies)).status,
    ).toBe(200);
  });

  it('atomically prevents concurrent generation for a match', async () => {
    const f = fixture();
    let finish!: (value: unknown) => void;
    f.generate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = coachApi(request('/api/coach/reviews', input()), f.env, f.dependencies);
    await vi.waitFor(() => {
      expect(f.generate).toHaveBeenCalledTimes(1);
    });
    const second = await coachApi(
      request('/api/coach/reviews', input('different-idempotency-key-02')),
      f.env,
      f.dependencies,
    );
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({ error: 'review_pending' });
    finish({ document: f.generated, costMicros: 100 });
    expect((await first).status).toBe(200);
    expect(
      f.sqlite
        .prepare("SELECT COUNT(*) AS count FROM review_credit_reservations WHERE state='committed'")
        .get()?.count,
    ).toBe(1);
  });

  it('restores a failed attempt credit and permits retry without duplicate usage', async () => {
    const f = fixture();
    f.generate.mockRejectedValueOnce(new Error('provider outage'));
    expect(
      (await coachApi(request('/api/coach/reviews', input()), f.env, f.dependencies)).status,
    ).toBe(503);
    expect(f.sqlite.prepare('SELECT state FROM review_credit_reservations').get()?.state).toBe(
      'restored',
    );
    await generateReview(f);
    expect(f.generate).toHaveBeenCalledTimes(2);
    expect((await new CoachStore(f.db).usage('owner', now)).reviews).toBe(1);
    expect(
      f.sqlite
        .prepare("SELECT COUNT(*) AS count FROM review_credit_reservations WHERE state='committed'")
        .get()?.count,
    ).toBe(1);
  });

  it('releases an orphaned credit reservation after a crash before request reservation', async () => {
    const f = fixture();
    await expect(
      reserveCoachReviewCredit(f.db, 'owner', 'match-1', 'orphan', now),
    ).resolves.toMatchObject({
      source: 'intro',
    });
    expect((await reviewCreditStatus(f.db, 'owner', now)).introAvailable).toBe(false);
    await new CoachStore(f.db).expire(now + 90_000);
    expect(
      f.sqlite.prepare('SELECT state FROM review_credit_reservations WHERE id=?').get('orphan')
        ?.state,
    ).toBe('restored');
    expect((await reviewCreditStatus(f.db, 'owner', now + 90_000)).introAvailable).toBe(true);
  });

  it('rejects live matches, illegal engine lines, unowned matches and invalid provider suggestions before saving', async () => {
    const f = fixture();
    f.current.result = null;
    expect(
      (await coachApi(request('/api/coach/reviews', input()), f.env, f.dependencies)).status,
    ).toBe(409);
    f.current.result = { reason: 'resignation' };
    expect(
      (
        await coachApi(
          request('/api/coach/reviews', {
            ...input(),
            analysis: [{ ...lineFor(f.current), moves: ['e2e5'], variations: [['e2e5']] }],
          }),
          f.env,
          f.dependencies,
        )
      ).status,
    ).toBe(400);
    f.setOwner('other');
    expect(
      (await coachApi(request('/api/coach/reviews', input()), f.env, f.dependencies)).status,
    ).toBe(404);
    f.setOwner('owner');
    f.generate.mockResolvedValueOnce({
      document: {
        ...f.generated,
        variations: [{ ply: 0, moves: ['e2e5'], explanation: 'Illegal.' }],
      },
      costMicros: 100,
    });
    expect(
      (await coachApi(request('/api/coach/reviews', input()), f.env, f.dependencies)).status,
    ).toBe(503);
    await expect(new CoachStore(f.db).reviews('owner')).resolves.toEqual([]);
  });

  it('allows five successful replies per review for non-Plus accounts and does not count failures', async () => {
    const f = fixture();
    const saved = await generateReview(f);
    f.generate.mockRejectedValueOnce(new Error('temporary outage'));
    const path = `/api/coach/reviews/${saved.id}/replies`;
    const first = await coachApi(
      request(path, { key: 'reply-request-key-0001', question: 'Why?', language: 'en-GB' }),
      f.env,
      f.dependencies,
    );
    expect(first.status).toBe(503);
    for (let index = 1; index <= 5; index++) {
      const result = await coachApi(
        request(path, {
          key: `reply-request-key-000${index + 1}`,
          question: `Why ${index}?`,
          language: 'en-GB',
        }),
        f.env,
        f.dependencies,
      );
      expect(result.status).toBe(200);
    }
    const extra = await coachApi(
      request(path, { key: 'reply-request-key-0007', question: 'One more?', language: 'en-GB' }),
      f.env,
      f.dependencies,
    );
    expect(extra.status).toBe(429);
    await expect(extra.json()).resolves.toMatchObject({ error: 'reply_limit' });
  });

  it('keeps legacy saved reviews conversational without inventing missing engine metadata', async () => {
    const f = fixture();
    const reviewId = 'legacy-review';
    const legacyLine = { ply: 0, cp: 20, mate: null, moves: ['e2e4'], depth: 12 };
    await f.db
      .prepare(
        'INSERT INTO coach_reviews(id,owner,match_id,language,profile,document,analysis,created_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .bind(
        reviewId,
        'owner',
        f.current.id,
        'en-GB',
        'beginner',
        JSON.stringify(f.generated),
        JSON.stringify([legacyLine]),
        now - 10_000,
      )
      .run();
    const response = await coachApi(
      request(`/api/coach/reviews/${reviewId}/replies`, {
        key: 'legacy-reply-key-0001',
        question: 'Why?',
        language: 'en-GB',
      }),
      f.env,
      f.dependencies,
    );
    expect(response.status).toBe(200);
    const prompt = JSON.parse(f.generate.mock.calls[0][0].messages[1].content);
    expect(prompt.currentMatch.engineAnalysis[0]).toMatchObject({
      engineVersion: null,
      perspective: null,
      nodes: null,
      depth: 12,
      fen: lineFor(f.current).fen,
      candidateVariations: [['e2e4']],
    });
  });

  it('requires only the lifetime intro credit when no trial or purchased pack exists', async () => {
    const f = fixture();
    await generateReview(f);
    await expect(
      (await coachApi(request('/api/coach/status'), f.env, f.dependencies)).json(),
    ).resolves.toMatchObject({ reviewCredits: { available: 0, introAvailable: false } });
    f.matches.set('match-2', { ...f.current, id: 'match-2' });
    const exhausted = await coachApi(
      request('/api/coach/reviews', input('another-match-key-0001', 'match-2')),
      f.env,
      f.dependencies,
    );
    expect(exhausted.status).toBe(402);
  });

  it('serves bounded owned history without exposing unfinished matches', async () => {
    const f = fixture();
    f.setHistory({ matches: [{ match: f.previous, completedAt: now - 10_000 }], gaps: 2 });
    const response = await coachApi(
      request('/api/coach/matches/match-1/history'),
      f.env,
      f.dependencies,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      gaps: 2,
      matches: [{ id: 'match-1' }, { id: 'earlier-1', completedAt: now - 10_000 }],
    });
    f.setOwner('other');
    expect(
      (await coachApi(request('/api/coach/matches/match-1/history'), f.env, f.dependencies)).status,
    ).toBe(404);
  });

  it('loads the three nearest completed matches across computer and human records in completion order', async () => {
    const f = fixture();
    f.dependencies.loadHistory = undefined;
    const candidates: SavedCoachMatch[] = [
      { ...f.previous, id: 'older-computer', kind: 'computer', completedAt: now - 20_000 },
      { ...f.older2, id: 'newest-human', kind: 'human', completedAt: now - 2000 },
      { ...f.older3, id: 'middle-computer', kind: 'computer', completedAt: now - 5000 },
      { ...f.previous, id: 'oldest-human', kind: 'human', completedAt: now - 30_000 },
    ];
    for (const game of candidates) {
      f.matches.set(game.id, game);
    }
    for (const game of candidates.filter((item) => item.kind === 'computer')) {
      await f.db
        .prepare(
          'INSERT INTO matches(id,owner,created_at,result,control,difficulty,colour,finished_at) VALUES(?,?,? ,?,?,1,?,?)',
        )
        .bind(
          game.id,
          'owner',
          game.completedAt,
          JSON.stringify(game.result),
          '5+3',
          game.colour,
          game.completedAt,
        )
        .run();
    }
    for (const game of candidates.filter((item) => item.kind === 'human')) {
      await f.db
        .prepare(
          'INSERT INTO online_matches(id,white_id,black_id,control,rated,result,finished_at) VALUES(?,?,?,?,0,?,?)',
        )
        .bind(
          game.id,
          game.colour === 'w' ? 'owner' : 'other',
          game.colour === 'b' ? 'owner' : 'other',
          '5+3',
          JSON.stringify(game.result),
          game.completedAt,
        )
        .run();
    }
    const response = await coachApi(
      request('/api/coach/matches/match-1/history'),
      f.env,
      f.dependencies,
    );
    expect(
      ((await response.json()) as { matches: { id: string }[]; gaps: number }).matches.map(
        ({ id }) => id,
      ),
    ).toEqual(['match-1', 'newest-human', 'middle-computer', 'older-computer']);
  });
});
