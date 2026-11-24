import { onlineCopy } from './online-copy';
import { expect, it } from 'vitest';

it('records the online copy', () => {
  // Arrange

  // Act
  const copy = onlineCopy;

  // Assert
  expect(copy).toMatchSnapshot();
});
