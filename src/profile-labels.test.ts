import { profileCopy, publicLabels } from './profile-view';
import { expect, it } from 'vitest';

it('records the public labels', () => {
  // Arrange

  // Act
  const labels = publicLabels;

  // Assert
  expect(labels).toMatchSnapshot();
});

it('records the profile copy', () => {
  // Arrange

  // Act
  const copy = profileCopy;

  // Assert
  expect(copy).toMatchSnapshot();
});
