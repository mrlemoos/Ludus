import { expect, test } from '@playwright/test';

const id = '11111111-1111-4111-8111-111111111111';
const review = {
  id: 'saved-review',
  matchId: id,
  language: 'es-ES',
  profile: 'beginner',
  createdAt: Date.UTC(2026, 9, 30),
  document: {
    summary: 'Desarrolla las piezas antes de atacar.',
    variations: [{ ply: 0, moves: ['e2e4', 'e7e5'], explanation: 'Ocupa el centro.' }],
    mistakes: [],
  },
};
const status = {
  available: false,
  reviewCredits: { available: 1, monthlyFreeRemaining: 0, introAvailable: false, paidRemaining: 1 },
  replyLimit: 5,
  usage: { reviews: 1, replies: 0 },
  profile: 'beginner',
  suggestedProfile: null,
  recurring: [],
  reviews: [review],
};
test('saved review survives model outage, preserves language and replays legal variations', async ({
  page,
}) => {
  const writes: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('ludus-language', 'en-GB');
  });
  await page.route('**/api/coach/**', async (route) => {
    if (route.request().method() !== 'GET') {
      writes.push(route.request().url());
    }
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/status')) {
      return route.fulfill({ json: status });
    }
    if (path.endsWith(`/matches/${id}/review`)) {
      return route.fulfill({ json: { review, replies: [] } });
    }
    if (path.endsWith(`/matches/${id}`)) {
      return route.fulfill({
        json: {
          match: { id, moves: ['e4', 'e5', 'Nf3'], colour: 'w', result: { reason: 'resignation' } },
        },
      });
    }
    return route.fulfill({ json: { review, replies: [] } });
  });
  await page.goto(`/coach/${id}`);
  await expect(page.getByRole('heading', { name: 'Review with Lucía' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Generate AI coach review · 1 credit', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(review.document.summary, { exact: true })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Spanish');
  await page.getByRole('button', { name: '1. e2e4 e7e5', exact: true }).click();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.locator('[data-square="e4"]')).toHaveAccessibleName(/White Pawn/);
  await page.getByRole('button', { name: 'Before variation', exact: true }).click();
  await expect(page.locator('[data-square="e2"]')).toHaveAccessibleName(/White Pawn/);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: 'Français' }).click();
  await expect(page.getByRole('heading', { name: 'Analyse avec Lucía' })).toBeVisible();
  await expect(page.getByText(review.document.summary, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/coach-saved-mobile.png', fullPage: true });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
test('conversation outage retries manually with one stable request key', async ({ page }) => {
  const requests: { key: string; language: string }[] = [];
  const replies: unknown[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('ludus-language', 'en-GB');
  });
  await page.route('**/api/coach/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      requests.push(body);
      if (requests.length === 1) {
        return route.fulfill({ status: 503, json: { error: 'coach_unavailable' } });
      }
      const reply = {
        id: 'reply-1',
        reviewId: review.id,
        language: body.language,
        question: body.question,
        createdAt: Date.now(),
        document: {
          summary: 'Developing brings more pieces into the centre.',
          variations: [],
          mistakes: [],
        },
      };
      replies.push(reply);
      return route.fulfill({ json: { reply } });
    }
    if (path.endsWith('/status')) {
      return route.fulfill({ json: { ...status, available: true } });
    }
    if (path.endsWith(`/matches/${id}/review`)) {
      return route.fulfill({ json: { review, replies } });
    }
    if (path.endsWith(`/matches/${id}`)) {
      return route.fulfill({
        json: {
          match: { id, moves: ['e4', 'e5'], colour: 'w', result: { reason: 'resignation' } },
        },
      });
    }
    return route.fulfill({ json: { review, replies } });
  });
  await page.goto(`/coach/${id}`);
  await page.getByLabel('Ask Lucía about this review').fill('Why develop first?');
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Coaching is unavailable');
  expect(requests).toHaveLength(1);
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  await expect(
    page.getByText('Developing brings more pieces into the centre.', { exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0].key).toBe(requests[1].key);
  expect(requests[1].language).toBe('en-GB');
});
test('real unconfigured coach returns unavailable without consuming quota', async ({
  page,
  baseURL,
}) => {
  const { origin } = new URL(baseURL!);
  const signIn = await page.request.post('/api/dev/sign-in', {
    headers: { Origin: origin },
    data: {},
  });
  expect(signIn.ok()).toBe(true);
  const { url } = await signIn.json();
  await page.goto(url);
  const current = await page.request.get('/api/account').then((response) => response.json());
  if (!current.profile) {
    const setup = await page.request.post('/api/account', {
      headers: { Origin: origin },
      data: {
        username: 'CoachBrowserPlayer',
        language: 'en-GB',
        timezone: 'Europe/Madrid',
        chessLevel: 'casual',
        teachingProfile: 'beginner',
        adult: true,
        activityPublic: true,
      },
    });
    expect(setup.ok()).toBe(true);
  }
  const before = await page.request.get('/api/coach/status');
  expect(before.ok()).toBe(true);
  const saved = await before.json();
  expect(saved.available).toBe(false);
  const after = await page.request.get('/api/coach/status').then((response) => response.json());
  expect(after.usage).toEqual(saved.usage);
});

test('local engine analysis remains available during model outage without review writes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('ludus-language', 'en-GB');
    localStorage.setItem('ludus-board', '2d');
  });
  await page.goto('/play');
  await page.getByRole('button', { name: 'Sign in as dev' }).click();
  await expect(page.getByRole('heading', { name: 'Take a seat.' })).toBeVisible();
  const entries = await page.request.get('/api/games').then((r) => r.json());
  let matchId: string | undefined;
  for (const entry of entries) {
    if (!entry.result) {
      continue;
    }
    const { game } = await page.request.get(`/api/games/${entry.id}`).then((r) => r.json());
    if (game.moves.length > 0 && game.moves.length <= 12) {
      matchId = game.id;
      break;
    }
  }
  if (!matchId) {
    // Build an owned finished position using the real API/socket, without a coach request.
    await page.getByRole('button', { name: 'Start game' }).click();
    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e4"]').click();
    await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
    matchId = new URL(page.url()).searchParams.get('game')!;
    await page.getByRole('button', { name: 'Resign', exact: true }).click();
    await page.getByRole('button', { name: 'Resign', exact: true }).click();
  }
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/coach/')) {
      writes.push(request.url());
    }
  });
  await page.goto(`/coach/${matchId}`);
  await expect(
    page.getByRole('button', { name: 'Generate AI coach review · 1 credit', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Analyse locally', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Analyse locally', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await expect(
    page.locator('section[aria-label^="Stockfish analyses"] button').first(),
  ).toBeVisible();
  expect(writes).toEqual([]);
});
