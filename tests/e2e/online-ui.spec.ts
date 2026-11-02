import type { QueueState } from '../../shared/matchmaking';
import { expect, test } from '@playwright/test';

test('online lobby exposes friend links and requires explicit acceptance to leave a human queue for AI', async ({
  page,
}) => {
  let state: QueueState = { status: 'idle' };
  const writes: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('ludus-language', 'en-GB');
    localStorage.setItem('ludus-board', '2d');
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
      const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {writes.push(path);}
    if (path === '/api/me')
      {return route.fulfill({ json: { user: { id: 'one', name: 'Player one' } } });}
    if (path === '/api/appearance')
      {return route.fulfill({ json: { appearance: { board: 'wood', pieces: 'wood' } } });}
    if (path.endsWith('/history')) {return route.fulfill({ json: [] });}
    if (path === '/api/online/invitations') {
      state = {
        status: 'invited',
        token: '11111111-1111-4111-8111-111111111111',
        expiresAt: Date.now() + 86_400_000,
      };
      return route.fulfill({ json: state });
    }
    if (path.endsWith('/invitations/cancel') || path.endsWith('/queue/cancel'))
      {state = { status: 'idle' };}
    if (path.endsWith('/queue'))
      {state = {
        status: 'queued',
        entry: {
          user: 'one',
          control: '5+3',
          rated: false,
          rating: 1500,
          joinedAt: Date.now() - 31000,
          token: 'queue-token',
        },
      };}
    if (path.endsWith('/queue/ai')) {
      expect(request.postDataJSON()).toEqual({ token: 'queue-token' });
      state = { status: 'idle' };
      return route.fulfill({ json: { ...state, aiAccepted: true } });
    }
    return route.fulfill({ json: state });
  });
  await page.goto('/online');
  await expect(page.getByRole('heading', { name: 'Play another person' })).toBeVisible();
  await page.getByRole('button', { name: 'Invite a friend', exact: true }).click();
  await expect(page.getByLabel('Invitation link')).toHaveValue(/\/online\?invite=11111111/);
  await page.getByRole('button', { name: 'Cancel invitation', exact: true }).click();
  await page.getByRole('button', { name: 'Find an opponent', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Play the computer instead', exact: true }),
  ).toBeVisible();
  expect(writes).not.toContain('/api/online/queue/ai');
  await page.getByRole('button', { name: 'Cancel search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Find an opponent', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Find an opponent', exact: true }).click();
  await page.getByRole('button', { name: 'Play the computer instead', exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  expect(writes.filter((path) => path === '/api/online/queue/ai')).toHaveLength(1);
});
