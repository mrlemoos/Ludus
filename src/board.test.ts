import { Board, boardIsInteractive } from './board';
import { gameCopy } from './game-copy';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('boardIsInteractive', () => {
  it('keeps a live board inert until the socket is open', () => {
    const input = { finished: false, connected: false, pending: false };

    const interactive = boardIsInteractive(input);

    expect(interactive).toBe(false);
  });

  it('accepts moves on a connected live board', () => {
    const input = { finished: false, connected: true, pending: false };

    const interactive = boardIsInteractive(input);

    expect(interactive).toBe(true);
  });

  it('blocks a live board while a move is being saved', () => {
    const input = { finished: false, connected: true, pending: true };

    const interactive = boardIsInteractive(input);

    expect(interactive).toBe(false);
  });

  it('keeps a finished board available for replay while disconnected', () => {
    const input = { finished: true, connected: false, pending: false };

    const interactive = boardIsInteractive(input);

    expect(interactive).toBe(true);
  });
});

describe('Board', () => {
  it('disables squares while a live match is not interactive', () => {
    const board = createElement(Board, {
      copy: gameCopy['en-GB'],
      onSquare: () => {},
      position: {
        destinations: [],
        fen: start,
        flipped: false,
        interactive: false,
        lastMove: [],
        selected: null,
      },
    });

    const html = renderToStaticMarkup(board);

    expect(html).toContain('data-square="e2"');
    expect(html).toContain('disabled=""');
  });
});
