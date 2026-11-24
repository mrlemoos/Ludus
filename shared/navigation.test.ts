import { playReturnPath } from './navigation';
import { expect, it } from 'vitest';

it('playReturnPath, a friend invitation, returns the same path', () => {
  // Arrange
  const path = '/online?invite=11111111-1111-4111-8111-111111111111';

  // Act
  const returned = playReturnPath(path);

  // Assert
  expect(returned).toBe('/online?invite=11111111-1111-4111-8111-111111111111');
});

it.each([
  undefined,
  '//evil.test',
  'https://evil.test',
  '/operator',
  '/online?invite=bad',
  '/online?invite=11111111-1111-4111-8111-111111111111&next=https://evil.test',
])('playReturnPath, %s, returns the play page', (value) => {
  // Arrange
  const candidate = value;

  // Act
  const path = playReturnPath(candidate);

  // Assert
  expect(path).toBe('/play');
});
