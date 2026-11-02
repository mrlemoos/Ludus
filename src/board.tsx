import { appearanceMaterials } from '../shared/cosmetics';
import type { Appearance } from '../shared/cosmetics';
import { Button } from './components/button';
import type { GameCopy } from './game-copy';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { useRef } from 'react';
import type { KeyboardEvent } from 'react';

export const symbols = {
  b: { b: '♝', k: '♚', n: '♞', p: '♟', q: '♛', r: '♜' },
  w: { b: '♗', k: '♔', n: '♘', p: '♙', q: '♕', r: '♖' },
};
export interface BoardPosition {
  fen: string;
  flipped: boolean;
  selected: Square | null;
  destinations: string[];
  lastMove: string[];
}
export interface BoardProps {
  position: BoardPosition;
  onSquare: (square: Square) => void;
  copy: GameCopy;
  concealed?: boolean;
  appearance?: Appearance;
}
export function Board({ position, onSquare, copy: c, concealed, appearance }: BoardProps) {
  const { fen, flipped, selected, destinations, lastMove } = position;
  const chess = new Chess(fen);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const squares = Array.from(
    { length: 64 },
    (_, i) =>
      `${'abcdefgh'[flipped ? 7 - (i % 8) : i % 8]}${flipped ? Math.floor(i / 8) + 1 : 8 - Math.floor(i / 8)}` as Square,
  );
  const pieceNames = { b: c.bishop, k: c.king, n: c.knight, p: c.pawn, q: c.queen, r: c.rook };
  function key(event: KeyboardEvent, i: number) {
    const delta: Record<string, number> = {
      ArrowDown: 8,
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -8,
    };
    if (event.key in delta) {
      event.preventDefault();
      refs.current[Math.max(0, Math.min(63, i + delta[event.key]))]?.focus();
    }
  }
  return (
    <div className={concealed ? 'accessible-board' : ''}>
      <p id="board-help" className="sr-only">
        {c.keyboard}
      </p>
      <div className="play-board" role="group" aria-label={c.board} aria-describedby="board-help">
        {squares.map((square, i) => {
          const piece = chess.get(square);
          const legal = destinations.includes(square);
          return (
            <Button
              key={square}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              data-square={square}
              style={
                appearance && selected !== square && !lastMove.includes(square)
                  ? {
                      backgroundColor:
                        appearanceMaterials[appearance.board][
                          (square.charCodeAt(0) + Number(square[1])) % 2 === 0 ? 'dark' : 'light'
                        ],
                    }
                  : undefined
              }
              className={`board-cell ${(square.charCodeAt(0) + Number(square[1])) % 2 === 0 ? 'cell-dark' : 'cell-light'} ${selected === square ? 'cell-selected' : ''} ${lastMove.includes(square) ? 'cell-last' : ''}`}
              aria-label={`${square}, ${piece ? `${piece.color === 'w' ? c.white : c.black} ${pieceNames[piece.type]}` : c.empty}${legal ? `, ${c.legal}` : ''}`}
              aria-pressed={selected === square}
              onClick={() => {
                onSquare(square);
              }}
              onKeyDown={(e) => {
                key(e, i);
              }}
            >
              {i % 8 === 0 && (
                <span className="rank-label" aria-hidden="true">
                  {square[1]}
                </span>
              )}
              {i >= 56 && (
                <span className="file-label" aria-hidden="true">
                  {square[0]}
                </span>
              )}
              {piece && (
                <span aria-hidden="true" className={`chess-glyph piece-${piece.color}`}>
                  {symbols[piece.color][piece.type]}
                </span>
              )}
              {legal && <span className={piece ? 'capture-ring' : 'move-dot'} aria-hidden="true" />}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
