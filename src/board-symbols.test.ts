import { symbols } from './board';
import { expect, it } from 'vitest';

it('records the board symbols', () => {
  // Arrange

  // Act
  const pieces = symbols;

  // Assert
  expect(pieces).toMatchInlineSnapshot(`
    {
      "b": {
        "b": "♝",
        "k": "♚",
        "n": "♞",
        "p": "♟",
        "q": "♛",
        "r": "♜",
      },
      "w": {
        "b": "♗",
        "k": "♔",
        "n": "♘",
        "p": "♙",
        "q": "♕",
        "r": "♖",
      },
    }
  `);
});
