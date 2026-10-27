import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.addInitScript(() => { localStorage.setItem('ludus-language', 'en-GB'); localStorage.setItem('ludus-board', '2d'); });
  await page.goto('/play');
  await page.getByRole('button', { name: 'Sign in as Leo' }).click();
  await expect(page.getByRole('heading', { name: 'Take a seat.' })).toBeVisible();
}
async function finishActive(page: Page) {
  const entries = await page.request.get('/api/games').then((r) => r.json());
  for (const entry of entries.filter((g: { result: string | null }) => !g.result)) {
    await page.goto(`/play?game=${entry.id}`);
    await expect(page.getByRole('button', { name: 'Resign', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Resign', exact: true }).click();
    await page.getByRole('button', { name: 'Resign', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Lucía won · Resignation' })).toBeVisible();
  }
  await page.goto('/play');
}
test('plays Stockfish, recovers accepted moves, resigns, replays and downloads PGN', async ({ page }) => {
  await signIn(page); await finishActive(page);
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('[data-square="e2"]')).toBeVisible();
  await page.locator('[data-square="e2"]').click();
  await expect(page.locator('[data-square="e4"]')).toHaveAccessibleName(/Legal destination/);
  await page.locator('[data-square="e4"]').click();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'e4', exact: true })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('game');
  await expect.poll(async () => (await page.request.get(`/api/games/${id}`).then((r) => r.json())).game.moves.length).toBe(2);
  await page.reload();
  await expect(page.getByRole('button', { name: 'e4', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lucía won · Resignation' })).toBeVisible();
  await page.getByRole('button', { name: 'Beginning', exact: true }).click();
  await expect(page.locator('[data-square="e2"]')).toHaveAccessibleName(/White Pawn/);
  await page.getByRole('button', { name: 'Final position', exact: true }).click();
  await expect(page.locator('[data-square="e4"]')).toHaveAccessibleName(/White Pawn/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PGN' }).click();
  expect((await download).suggestedFilename()).toMatch(/^ludus-.*\.pgn$/);
  await page.screenshot({ path: 'test-results/game-desktop.png', fullPage: true });
});
test('server rejects illegal/stale actions and foreign sessions; finalises checkmate once', async ({ page, playwright, baseURL }) => {
  await signIn(page); await finishActive(page);
  await page.route('**/engine/stockfish*', (route) => route.abort());
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('button', { name: 'Resign', exact: true })).toBeEnabled();
  const id = new URL(page.url()).searchParams.get('game');
  const path = `/api/games/${id}`;
  const post = (data: unknown) => page.request.post(path, { data, headers: { Origin: baseURL! } });
  expect((await post({ type: 'move', from: 'e2', to: 'e5', revision: 0 })).status()).toBe(409);
  expect((await post({ type: 'move', from: 'e7', to: 'e5', revision: 0 })).status()).toBe(409);
  const moves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
  for (let revision = 0; revision < moves.length; revision++) {
    const uci = moves[revision];
    expect((await post({ type: 'move', from: uci.slice(0, 2), to: uci.slice(2), revision })).ok()).toBe(true);
    if (!revision) expect((await post({ type: 'move', from: 'e7', to: 'e5', revision: 0 })).status()).toBe(409);
  }
  await expect(page.getByRole('heading', { name: 'Lucía won · Checkmate' })).toBeVisible();
  const finished = await page.request.get(path).then((r) => r.json());
  expect(finished.game.result).toEqual({ winner: 'b', reason: 'checkmate' });
  const duplicate = await post({ type: 'resign', revision: 4 }).then((r) => r.json());
  expect(duplicate.game.revision).toBe(4);
  const stranger = await playwright.request.newContext({ baseURL });
  expect((await stranger.get(path)).status()).toBe(401);
  expect((await stranger.post(path, { data: { type: 'resign', revision: 4 }, headers: { Origin: baseURL! } })).status()).toBe(401);
  expect((await page.request.post(path, { data: {}, headers: { Origin: 'https://elsewhere.test' } })).status()).toBe(403);
  await stranger.dispose();
});
test('3D board renders, switches to keyboard board, stays within mobile viewport and translates', async ({ page }) => {
  await signIn(page); await finishActive(page);
  await page.getByLabel('Your pieces').selectOption('b');
  await page.getByLabel('Time control').selectOption('10+5');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: '3D board', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/game-3d.png', fullPage: true });
  await page.getByRole('button', { name: 'Reset camera' }).click();
  await page.getByRole('button', { name: '2D board', exact: true }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.locator('[data-square="e7"]')).toBeVisible();
  await page.locator('[data-square="e7"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-square="e5"]')).toHaveAccessibleName(/Legal destination/);
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Français' }).click();
  await expect(page.getByRole('heading', { name: 'À vous de jouer' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/game-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Abandonner', exact: true }).click();
  await page.getByRole('button', { name: 'Abandonner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lucía a gagné · Abandon' })).toBeVisible();
});
test('promotion uses a keyboard-accessible choice and persists an underpromotion', async ({ page, baseURL }) => {
  await signIn(page); await finishActive(page);
  await page.route('**/engine/stockfish*', (route) => route.abort());
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('button', { name: 'Resign', exact: true })).toBeEnabled();
  const id = new URL(page.url()).searchParams.get('game');
  for (const [revision, uci] of ['a2a4','h7h5','a4a5','h5h4','a5a6','h4h3','a6b7','h3g2'].entries()) {
    expect((await page.request.post(`/api/games/${id}`, { headers: { Origin: baseURL! }, data: { type: 'move', from: uci.slice(0, 2), to: uci.slice(2), revision } })).ok()).toBe(true);
  }
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  await page.locator('[data-square="b7"]').click();
  await page.locator('[data-square="a8"]').click();
  await expect(page.getByRole('dialog', { name: 'Promote pawn' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Queen', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Knight', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('[data-square="a8"]')).toHaveAccessibleName(/White Knight/);
  await page.goto('/play');
  await expect.poll(async () => (await page.request.get(`/api/games/${id}`).then((r) => r.json())).game.pauseStarted).not.toBeNull();
  await page.goto(`/play?game=${id}`);
  await expect(page.getByRole('button', { name: 'Resign', exact: true })).toBeEnabled();
  await expect.poll(async () => (await page.request.get(`/api/games/${id}`).then((r) => r.json())).game.pauseUsed).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lucía won · Resignation' })).toBeVisible();
});
test('magic links are single use and sign-out revokes the game session', async ({ request, baseURL }) => {
  expect((await request.post('/api/auth/sign-in/magic-link', { data: { email: 'uninvited@example.com' }, headers: { Origin: baseURL! } })).status()).toBe(400);
  const uninvited = await request.post('/api/auth/sign-in/magic-link', { data: { email: 'uninvited@example.com', adult: true }, headers: { Origin: baseURL! } });
  expect(uninvited.ok()).toBe(true);
  expect((await request.get('/api/me').then((r) => r.json())).user).toBeNull();
  const response = await request.post('/api/dev/sign-in', { data: {}, headers: { Origin: baseURL! } });
  expect(response.ok()).toBe(true);
  const { url } = await response.json();
  const verify = await request.get(url, { maxRedirects: 0 });
  expect(verify.status()).toBe(302);
  expect((await request.get('/api/me').then((r) => r.json())).user.name).toBe('Leo');
  const duplicate = await request.get(url, { maxRedirects: 0 });
  expect(duplicate.headers().location).toContain('error=INVALID_TOKEN');
  expect((await request.post('/api/auth/sign-out', { data: {}, headers: { Origin: baseURL! } })).ok()).toBe(true);
  expect((await request.get('/api/me').then((r) => r.json())).user).toBeNull();
});
