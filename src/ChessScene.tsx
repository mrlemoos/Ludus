const backRank = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

function Piece({ kind }: { kind: string }) {
  return (
    <svg viewBox="0 0 40 64" className="piece" aria-hidden="true">
      <path d="M7 57h26l-2-5H9zM10 49h20l-3-5H13z" />
      {kind === 'pawn' ? <><circle cx="20" cy="23" r="7" /><path d="M16 30h8l-1 8 4 6H13l4-6z" /></> :
        kind === 'knight' ? <path d="m12 43 3-10-5-2 1-8 9-12 7 3 3 12-5 8 3 9zM13 24h7" /> :
        kind === 'rook' ? <path d="M12 43h16l-3-8V22l4-4V10h-5v5h-3v-5h-4v5h-3v-5h-4v8l5 4v13z" /> :
        kind === 'bishop' ? <><path d="M12 43h16l-5-10 5-9-8-15-8 15 5 9z" /><path d="m20 15 4 9" className="piece-cut" /></> :
        kind === 'queen' ? <><path d="M12 43h16l-4-16 5-12-7 5-2-8-3 8-7-5 6 12z" /><circle cx="20" cy="8" r="2.5" /></> :
          <><path d="M12 43h16l-5-15 4-9H13l4 9zM20 4v11M15 9h10" /></>}
      <path d="M10 60h20" className="piece-highlight" />
    </svg>
  );
}

export function ChessScene() {
  return (
    <div className="scene" aria-hidden="true">
      <div className="cafe-arch" /><div className="cafe-arch cafe-arch-second" />
      <div className="scene-light" />
      <div className="table-rim" />
      <div className="chessboard">
        {Array.from({ length: 64 }, (_, i) => {
          const row = Math.floor(i / 8), col = i % 8;
          let kind = row === 0 || row === 7 ? backRank[col] : row === 1 || row === 6 ? 'pawn' : '';
          if ((row === 6 && col === 4) || (row === 1 && col === 4)) kind = '';
          if ((row === 4 && col === 4) || (row === 3 && col === 4)) kind = 'pawn';
          return <div key={i} className={`square ${(row + col) % 2 ? 'square-dark' : 'square-light'} ${row < 4 ? 'piece-dark' : 'piece-light'}`}>
            {kind && <Piece kind={kind} />}
          </div>;
        })}
      </div>
      <div className="cup"><div className="coffee" /></div>
      <div className="scene-wordmark">ludus</div>
    </div>
  );
}
