import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function resignActive(page: Page) {
  const { origin } = new URL(page.url());
  const status = await page.request.get('/api/online/status').then((response) => response.json());
  if (status.status !== 'assigned') {
    return;
  }
  const snapshot = await page.request
    .get(`/api/online/games/${status.match.id}`)
    .then((response) => response.json());
  if (!snapshot.game || snapshot.game.result) {
    return;
  }
  expect(
    (
      await page.request.post(`/api/online/games/${status.match.id}`, {
        data: { type: 'resign', revision: snapshot.game.revision },
        headers: { Origin: origin },
      })
    ).ok(),
  ).toBe(true);
}
async function login(page: Page, account: 'leo' | 'friend') {
  await page.addInitScript(() => {
    localStorage.setItem('ludus-language', 'en-GB');
    localStorage.setItem('ludus-board', '2d');
  });
  await page.goto('/play');
  const response = await page.request.post('/api/dev/sign-in', {
    data: { account },
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(response.ok()).toBe(true);
  const { url } = await response.json();
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Take a seat.' })).toBeVisible();
}
test('two accounts play a friend game, reject foreign access, exchange phrases and recover after reload', async ({
  page,
  browser,
  baseURL,
}) => {
  const otherContext = await browser.newContext();
  const friend = await otherContext.newPage();
  const foreignContext = await browser.newContext();
  try {
    await login(page, 'leo');
    await login(friend, 'friend');
    const origin = baseURL!;
    const create = await page.request.post('/api/online/invitations', {
      data: { control: '5+3' },
      headers: { Origin: origin },
    });
    expect(create.ok()).toBe(true);
    const invitation = await create.json();
    const redeemed = await friend.request.post('/api/online/invitations/redeem', {
      data: { token: invitation.token, colour: 'b' },
      headers: { Origin: origin },
    });
    expect(redeemed.ok()).toBe(true);
    const assigned = await redeemed.json();
    const { id } = assigned.match;
    await page.goto(`/online?game=${id}`);
    await friend.goto(`/online?game=${id}`);
    await expect(page.locator('[data-square="e2"]')).toBeVisible();
    await expect(friend.locator('[data-square="e7"]')).toBeVisible();
    const gamePath = `/api/online/games/${id}`;
    async function state() {
      return (await page.request.get(gamePath).then((r) => r.json())).game;
    }
    await expect.poll(async () => (await state()).disconnected).toEqual({ w: false, b: false });
    expect((await foreignContext.request.get(`${origin}${gamePath}`)).status()).toBe(401);
    const illegal = await friend.request.post(gamePath, {
      data: { type: 'move', from: 'e2', to: 'e4', revision: 0 },
      headers: { Origin: origin },
    });
    expect(illegal.status()).toBe(409);
    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e4"]').click();
    await expect(friend.locator('[data-square="e4"]')).toHaveAccessibleName(/White Pawn/);
    await friend.locator('[data-square="e7"]').click();
    await friend.locator('[data-square="e5"]').click();
    await expect(page.locator('[data-square="e5"]')).toHaveAccessibleName(/Black Pawn/);
    await friend.reload();
    await expect(friend.locator('[data-square="e5"]')).toHaveAccessibleName(/Black Pawn/);
    await expect.poll(async () => (await state()).disconnected.b).toBe(false);
    expect((await state()).moves).toEqual(['e4', 'e5']);
    const phrase = await page.request.post(`${gamePath}/phrase`, {
      data: { phrase: 'goodGame' },
      headers: { Origin: origin },
    });
    expect(phrase.ok()).toBe(true);
    const phrases = friend.getByRole('region', { name: 'Preset phrases' });
    await expect(phrases.getByRole('status')).toHaveText('Good game');
    await friend.getByRole('button', { name: 'Mute phrases', exact: true }).click();
    await expect(phrases.getByRole('status')).toHaveCount(0);
    const current = await state();
    expect(
      (
        await friend.request.post(gamePath, {
          data: { type: 'resign', revision: current.revision },
          headers: { Origin: origin },
        })
      ).ok(),
    ).toBe(true);
    await expect.poll(async () => (await state()).result?.reason).toBe('resignation');
    await expect(page.getByRole('link', { name: /Lucía/ })).toBeVisible();
    const report = await page.request.post(`${gamePath}/report`, {
      data: { category: 'assistance' },
      headers: { Origin: origin },
    });
    expect(report.ok()).toBe(true);
    await page.screenshot({ path: 'test-results/online-finished.png', fullPage: true });
  } finally {
    await otherContext.close();
    await foreignContext.close();
  }
});
test('a guest who chooses white moves first and the host answers as black', async ({
  page,
  browser,
  baseURL,
}) => {
  const otherContext = await browser.newContext();
  const friend = await otherContext.newPage();
  try {
    await login(page, 'leo');
    await login(friend, 'friend');
    const origin = baseURL!;
    const create = await page.request.post('/api/online/invitations', {
      data: { control: '5+3' },
      headers: { Origin: origin },
    });
    expect(create.ok()).toBe(true);
    const invitation = await create.json();
    const redeemed = await friend.request.post('/api/online/invitations/redeem', {
      data: { token: invitation.token, colour: 'w' },
      headers: { Origin: origin },
    });
    expect(redeemed.ok()).toBe(true);
    const { id } = (await redeemed.json()).match;
    await page.goto(`/online?game=${id}`);
    await friend.goto(`/online?game=${id}`);
    await expect(page.locator('[data-square="e7"]')).toBeVisible();
    await expect(friend.locator('[data-square="e2"]')).toBeVisible();
    await expect(page.getByText('Reconnecting')).toHaveCount(0);
    await expect(friend.getByText('Reconnecting')).toHaveCount(0);
    await friend.locator('[data-square="e2"]').click();
    await friend.locator('[data-square="e4"]').click();
    await expect(page.locator('[data-square="e4"]')).toHaveAccessibleName(/White Pawn/);
    await page.locator('[data-square="e7"]').click();
    await page.locator('[data-square="e5"]').click();
    await expect(friend.locator('[data-square="e5"]')).toHaveAccessibleName(/Black Pawn/);
    await resignActive(page);
  } finally {
    await otherContext.close();
  }
});
test('the first player in the public queue plays white', async ({ page, browser }) => {
  const otherContext = await browser.newContext();
  const friend = await otherContext.newPage();
  try {
    await login(page, 'leo');
    await login(friend, 'friend');
    await resignActive(page);
    await resignActive(friend);
    await page.goto('/online');
    await friend.goto('/online');
    await page.getByRole('button', { name: 'Find an opponent', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cancel search', exact: true })).toBeVisible();
    await friend.getByRole('button', { name: 'Find an opponent', exact: true }).click();
    await expect(page).toHaveURL(/\/online\?game=/);
    await expect(friend).toHaveURL(/\/online\?game=/);
    expect(new URL(page.url()).searchParams.get('game')).toBe(
      new URL(friend.url()).searchParams.get('game'),
    );
    await expect(page.locator('[data-square="e2"]')).toBeVisible();
    await expect(friend.locator('[data-square="e7"]')).toBeVisible();
    await expect(page.getByText('Reconnecting')).toHaveCount(0);
    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e4"]').click();
    await expect(friend.locator('[data-square="e4"]')).toHaveAccessibleName(/White Pawn/);
    await resignActive(page);
  } finally {
    await otherContext.close();
  }
});
test('a rejected move shows the piece and then puts it back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  function holdOpen() {}
  let release: () => void = holdOpen;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const now = Date.now();
  const game = {
    id: '11111111-1111-4111-8111-111111111111',
    players: { w: 'leo', b: 'friend' },
    control: '5+3',
    rated: false,
    moves: [] as string[],
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    clocks: { w: 300_000, b: 300_000 },
    updatedAt: now,
    revision: 0,
    result: null,
    disconnected: { w: false, b: false },
    pauseUsed: { w: 0, b: 0 },
    drawOffer: null,
  };
  await page.addInitScript(`(() => {
    localStorage.setItem('ludus-language', 'en-GB'); localStorage.setItem('ludus-board', '2d');
    class QuietSocket {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      constructor() { this.readyState = QuietSocket.CONNECTING; queueMicrotask(() => { this.readyState = QuietSocket.OPEN; if (this.onopen) this.onopen(); }); }
      send() {}
      close() { this.readyState = QuietSocket.CLOSED; if (this.onclose) this.onclose(); }
      addEventListener() {}
      removeEventListener() {}
    }
    window.WebSocket = QuietSocket;
  })();`);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/me') {
      return route.fulfill({ json: { user: { id: 'leo', name: 'Leo' } } });
    }
    if (path === '/api/appearance') {
      return route.fulfill({ json: { appearance: { board: 'wood', pieces: 'wood' } } });
    }
    if (request.method() === 'POST' && path === `/api/online/games/${game.id}`) {
      await hold;
      return route.fulfill({ status: 409, json: { error: 'conflict' } });
    }
    if (path === `/api/online/games/${game.id}`) {
      return route.fulfill({ json: { game, serverNow: now } });
    }
    return route.fulfill({ json: {} });
  });
  try {
    await page.goto(`/online?game=${game.id}`);
    await expect(page.locator('[data-square="e2"]')).toBeVisible();
    await expect(page.getByText('Reconnecting')).toHaveCount(0);
    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e4"]').click();
    await expect(page.locator('[data-square="e4"]')).toHaveAccessibleName(/White Pawn/);
    release();
    await expect(page.locator('[data-square="e2"]')).toHaveAccessibleName(/White Pawn/);
    await expect(page.locator('[data-square="e4"]')).toHaveAccessibleName(/Empty/);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});
test('onboarded account sees trial, activity, public profile and explicit coach outage', async ({
  page,
}) => {
  await login(page, 'leo');
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: '@Leo', exact: true })).toBeVisible();
  await expect(page.getByText('Beta monthly credits end', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'View public profile' }).click();
  await expect(page).toHaveURL(/\/@leo$/);
  await expect(page.getByRole('heading', { name: '@Leo', exact: true })).toBeVisible();
  await page.goto('/operator');
  await expect(page.getByRole('heading', { name: /invitation/i })).toBeVisible();
});
