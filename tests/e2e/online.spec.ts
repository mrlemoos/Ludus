import { expect, test, type Page } from '@playwright/test';
async function login(page: Page, account: 'leo' | 'friend') {
  await page.addInitScript(() => { localStorage.setItem('ludus-language', 'en-GB'); localStorage.setItem('ludus-board', '2d'); });
  await page.goto('/play');
  const response = await page.request.post('/api/dev/sign-in', { data: { account }, headers: { Origin: new URL(page.url()).origin } });
  expect(response.ok()).toBe(true);
  const { url } = await response.json();
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Take a seat.' })).toBeVisible();
}
test('two accounts play a friend game, reject foreign access, exchange phrases and recover after reload', async ({ page, browser, baseURL }) => {
  const otherContext = await browser.newContext(); const friend = await otherContext.newPage();
  const foreignContext = await browser.newContext();
  try {
    await login(page, 'leo'); await login(friend, 'friend');
    const origin = baseURL!;
    const create = await page.request.post('/api/online/invitations', { data: { control: '5+3', colour: 'w' }, headers: { Origin: origin } });
    expect(create.ok()).toBe(true);
    const invitation = await create.json();
    const redeemed = await friend.request.post('/api/online/invitations/redeem', { data: { token: invitation.token }, headers: { Origin: origin } });
    expect(redeemed.ok()).toBe(true);
    const assigned = await redeemed.json(), id = assigned.match.id;
    await page.goto(`/online?game=${id}`); await friend.goto(`/online?game=${id}`);
    await expect(page.locator('[data-square="e2"]')).toBeVisible();
    await expect(friend.locator('[data-square="e7"]')).toBeVisible();
    const gamePath = `/api/online/games/${id}`;
    const state = async () => (await page.request.get(gamePath).then((r) => r.json())).game;
    await expect.poll(async () => (await state()).disconnected).toEqual({ w: false, b: false });
    expect((await foreignContext.request.get(`${origin}${gamePath}`)).status()).toBe(401);
    const illegal = await friend.request.post(gamePath, { data: { type: 'move', from: 'e2', to: 'e4', revision: 0 }, headers: { Origin: origin } });
    expect(illegal.status()).toBe(409);
    await page.locator('[data-square="e2"]').click(); await page.locator('[data-square="e4"]').click();
    await expect(friend.locator('[data-square="e4"]')).toHaveAccessibleName(/White Pawn/);
    await friend.locator('[data-square="e7"]').click(); await friend.locator('[data-square="e5"]').click();
    await expect(page.locator('[data-square="e5"]')).toHaveAccessibleName(/Black Pawn/);
    await friend.reload(); await expect(friend.locator('[data-square="e5"]')).toHaveAccessibleName(/Black Pawn/);
    await expect.poll(async () => (await state()).disconnected.b).toBe(false);
    expect((await state()).moves).toEqual(['e4', 'e5']);
    const phrase = await page.request.post(`${gamePath}/phrase`, { data: { phrase: 'goodGame' }, headers: { Origin: origin } });
    expect(phrase.ok()).toBe(true);
    const phrases = friend.getByRole('region', { name: 'Preset phrases' });
    await expect(phrases.getByRole('status')).toHaveText('Good game');
    await friend.getByRole('button', { name: 'Mute phrases', exact: true }).click();
    await expect(phrases.getByRole('status')).toHaveCount(0);
    const current = await state();
    expect((await friend.request.post(gamePath, { data: { type: 'resign', revision: current.revision }, headers: { Origin: origin } })).ok()).toBe(true);
    await expect.poll(async () => (await state()).result?.reason).toBe('resignation');
    await expect(page.getByRole('link', { name: /Lucía/ })).toBeVisible();
    const report = await page.request.post(`${gamePath}/report`, { data: { category: 'assistance' }, headers: { Origin: origin } });
    expect(report.ok()).toBe(true);
    await page.screenshot({ path: 'test-results/online-finished.png', fullPage: true });
  } finally { await otherContext.close(); await foreignContext.close(); }
});
test('onboarded account sees trial, activity, public profile and explicit coach outage', async ({ page }) => {
  await login(page, 'leo');
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: '@Leo', exact: true })).toBeVisible();
  await expect(page.getByText('Beta Plus ends', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'View public profile' }).click();
  await expect(page).toHaveURL(/\/@leo$/);
  await expect(page.getByRole('heading', { name: '@Leo', exact: true })).toBeVisible();
  await page.goto('/operator');
  await expect(page.getByRole('heading', { name: /invitation/i })).toBeVisible();
});
