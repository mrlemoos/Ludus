import { expect, test } from '@playwright/test';

const profile = { userId: 'billing-fixture', username: 'BillingPlayer', language: 'en-GB', timezone: 'Europe/Madrid', chessLevel: 'casual', teachingProfile: 'developing', activityPublic: false, adultAttestedAt: 1, onboardedAt: 1, trialExpiresAt: Date.now() + 86400_000 };
const languages = [
  { language: 'en-GB', manage: 'Manage subscription', overdue: 'Payment overdue', grace: 'Plus grace ends', refresh: 'Refresh billing status' },
  { language: 'es-ES', manage: 'Gestionar suscripción', overdue: 'Pago pendiente', grace: 'periodo de gracia', refresh: 'Actualizar facturación' },
  { language: 'fr-FR', manage: 'Gérer l’abonnement', overdue: 'Paiement en retard', grace: 'délai de grâce', refresh: 'Actualiser la facturation' },
];

for (const copy of languages) test(`shows renewal grace and management while new purchases are disabled: ${copy.language}`, async ({ page }) => {
  await page.addInitScript((language) => localStorage.setItem('ludus-language', language), copy.language);
  await page.route('**/api/account', (route) => route.fulfill({ json: { profile, operator: false } }));
  let reads = 0;
  await page.route('**/api/billing', (route) => {
    reads++;
    return route.fulfill({ json: { enabled: false, canManage: true, amount: 800, currency: 'eur', subscription: { status: 'past_due', amount: 800, currency: 'eur', grace_until: Date.now() + 3 * 86400_000, next_charge_at: Date.now() + 86400_000, paid_until: Date.now() - 1, cancel_at: null } } });
  });
  await page.goto('/account');
  const billing = page.getByRole('region', { name: 'Ludus Plus' });
  await expect(billing.getByText(copy.overdue, { exact: true })).toBeVisible();
  await expect(billing.getByText(copy.grace, { exact: false })).toBeVisible();
  await expect(billing.getByRole('button', { name: copy.manage })).toBeEnabled();
  await billing.getByRole('button', { name: copy.refresh }).click();
  await expect.poll(() => reads).toBe(2);
});

test('pending deletion offers retry and never claims completion on cancellation failure', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ludus-language', 'en-GB'));
  let retries = 0;
  await page.route('**/api/account', async (route) => {
    if (route.request().method() === 'DELETE') { retries++; expect(route.request().postDataJSON()).toEqual({ confirmation: 'DELETE' }); }
    return route.fulfill({ status: 202, json: { deletionPending: true } });
  });
  await page.goto('/account');
  await expect(page.getByText('Deletion is pending.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Retry deletion' }).click();
  await expect.poll(() => retries).toBe(1);
  await expect(page.getByRole('button', { name: 'Retry deletion' })).toBeEnabled();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('button', { name: 'Save profile' })).toHaveCount(0);
});
