import { expect, test } from '@playwright/test';

const canonical = 'https://ludus.mrlemoos.dev/@leo';

test('serves public profile content and SEO metadata without JavaScript', async ({
  browser,
  request,
  baseURL,
}) => {
  const response = await request.get('/@leo');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const html = await response.text();
  expect(html).toContain('<h1>@Leo</h1>');
  expect(html).toContain('activity-cells');
  expect(html).toContain('Over the board');
  expect(html).toContain('<title>@Leo · Chess profile | Ludus</title>');
  expect(html).toContain(`rel="canonical" href="${canonical}"`);
  expect(html).toContain('property="og:type" content="profile"');
  expect(html).not.toContain('leo.lemos.ds@icloud.com');
  expect(html).not.toContain('teachingProfile');
  expect(html).not.toContain('trialExpiresAt');
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/@leo');
    await expect(page.getByRole('heading', { name: '@Leo', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Activity', exact: true })).toBeVisible();
    await expect(page.locator('.profile-activity')).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    );
    const structured = await page.locator('#profile-structured-data').textContent();
    expect(JSON.parse(structured!)).toMatchObject({
      '@type': 'ProfilePage',
      mainEntity: { '@type': 'Person', name: '@Leo' },
      url: canonical,
    });
    await page.screenshot({ path: '.scratch/profile-seo-no-js.png', fullPage: true });
  } finally {
    await context.close();
  }
});

test('keeps metadata after client rendering and restores the home title when leaving', async ({
  page,
}) => {
  await page.addInitScript(() =>{  localStorage.setItem('ludus-language', 'en-GB'); });
  await page.goto('/@leo');
  await expect(page.getByRole('button', { name: 'Share profile' })).toBeVisible();
  await expect(page).toHaveTitle('@Leo · Chess profile | Ludus');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
  await page.getByRole('link', { name: 'Ludus', exact: true }).click();
  await expect(page).toHaveTitle('Ludus | Make time for chess');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(0);
});

test('redirects legacy and mixed-case URLs and returns a real 404 for missing profiles', async ({
  request,
}) => {
  for (const path of ['/players/Leo', '/@Leo', '/@leo/']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe('/@leo');
  }
  const missing = await request.get('/@does_not_exist_123');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['x-robots-tag']).toBe('noindex');
  expect(await missing.text()).toContain('Profile not found.');
  const head = await request.head('/@leo');
  expect(head.status()).toBe(200);
  expect(await head.text()).toBe('');
});

test('publishes crawl rules and canonical profile sitemap entries', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.headers()['content-type']).toContain('text/plain');
  expect(await robots.text()).toContain('Sitemap: https://ludus.mrlemoos.dev/sitemap.xml');
  const index = await request.get('/sitemap.xml');
  expect(index.status()).toBe(200);
  expect(index.headers()['content-type']).toContain('application/xml');
  expect(await index.text()).toContain('/sitemaps/profiles-1.xml');
  const profiles = await request.get('/sitemaps/profiles-1.xml');
  expect(await profiles.text()).toContain(`<loc>${canonical}</loc>`);
  expect(await profiles.text()).not.toContain('/players/');
  expect((await request.get('/sitemaps/profiles-999999.xml')).status()).toBe(404);
});

test('retains server-rendered content when the background API refresh fails', async ({ page }) => {
  await page.addInitScript(() =>{  localStorage.setItem('ludus-language', 'en-GB'); });
  await page.route('**/api/profiles/leo', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  const refresh = page.waitForResponse('**/api/profiles/leo');
  await page.goto('/@leo');
  await refresh;
  await expect(page.getByRole('heading', { name: '@Leo', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Activity', exact: true })).toBeVisible();
  await expect(page.getByText('Profile not found.', { exact: true })).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  await expect(page.locator('#profile-structured-data')).toHaveCount(1);
});
