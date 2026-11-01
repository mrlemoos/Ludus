import { expect, test } from '@playwright/test';

const today = '2026-10-31';
const days = Object.fromEntries(Array.from({ length: 365 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 9, 31 - index)).toISOString().slice(0, 10);
  return [date, index % 9 < 5 ? index % 5 + 1 : 0];
}));
const profile = { username: 'leo', ratings: [{ control: '5+3', rating: 1642, games: 28 }, { control: '10+5', rating: 1586, games: 8 }], activity: { today, days, streak: 12 } };

for (const width of [390, 1440]) test(`profile hierarchy and controls at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(() => localStorage.setItem('ludus-language', 'en-GB'));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/profiles/leo', (route) => route.fulfill({ json: profile }));
  await page.goto('/@leo');
  await page.reload();
  await expect(page.getByRole('heading', { name: '@leo', exact: true })).toBeVisible();
  const graph = page.getByRole('region', { name: 'Activity', exact: true });
  await expect(graph).toBeVisible();
  expect(await graph.locator('.activity-cell').count()).toBe(370);
  expect(await page.locator('.profile-identity + .profile-activity').count()).toBe(1);
  await page.getByLabel('Choose a day').fill('2026-10-30');
  await expect(graph.getByText(`Completed games: ${days['2026-10-30']}`, { exact: true })).toBeVisible();
  expect(await page.getByRole('button', { name: 'Share profile' }).evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(36, 77, 56)');
  await page.getByRole('button', { name: 'Share profile' }).click();
  await expect(page.getByText('Link copied', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('http://127.0.0.1:4173/@leo');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const button of await page.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(await button.evaluate((element) => getComputedStyle(element).touchAction)).toBe('manipulation');
  }
  await page.screenshot({ path: `.scratch/profile-${width}.png`, fullPage: true });
  const profileLogo = await page.locator('.wordmark').evaluate((element) => { const style = getComputedStyle(element); return [style.fontFamily, style.fontSize, style.fontWeight, style.letterSpacing, element.textContent]; });
  await page.goto('/');
  for (const logo of await page.locator('.wordmark').all()) expect(await logo.evaluate((element) => { const style = getComputedStyle(element); return [style.fontFamily, style.fontSize, style.fontWeight, style.letterSpacing, element.textContent]; })).toEqual(profileLogo);
});

test('private activity and long handles remain shareable without exposing a graph', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await page.addInitScript(() => localStorage.setItem('ludus-language', 'en-GB'));
  await page.route('**/api/profiles/*', (route) => route.fulfill({ json: { username: 'abcdefghijklmnopqrstuvwx', ratings: [] } }));
  await page.goto('/players/abcdefghijklmnopqrstuvwx');
  await expect(page.getByText('Activity is private.')).toBeVisible();
  await expect(page.locator('.activity-cells')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('account controls fit a narrow phone with usable touch targets', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ludus-language', 'en-GB'));
  await page.route('**/api/account', (route) => route.fulfill({ json: { profile: { userId: 'fixture', username: 'leo', language: 'en-GB', timezone: 'Europe/Madrid', chessLevel: 'casual', teachingProfile: 'developing', activityPublic: true, trialExpiresAt: Date.UTC(2026, 11, 1) }, activity: profile.activity, operator: false } }));
  await page.route('**/api/profiles/leo', (route) => route.fulfill({ json: profile }));
  await page.route('**/api/billing', (route) => route.fulfill({ json: { enabled: false, reviewCredits: { available: 31, monthlyFreeRemaining: 30, introAvailable: true, paidRemaining: 0 } } }));
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: '@leo', exact: true })).toBeVisible();
    await expect(page.getByLabel('Public username')).toHaveValue('leo');
    await expect(page.getByText('Purchases are paused while billing checks are completed.')).toBeVisible();
    await page.getByText('Delete account', { exact: true }).first().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await page.getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
    for (const input of await page.locator('input:not([type="checkbox"]), select').all()) expect(await input.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    await page.screenshot({ path: `.scratch/account-${width}.png`, fullPage: true });
  }
});


test('legacy profile links work and unknown paths keep the not-found page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ludus-language', 'en-GB'));
  await page.route('**/api/profiles/leo', (route) => route.fulfill({ json: profile }));
  await page.goto('/players/leo');
  await expect(page.getByRole('heading', { name: '@leo', exact: true })).toBeVisible();
  await page.goto('/unknown-page');
  await expect(page.locator('.profile-main')).toHaveCount(0);
  await expect(page.getByRole('heading')).toBeVisible();
});
