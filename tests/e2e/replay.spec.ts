import { applyAction, connection, createGame } from '../../shared/game';
import { expect, test } from '@playwright/test';

test('finished replay explores both sides locally and restores the recorded line', async ({
  page,
}) => {
  let game = connection(
    createGame('11111111-1111-4111-8111-111111111111', 'replay-owner', '5+3', 1, 'w', 0),
    true,
    0,
  );
  for (const uci of ['e2e4', 'e7e5', 'g1f3', 'b8c6'])
    {game = applyAction(
      game,
      { type: 'move', from: uci.slice(0, 2), to: uci.slice(2), revision: game.revision },
      game.updatedAt + 1000,
    );}
  game = applyAction(game, { type: 'resign', revision: game.revision }, 5000);
  const writes: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('ludus-language', 'en-GB');
    localStorage.setItem('ludus-board', '2d');
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {writes.push(request.url());}
    const path = new URL(request.url()).pathname;
    if (path === '/api/me')
      {return route.fulfill({
        json: { user: { id: 'replay-owner', name: 'Replay player' }, local: false },
      });}
    if (path === '/api/account')
      {return route.fulfill({ json: { profile: { chessLevel: 'intermediate' } } });}
    if (path === '/api/games')
      {return route.fulfill({
        json: [{ id: game.id, createdAt: 0, result: JSON.stringify(game.result) }],
      });}
    return route.fulfill({ json: { game, serverNow: 5000 } });
  });
  await page.goto(`/play?game=${game.id}`);
  await expect(page.getByRole('heading', { name: 'Lucía won · Resignation' })).toBeVisible();
  await page.getByRole('button', { name: 'e4', exact: true }).click();
  await page.locator('[data-square="c7"]').click();
  await page.locator('[data-square="c5"]').click();
  await expect(page.getByRole('region', { name: 'Variation' })).toContainText('c5');
  await page.locator('[data-square="g1"]').click();
  await page.locator('[data-square="f3"]').click();
  await expect(page.getByRole('region', { name: 'Variation' })).toContainText('c5 Nf3');
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await expect(page.locator('[data-square="g1"]')).toHaveAccessibleName(/White Knight/);
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.locator('[data-square="f3"]')).toHaveAccessibleName(/White Knight/);
  await page.getByRole('button', { name: 'Return to saved line', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Variation' })).toHaveCount(0);
  await expect(page.locator('[data-square="c7"]')).toHaveAccessibleName(/Black Pawn/);
  await page.getByRole('button', { name: 'Final position', exact: true }).click();
  await expect(page.locator('[data-square="c6"]')).toHaveAccessibleName(/Black Knight/);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PGN' }).click();
  expect((await downloadEvent).suggestedFilename()).toBe(`ludus-${game.id}.pgn`);
  expect(writes).toEqual([]);
});
