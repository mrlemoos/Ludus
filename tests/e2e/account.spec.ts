import { test, expect } from '@playwright/test';
import type { PlayerProfile } from '../../shared/profile';

test('edits profile without restarting beta trial and enforces hidden activity in public responses', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ludus-language', 'en-GB'));
  await page.goto('/play');
  await page.getByRole('button', { name: 'Sign in as dev' }).click();
  await expect(page.getByRole('heading', { name: 'Take a seat.' })).toBeVisible();
  const initial = await page.request.get('/api/account').then((response) => response.json()) as { profile: PlayerProfile; operator: boolean };
  expect(initial.profile).toBeTruthy();
  try {
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: `@${initial.profile.username}`, exact: true })).toBeVisible();
    const billing = page.getByRole('region', { name: 'Coach review credits' });
    await expect(billing.getByText('Purchases are paused while billing checks are completed.')).toBeVisible();
    await expect(billing.getByRole('button', { name: 'Buy 10 reviews · €4.99' })).toHaveCount(0);
    const blockedCheckout = await page.request.post('/api/billing/review-pack/checkout', { headers: { Origin: 'http://127.0.0.1:4173' }, data: {} });
    expect(blockedCheckout.status()).toBe(503);
    await expect(page.getByLabel('Public username')).toHaveValue(initial.profile.username);
    await page.getByLabel('Show my activity publicly').uncheck();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('status')).toContainText('Profile saved.');
    const updated = await page.request.get('/api/account').then((response) => response.json()) as { profile: PlayerProfile };
    expect(updated.profile.trialExpiresAt).toBe(initial.profile.trialExpiresAt);
    const publicResponse = await page.request.get(`/api/profiles/${initial.profile.username}`).then((response) => response.json());
    expect(publicResponse).not.toHaveProperty('activity');
    expect(publicResponse).not.toHaveProperty('email');
    expect(publicResponse).not.toHaveProperty('teachingProfile');
    const publicHtml = await page.request.get(`/@${initial.profile.username.toLowerCase()}`).then((response) => response.text());
    expect(publicHtml).not.toContain('activity-cells');
    expect(publicHtml).not.toContain('"activity":');
    expect(publicHtml).toContain('Activity is private.');
    await page.goto(`/players/${initial.profile.username}`);
    await expect(page.getByText('Activity is private.')).toBeVisible();
    await page.goto('/operator');
    if (initial.operator) await expect(page.getByRole('heading', { name: 'Beta invitations' })).toBeVisible();
    else await expect(page.getByRole('status')).toContainText('Operator access required');
  } finally {
    const restored = await page.request.post('/api/account', { headers: { Origin: 'http://127.0.0.1:4173' }, data: { ...initial.profile, adult: true } });
    expect(restored.ok()).toBe(true);
  }
});
