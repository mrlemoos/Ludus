import { coachCopy } from './coach-copy';
import { expect, it } from 'vitest';

it('records the coach copy', () => {
  // Arrange

  // Act
  const copy = coachCopy;

  // Assert
  expect(copy).toMatchSnapshot();
});
