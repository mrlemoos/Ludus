import { gameCopy } from './game-copy';
import { expect, it } from 'vitest';

it('records the game copy', () => {
  // Arrange

  // Act
  const copy = gameCopy;

  // Assert
  expect(copy).toMatchSnapshot();
});
