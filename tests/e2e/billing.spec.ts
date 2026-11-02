import { expect, test } from '@playwright/test';

const profile = {
  userId: 'billing-fixture',
  username: 'BillingPlayer',
  language: 'en-GB',
  timezone: 'Europe/Madrid',
  chessLevel: 'casual',
  teachingProfile: 'developing',
  activityPublic: false,
  adultAttestedAt: 1,
  onboardedAt: 1,
  trialExpiresAt: Date.now() + 86400_000,
};
const languages = [
  {
    language: 'en-GB',
    region: 'Coach review credits',
    price: 'Buy 10 reviews · €4.99',
    unavailable: 'Purchases are paused while billing checks are completed.',
    monthly: 'Monthly free reviews: 30',
    intro: 'Introductory review: 1',
    refresh: 'Refresh balance',
    terms: 'Terms',
    privacy: 'Privacy',
  },
  {
    language: 'es-ES',
    region: 'Créditos para análisis del entrenador',
    price: 'Comprar 10 análisis · 4,99 €',
    unavailable:
      'Las compras están pausadas mientras se completan las comprobaciones de facturación.',
    monthly: 'Créditos gratuitos de este mes: 30',
    intro: 'Análisis de bienvenida: 1',
    refresh: 'Actualizar saldo',
    terms: 'Condiciones',
    privacy: 'Privacidad',
  },
  {
    language: 'fr-FR',
    region: 'Crédits d’analyse du coach',
    price: 'Acheter 10 analyses · 4,99 €',
    unavailable: 'Les achats sont suspendus pendant les vérifications de facturation.',
    monthly: 'Crédits gratuits ce mois-ci: 30',
    intro: 'Analyse de bienvenue: 1',
    refresh: 'Actualiser le solde',
    terms: 'Conditions',
    privacy: 'Confidentialité',
  },
];

for (const copy of languages)
  test(`shows review-credit balance and unavailable checkout in ${copy.language}`, async ({
    page,
  }) => {
    await page.addInitScript(
      (language) => localStorage.setItem('ludus-language', language),
      copy.language,
    );
    await page.route('**/api/account', (route) =>
      route.fulfill({ json: { profile, operator: false } }),
    );
    let reads = 0;
    await page.route('**/api/billing', (route) => {
      reads++;
      return route.fulfill({
        json: {
          enabled: false,
          reviewCredits: {
            available: 32,
            monthlyFreeRemaining: 30,
            introAvailable: true,
            paidRemaining: 1,
          },
        },
      });
    });
    await page.goto('/account');
    const billing = page.getByRole('region', { name: copy.region });
    await expect(billing.getByText(copy.unavailable, { exact: true })).toBeVisible();
    await expect(billing.getByText(/32/)).toBeVisible();
    await expect(billing.getByText(copy.monthly, { exact: true })).toBeVisible();
    await expect(billing.getByText(copy.intro, { exact: true })).toBeVisible();
    await expect(billing.getByRole('button', { name: copy.price })).toHaveCount(0);
    await expect(billing.getByRole('link', { name: copy.terms })).toHaveAttribute('href', '/terms');
    await expect(billing.getByRole('link', { name: copy.privacy })).toHaveAttribute(
      'href',
      '/privacy',
    );
    await billing.getByRole('button', { name: copy.refresh }).click();
    await expect.poll(() => reads).toBe(2);
  });

test('opens Stripe-hosted Checkout for the fixed review pack', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ludus-language', 'en-GB'));
  await page.route('**/api/account', (route) =>
    route.fulfill({ json: { profile, operator: false } }),
  );
  await page.route('**/api/billing', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        reviewCredits: {
          available: 31,
          monthlyFreeRemaining: 30,
          introAvailable: true,
          paidRemaining: 0,
        },
      },
    }),
  );
  let checkoutCalls = 0;
  await page.route('**/api/billing/review-pack/checkout', async (route) => {
    checkoutCalls++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({});
    await route.fulfill({ json: { url: 'https://checkout.stripe.com/c/pay/cs_fixture' } });
  });
  await page.route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<main>Hosted Checkout fixture</main>',
    }),
  );
  await page.goto('/account');
  await page.getByRole('button', { name: 'Buy 10 reviews · €4.99' }).click();
  await expect(page).toHaveURL('https://checkout.stripe.com/c/pay/cs_fixture');
  expect(checkoutCalls).toBe(1);
});

test('captures the review-credit account layout on desktop and mobile', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ludus-language', 'en-GB'));
  await page.route('**/api/account', (route) =>
    route.fulfill({
      json: {
        profile,
        operator: false,
        activity: { today: '2026-11-01', days: { '2026-11-01': 2, '2026-10-31': 1 }, streak: 2 },
      },
    }),
  );
  await page.route('**/api/billing', (route) =>
    route.fulfill({
      json: {
        enabled: false,
        reviewCredits: {
          available: 32,
          monthlyFreeRemaining: 30,
          introAvailable: true,
          paidRemaining: 1,
        },
      },
    }),
  );
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/account');
  await expect(page.getByRole('region', { name: 'Coach review credits' })).toBeVisible();
  await expect(page.locator('.profile-activity + .profile-billing')).toHaveCount(1);
  await expect(page.getByText('Activity could not be loaded.')).toHaveCount(0);
  await page.screenshot({ path: '.scratch/review-packs/account-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('.profile-activity + .profile-billing')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: '.scratch/review-packs/account-mobile.png', fullPage: true });
});

test('policy pages use the selected launch language and link back to the account', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('ludus-language', 'fr-FR'));
  await page.goto('/terms');
  await expect(page.getByRole('heading', { name: 'Conditions d’utilisation' })).toBeVisible();
  await expect(page.getByText(/une analyse IA de bienvenue à vie/)).toBeVisible();
  await page.getByRole('link', { name: 'Confidentialité' }).click();
  await expect(page.getByRole('heading', { name: 'Notice de confidentialité' })).toBeVisible();
  const historyDisclosure = page.getByText(/trois parties terminées précédentes/);
  await expect(historyDisclosure).toHaveCount(2);
  await expect(historyDisclosure.first()).toBeVisible();
  await expect(historyDisclosure.last()).toBeVisible();
});

test('pending deletion offers retry and never claims completion on cancellation failure', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('ludus-language', 'en-GB'));
  let retries = 0;
  await page.route('**/api/account', async (route) => {
    if (route.request().method() === 'DELETE') {
      retries++;
      expect(route.request().postDataJSON()).toEqual({ confirmation: 'DELETE' });
    }
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
