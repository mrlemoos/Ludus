import { playReturnPath } from './navigation';
import { expect, it } from 'vitest';

it('preserves friend invitations while rejecting open redirects and unrelated paths', () => {
  const path = '/online?invite=11111111-1111-4111-8111-111111111111';
  expect(playReturnPath(path)).toBe(path);
  for (const value of [
    undefined,
    '//evil.test',
    'https://evil.test',
    '/operator',
    '/online?invite=bad',
    '/online?invite=11111111-1111-4111-8111-111111111111&next=https://evil.test',
  ])
    {expect(playReturnPath(value)).toBe('/play');}
});
