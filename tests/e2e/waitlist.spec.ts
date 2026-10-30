import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

const cases = [
  { language: 'en-GB', name: 'English', title: 'Make time', button: 'Join the waitlist', success: "You're on the list." },
  { language: 'es-ES', name: 'Español', title: 'Haz tiempo', button: 'Apuntarme a la beta', success: 'Ya estás en la lista.' },
  { language: 'fr-FR', name: 'Français', title: 'Prenez le temps', button: 'Rejoindre la bêta', success: 'Votre place est sur la liste.' },
];

for (const locale of cases) {
  test(`saves ${locale.language} to D1 and confirms duplicates safely`, async ({ page, request }) => {
    await page.goto('/');
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: locale.name, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.language);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(locale.title);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.language);

    const email = `beta-${locale.language.toLowerCase()}-${crypto.randomUUID()}@example.com`;
    await page.locator('#email').fill(email);
    await page.getByRole('button', { name: locale.button, exact: true }).click();
    await expect(page.getByRole('status')).toContainText(locale.success);

    if (locale.language === 'en-GB') {
      const duplicate = await request.post('/api/waitlist', { data: { email: ` ${email.toUpperCase()} `, language: 'fr-FR' } });
      expect(duplicate.status()).toBe(200);
      expect(await duplicate.json()).toEqual({ ok: true });
    }

    const output = execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'ludus', '--local', '--json', '--command', `SELECT language, COUNT(*) AS count FROM waitlist WHERE email = '${email}' GROUP BY language`], { encoding: 'utf8' });
    expect(JSON.parse(output)[0].results).toEqual([{ language: locale.language, count: 1 }]);
  });
}

test('rejects unsafe API input without storing it', async ({ request }) => {
  expect((await request.get('/api/waitlist')).status()).toBe(405);
  expect((await request.post('/api/waitlist', { headers: { Origin: 'https://other.example' }, data: { email: 'other@example.com', language: 'en-GB' } })).status()).toBe(403);
  expect((await request.post('/api/waitlist', { data: 'text' })).status()).toBe(415);
  expect((await request.post('/api/waitlist', { data: { email: 'a'.repeat(2000), language: 'en-GB' } })).status()).toBe(413);
  expect((await request.post('/api/waitlist', { data: { email: 'invalid', language: 'en-GB' } })).status()).toBe(400);
  expect((await request.get('/api/missing')).status()).toBe(404);
});

test('retains email on failure and supports retry', async ({ page }) => {
  await page.goto('/');
  await page.locator('#email').fill('retry@example.com');
  await page.route('**/api/waitlist', (route) => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('alert')).toContainText('try again');
  await expect(page.locator('#email')).toHaveValue('retry@example.com');
  await page.route('**/api/waitlist', (route) => route.fulfill({ status: 200, json: { ok: true } }));
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('status')).toContainText("You're on the list.");
});

test('shows rate limits and validates before sending', async ({ page }) => {
  await page.goto('/');
  await page.locator('#email').fill('invalid');
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('alert')).toContainText('valid email');
  await page.route('**/api/waitlist', (route) => route.fulfill({ status: 429, json: { error: 'rate_limited' } }));
  await page.locator('#email').fill('limited@example.com');
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('alert')).toContainText('Wait a minute');
});

test('fits narrow screens and supports keyboard language selection', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const language = page.getByRole('combobox');
  await language.focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('option', { name: 'Français' }).press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-FR');
  await expect(page.getByRole('button', { name: 'Rejoindre la bêta' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/waitlist-mobile.png', fullPage: true });
});

test('renders desktop without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('heading', { name: 'Play first. Understand after.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/waitlist-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});


test('switches board previews with keyboard and keeps the preview separate from play', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const three = page.getByRole('tab', { name: '3D', exact: true });
  const two = page.getByRole('tab', { name: '2D', exact: true });
  await expect(three).toHaveAttribute('aria-selected', 'true');
  await three.focus();
  await page.keyboard.press('ArrowRight');
  await expect(two).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.home-flat-board')).toBeVisible();
  await expect(page.locator('.home-flat-board')).toHaveAttribute('inert', '');
  for (const width of [360, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(async () => {
      const frame = (await page.locator('.preview-stage').boundingBox())!;
      const board = (await page.locator('.home-flat-board .play-board').boundingBox())!;
      expect(board.height).toBeCloseTo(board.width, 0);
      expect(board.y).toBeGreaterThanOrEqual(frame.y);
      expect(board.y + board.height).toBeLessThanOrEqual(frame.y + frame.height);
    }).toPass();
  }
  await two.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(three).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Reset camera' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Play chess' })).toHaveAttribute('href', '/play');
});
