import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.addInitScript(() => { localStorage.setItem('ludus-language', 'en-GB'); localStorage.setItem('ludus-board', '2d'); });
  await page.goto('/play');
  await page.getByRole('button', { name: 'Sign in as dev' }).click();
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
test('Skecher lobby tabs support keyboard navigation, language changes and narrow screens', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/play');
  await expect(page.getByRole('heading', { name: 'Your table is ready.' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await expect(page.locator('.skip-link')).toBeInViewport();
  await expect(page.locator('.skip-link')).toHaveCSS('opacity', '1');
  await page.keyboard.press('Tab');
  await page.screenshot({ path: 'test-results/sign-in-desktop.png', fullPage: true });
  await signIn(page); await finishActive(page);
  const newGame = page.getByRole('tab', { name: 'New game', exact: true });
  await expect(newGame).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.lobby-controls')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/lobby-desktop.png', fullPage: true });
  await newGame.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Your games', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toContainText('Your games');
  await expect(page).toHaveURL(/tab=history/);
  await expect(page.getByRole('button', { name: 'Start game' })).not.toBeVisible();
  await page.keyboard.press('Home');
  await expect(newGame).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('combobox', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: 'Français' }).click();
  await page.getByRole('tab', { name: 'Vos parties', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Vos parties');
  await page.getByRole('tab', { name: 'Nouvelle partie', exact: true }).click();
  await expect(page.getByLabel('Cadence')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'Nouvelle partie', exact: true }).blur();
  await expect(page.locator('.skip-link')).not.toBeInViewport();
  await expect(page.getByRole('tab', { name: 'Nouvelle partie', exact: true })).toHaveCSS('flex-grow', '0');
  await page.screenshot({ path: 'test-results/lobby-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('plays Stockfish, recovers accepted moves, resigns, replays and downloads PGN', async ({ page }) => {
  let historyReads = 0;
  page.on('request', (request) => { if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/games') historyReads++; });
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
  const readsAfterDownload = historyReads;
  // Observe completed-game broadcasts for a feedback cycle across several clock renders.
  await page.waitForTimeout(1000);
  expect(historyReads - readsAfterDownload).toBeLessThanOrEqual(2);
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
test('a delayed initial read cannot restore the pause after the socket connects', async ({ page, baseURL }) => {
  await signIn(page); await finishActive(page);
  const response = await page.request.post('/api/games', { data: { control: '10+5', difficulty: 1, colour: 'w' }, headers: { Origin: baseURL! } });
  expect(response.ok()).toBe(true);
  const initial = await response.json();
  expect(initial.game.pauseStarted).not.toBeNull();
  const socketFrame = page.waitForEvent('websocket').then((socket) => socket.waitForEvent('framereceived'));
  let delivered = false;
  await page.route(`**/api/games/${initial.game.id}`, async (route) => {
    await socketFrame;
    await expect(page.getByRole('button', { name: 'Resign', exact: true })).toBeEnabled();
    await expect(page.getByText(/Disconnect pause/)).toHaveCount(0);
    await route.fulfill({ json: initial });
    delivered = true;
  });
  await page.goto(`/play?game=${initial.game.id}`);
  await expect.poll(() => delivered).toBe(true);
  // A DOM round trip ensures React has consumed the delayed HTTP response.
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await expect(page.getByText(/Disconnect pause/)).toHaveCount(0);
});
test('3D board renders, switches to keyboard board, stays within mobile viewport and translates', async ({ page }) => {
  // CI uses SwiftShader; six scene captures took 83 seconds in the failing trace.
  test.setTimeout(process.env.CI ? 300_000 : 150_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page); await finishActive(page);
  await page.getByLabel('Your pieces').selectOption('b');
  await page.getByLabel('Time control').selectOption('10+5');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: '3D board', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  async function expectLargeScene() {
    const viewport = page.viewportSize()!;
    const scene = (await page.locator('canvas').boundingBox())!;
    expect(scene.width * scene.height).toBeGreaterThan(viewport.width * viewport.height * .5);
    expect(scene.y).toBeGreaterThanOrEqual(0);
    expect(scene.y + scene.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.locator('.board-tools')).toBeInViewport();
  }
  await expectLargeScene();
  await page.screenshot({ path: 'test-results/game-3d.png', fullPage: true });
  await page.getByRole('button', { name: 'Look around', exact: true }).click();
  await expect(page.locator('.three-board')).toHaveAttribute('data-view', 'room');
  await expect(page.locator('[data-square]')).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/cafe-black.png', fullPage: true });
  const before = await page.request.get(`/api/games/${new URL(page.url()).searchParams.get('game')}`).then((r) => r.json());
  await page.locator('canvas').click({ position: { x: 200, y: 200 } });
  const after = await page.request.get(`/api/games/${before.game.id}`).then((r) => r.json());
  expect(after.game.moves).toEqual(before.game.moves);
  await page.getByRole('button', { name: 'Return to board', exact: true }).click();
  await expect(page.locator('[data-square]')).toHaveCount(64);
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/game-3d-white.png', fullPage: true });
  await page.getByRole('button', { name: 'Look around', exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/cafe-white.png', fullPage: true });
  await page.getByRole('button', { name: 'Return to board', exact: true }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectLargeScene();
  await page.screenshot({ path: 'test-results/game-3d-mobile.png', fullPage: true });
  const mobileScene = (await page.locator('canvas').boundingBox())!;
  await page.locator('canvas').click({ position: { x: mobileScene.width * .535, y: mobileScene.height * .434 } });
  await expect(page.locator('[data-square="e7"]')).toHaveAttribute('aria-pressed', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Look around', exact: true }).click();
  await page.getByRole('button', { name: 'Reset camera' }).click();
  await expect(page.getByRole('button', { name: 'Return to board', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/cafe-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '2D board', exact: true }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.locator('[data-square="e7"]')).toBeVisible();
  await page.locator('[data-square="e7"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-square="e5"]')).toHaveAccessibleName(/Legal destination/);
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Français' }).click();
  await expect(page.getByRole('heading', { name: 'À vous de jouer' })).toBeVisible();
  await page.getByRole('button', { name: 'Échiquier 3D', exact: true }).click();
  await page.getByRole('button', { name: 'Regarder autour', exact: true }).click();
  await page.getByRole('button', { name: 'Revenir à l’échiquier', exact: true }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Español' }).click();
  await page.getByRole('button', { name: 'Mirar alrededor', exact: true }).click();
  await page.getByRole('button', { name: 'Volver al tablero', exact: true }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Français' }).click();
  await page.getByRole('button', { name: 'Échiquier 2D', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/game-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Abandonner', exact: true }).click();
  await page.getByRole('button', { name: 'Abandonner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lucía a gagné · Abandon' })).toBeVisible();
});
test('2D board and graphics fallback keep every square clear of player overlays', async ({ page }) => {
  await signIn(page); await finishActive(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.route('**/engine/stockfish*', (route) => route.abort());
  await page.getByRole('button', { name: 'Start game' }).click();
  async function expectClearBoard() {
    const board = (await page.locator('.play-board').boundingBox())!;
    const frame = (await page.locator('.board-frame').boundingBox())!;
    const players = (await page.locator('.match-players').boundingBox())!;
    expect(players.y + players.height).toBeLessThanOrEqual(board.y + 1);
    expect(board.y + board.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
    await expect(page.locator('[data-square="a8"]')).toBeInViewport();
    await expect(page.locator('[data-square="h1"]')).toBeInViewport();
  }
  await expect(page.locator('[data-square="e2"]')).toBeVisible();
  await expectClearBoard();
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: function (this: HTMLCanvasElement, kind: string, options?: unknown) {
      return kind.startsWith('webgl') ? null : original.call(this, kind, options);
    } });
  });
  await page.getByRole('button', { name: '3D board', exact: true }).click();
  await expect(page.getByText('3D is unavailable on this device. Use the 2D board.')).toBeVisible();
  await expectClearBoard();
  await page.screenshot({ path: 'test-results/game-graphics-fallback.png', fullPage: true });
});
test('tabletop clock and captured pieces render from both seats and follow replay', async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page); await finishActive(page);
  await page.route('**/engine/stockfish*', (route) => route.abort());
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('button', { name: 'Resign', exact: true })).toBeEnabled();
  const id = new URL(page.url()).searchParams.get('game');
  for (const [revision, uci] of ['e2e4', 'd7d5', 'e4d5', 'd8d5'].entries()) {
    expect((await page.request.post(`/api/games/${id}`, { headers: { Origin: baseURL! }, data: { type: 'move', from: uci.slice(0, 2), to: uci.slice(2), revision } })).ok()).toBe(true);
  }
  await expect(page.locator('[data-square="d5"]')).toHaveAccessibleName(/Black Queen/);
  await page.getByRole('button', { name: '3D board', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/tabletop-white.png', fullPage: true });
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/tabletop-black.png', fullPage: true });
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lucía won · Resignation' })).toBeVisible();
  await page.getByRole('button', { name: 'Beginning', exact: true }).click();
  await expect(page.locator('[data-square="e2"]')).toHaveAccessibleName(/White Pawn/);
  await page.screenshot({ path: 'test-results/tabletop-replay-start.png', fullPage: true });
  await page.getByRole('button', { name: 'Final position', exact: true }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/tabletop-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
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
