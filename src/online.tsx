import type { Control } from '../shared/game';
import { humanTiming, phraseIds, reportCategories } from '../shared/human-game';
import type { HumanAction, HumanGame, PhraseId } from '../shared/human-game';
import type { QueueState } from '../shared/matchmaking';
import { isLanguage } from '../shared/waitlist';
import { Header } from './app';
import { AppearanceControls, useAppearance } from './appearance';
import { Board } from './board';
import { capturedPieces } from './captured-pieces';
import { Button } from './components/button';
import { ControlIcon } from './components/control-icon';
import { gameCopy } from './game-copy';
import { onlineCopy } from './online-copy';
import { predictMove, shouldApplySnapshot } from './online-move';
import { Dialog } from '@base-ui/react/dialog';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

const Board3D = lazy(() => import('./board-3d'));
function Glyph({
  name,
}: {
  name:
    | 'flag'
    | 'close'
    | 'half'
    | 'yes'
    | 'no'
    | 'bell'
    | 'mute'
    | 'wave'
    | 'star'
    | 'medal'
    | 'thanks'
    | 'hands';
}) {
  const path = {
    bell: 'M6 16h12l-1.4-2V10a4.6 4.6 0 0 0-9.2 0v4zM10 18a2 2 0 0 0 4 0',
    close: 'M6 6l12 12M18 6L6 18',
    flag: 'M5 21V4M5 4h9l-2 3 2 3H5',
    half: 'M6 16c3-7 9-7 12 0M8 11h8',
    hands: 'M8 13V8m4 6V6m4 7V9M6 14c0 4 2.5 6 6 6s6-2 6-6',
    medal: 'M8 3h8l-1 6a4 4 0 1 1-6 0zM9 14l-2 6 5-2 5 2-2-6',
    mute: 'M6 16h12l-1.4-2V10a4.6 4.6 0 0 0-9.2 0v4zM10 18a2 2 0 0 0 4 0M4 4l16 16',
    no: 'M7 7l10 10M17 7L7 17',
    star: 'M12 4l2.2 4.6 5 .7-3.6 3.5.9 5.1L12 15.8 7.5 17.9l.9-5.1L4.8 9.3l5-.7z',
    thanks: 'M12 19s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z',
    wave: 'M8 14c1-4 3-6 4-6s2 2 3 6M7 17c2 2 8 2 10 0',
    yes: 'M5 12l5 5 9-10',
  }[name];
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
class OnlineGraphics extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
async function api<T>(path: string, input?: unknown): Promise<T> {
  const response = await fetch(`/api/online/${path}`, {
    ...(input === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || 'request_failed');
  }
  return response.json();
}
export function Online() {
  const { i18n } = useTranslation();
  const language = isLanguage(i18n.language) ? i18n.language : 'en-GB';
  const c = onlineCopy[language];
  const boardCopy = gameCopy[language];
  const [params, setParams] = useSearchParams();
  const id = params.get('game');
  const inviteToken = params.get('invite');
  const [user, setUser] = useState<string | null | undefined>();
  const appearance = useAppearance(Boolean(user));
  const [queue, setQueue] = useState<QueueState>({ status: 'idle' });
  const [game, setGame] = useState<HumanGame | null>(null);
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [missingInvite, setMissingInvite] = useState(false);
  const [control, setControl] = useState<Control>('5+3');
  const [colour, setColour] = useState<'w' | 'b' | 'random'>('random');
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [view, setView] = useState<'2d' | '3d'>(() => {
    try {
      return localStorage.getItem('ludus-board') === '2d' ? '2d' : '3d';
    } catch {
      return '3d';
    }
  });
  const [resetKey, setResetKey] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [received, setReceived] = useState<PhraseId | null>(null);
  const [category, setCategory] = useState<(typeof reportCategories)[number]>('assistance');
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [replay, setReplay] = useState<{
    moves: string[];
    ply: number;
    branch: number | null;
  } | null>(null);
  const [prediction, setPrediction] = useState<HumanGame | null>(null);
  const [history, setHistory] = useState<
    { id: string; control: string; rated: boolean; result: string | null }[]
  >([]);
  const offset = useRef(0);
  const latest = useRef<HumanGame | null>(null);
  const lock = useRef(false);
  const predicted = useRef<{ baseRevision: number; moves: number } | null>(null);
  const accept = (snapshot: { game: HumanGame; serverNow: number }) => {
    if (!shouldApplySnapshot(latest.current, snapshot.game, predicted.current)) {
      return;
    }
    predicted.current = null;
    setPrediction(null);
    latest.current = snapshot.game;
    offset.current = snapshot.serverNow - Date.now();
    setGame(snapshot.game);
    setNow(snapshot.serverNow);
  };
  useEffect(() => {
    void fetch('/api/me')
      .then((response) => response.json() as Promise<{ user: { id: string } | null }>)
      .then((identity) => {
        setUser(identity.user?.id ?? null);
      })
      .catch(() => {
        setError(true);
      });
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now() + offset.current);
    }, 200);
    return () => {
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!user || id) {
      return;
    }
    let cancelled = false;
    const poll = () => {
      void api<QueueState>('status')
        .then((state) => {
          if (cancelled) {
            return;
          }
          setQueue(state);
          if (state.status === 'assigned') {
            setParams({ game: state.match.id });
          } else if (state.status === 'invited' && inviteToken !== state.token) {
            setParams({ invite: state.token });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError(true);
          }
        });
    };
    poll();
    const timer = setInterval(poll, 2000);
    void api<typeof history>('history')
      .then(setHistory)
      .catch(() => {
        setError(true);
      });
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user, id, inviteToken]);
  useEffect(() => {
    if (!user || id) {
      return;
    }
    let disposed = false;
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      try {
        socket = new WebSocket(
          `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/online/socket`,
        );
      } catch {
        if (!disposed) {
          timer = setTimeout(connect, 1500);
        }
        return;
      }
      socket.onmessage = (event) => {
        if (disposed) {
          return;
        }
        try {
          const state = JSON.parse(String(event.data)) as QueueState;
          if (state.status === 'assigned') {
            setParams({ game: state.match.id });
          }
        } catch {
          /* The status poll remains the fallback. */
        }
      };
      socket.onclose = () => {
        if (!disposed) {
          timer = setTimeout(connect, 1500);
        }
      };
      socket.onerror = () => {
        socket.close();
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [user, id]);
  useEffect(() => {
    if (!user || !id) {
      setGame(null);
      latest.current = null;
      predicted.current = null;
      setPrediction(null);
      return;
    }
    let disposed = false;
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    setReplay(null);
    setSelected(null);
    setPromotion(null);
    setReported(false);
    setReceived(null);
    predicted.current = null;
    setPrediction(null);
    void api<{ game: HumanGame; serverNow: number }>(`games/${id}`)
      .then((snapshot) => {
        if (!disposed) {
          if (
            !latest.current ||
            latest.current.id !== snapshot.game.id ||
            latest.current.revision < snapshot.game.revision
          ) {
            accept(snapshot);
          }
          setFlipped(snapshot.game.players.b === user);
        }
      })
      .catch(() => {
        if (!disposed) {
          setError(true);
        }
      });
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/online/games/${id}/socket`,
      );
      socket.onopen = () => {
        if (!disposed) {
          setConnected(true);
        }
      };
      socket.onmessage = (event) => {
        if (disposed) {
          return;
        }
        try {
          const data = JSON.parse(event.data);
          if (data.game) {
            accept(data);
          } else if (phraseIds.includes(data.phrase) && !mutedRef.current) {
            setReceived(data.phrase);
          }
        } catch {
          setError(true);
        }
      };
      socket.onclose = () => {
        if (!disposed) {
          setConnected(false);
          timer = setTimeout(connect, 1500);
        }
      };
      socket.onerror = () => {
        socket.close();
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      socket?.close();
      setConnected(false);
    };
  }, [user, id]);
  async function run(operation: () => Promise<void>) {
    if (lock.current) {
      return;
    }
    lock.current = true;
    setPending(true);
    setError(false);
    try {
      await operation();
    } catch {
      setError(true);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const act = async (action: Omit<HumanAction, 'revision'>) =>
    run(async () => {
      if (!game) {
        return;
      }
      accept(await api(`games/${game.id}`, { ...action, revision: game.revision }));
      setSelected(null);
      setPromotion(null);
    });
  const navigate = (next: typeof replay) => {
    setReplay(next);
    setSelected(null);
    setPromotion(null);
  };
  const shown = useMemo(() => {
    const chess = new Chess();
    const moves = replay ? replay.moves.slice(0, replay.ply) : (prediction?.moves ?? game?.moves);
    if (moves) {
      for (const move of moves) {
        chess.move(move);
      }
    }
    return chess;
  }, [game?.moves, prediction?.moves, replay]);
  const captured = useMemo(() => capturedPieces(shown), [shown]);
  const playerColour = game?.players.w === user ? 'w' : 'b';
  function move(from: Square, to: Square, promoted?: string) {
    if (!game) {
      return;
    }
    if (game.result) {
      const chess = new Chess(shown.fen());
      const played = chess.move({ from, promotion: promoted, to });
      const cursor = replay?.ply ?? game.moves.length;
      setReplay({
        branch: Math.min(replay?.branch ?? cursor, cursor),
        moves: [...(replay?.moves ?? game.moves).slice(0, cursor), played.san],
        ply: cursor + 1,
      });
      setSelected(null);
      setPromotion(null);
    } else {
      const next = predictMove(game, from, to, promoted);
      if (!next) {
        return;
      }
      const { revision } = game;
      const gameId = game.id;
      predicted.current = { baseRevision: revision, moves: next.moves.length };
      setPrediction(next);
      setSelected(null);
      setPromotion(null);
      void run(async () => {
        const sync = async (conflict: boolean) => {
          if (conflict) {
            predicted.current = null;
            setPrediction(null);
          }
          try {
            const snapshot = await api<{ game: HumanGame; serverNow: number }>(`games/${gameId}`);
            predicted.current = null;
            setPrediction(null);
            accept(snapshot);
          } catch {
            throw new Error('request_failed');
          }
        };
        try {
          const response = await fetch(`/api/online/games/${gameId}`, {
            body: JSON.stringify({ type: 'move', from, to, promotion: promoted, revision }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            signal: AbortSignal.timeout(15_000),
          });
          if (response.status === 409) {
            await sync(true);
            return;
          }
          if (!response.ok) {
            await sync(false);
            return;
          }
          accept((await response.json()) as { game: HumanGame; serverNow: number });
        } catch (error) {
          if (error instanceof Error && error.message === 'request_failed') {
            throw error;
          }
          await sync(false);
        }
      });
    }
  }
  function square(square: Square) {
    if (!game || (!game.result && (!connected || pending || shown.turn() !== playerColour))) {
      return;
    }
    if (shown.get(square)?.color === shown.turn()) {
      setSelected(selected === square ? null : square);
      return;
    }
    if (!selected) {
      return;
    }
    const legal = shown
      .moves({ square: selected, verbose: true })
      .filter((candidate) => candidate.to === square);
    if (legal.length === 0) {
      setSelected(null);
      return;
    }
    if (legal.some((candidate) => candidate.promotion)) {
      setPromotion({ from: selected, to: square });
    } else {
      move(selected, square);
    }
  }
  const timing = game ? humanTiming(game, now) : null;
  const last = useMemo(() => shown.history({ verbose: true }).at(-1), [shown]);
  const props = {
    appearance: appearance.appearance,
    copy: boardCopy,
    destinations: selected
      ? shown.moves({ square: selected, verbose: true }).map((move) => move.to)
      : [],
    fen: shown.fen(),
    flipped,
    lastMove: last ? [last.from, last.to] : [],
    onSquare: square,
    selected,
  };
  const clock = (time: number) =>
    `${Math.floor(Math.ceil(time / 1000) / 60)}:${String(Math.ceil(time / 1000) % 60).padStart(2, '0')}`;
  const playing = Boolean(id && game);
  return (
    <div className={`site-shell game-shell${playing ? ' match-shell' : ''}`}>
      <Header compact={playing} />
      <main id="main" className="game-main">
        {!playing && (
          <>
            <Link to="/play" className="text-sm underline">
              {c.back}
            </Link>
            <h1 className="my-6 font-display text-5xl">{c.title}</h1>
          </>
        )}
        {(error || missingInvite) && (
          <p role="alert" className="game-notice">
            {missingInvite ? c.inviteMissing : c.error}
          </p>
        )}
        {user === undefined ? (
          <p>{boardCopy.loading}</p>
        ) : user ? (
          id ? (
            !game ? (
              <p>{boardCopy.loading}</p>
            ) : (
              <div className="match-layout">
                <div className="match-heading">
                  <Link to="/online" className="eyebrow text-muted" aria-label={c.back}>
                    ←
                  </Link>
                  <h1 className="sr-only">{c.title}</h1>
                  <span className="match-badge">{game.control}</span>
                </div>
                <div className="match-grid">
                  <section className="match-stage">
                    <div className="match-players" aria-label={c.control}>
                      <span className="player-bar">
                        <span className="piece-pip pip-w" aria-hidden="true" />
                        <span className="sr-only">{boardCopy.white}</span>
                        <span
                          className={`clock ${shown.turn() === 'w' && !game.result ? 'clock-active' : ''}`}
                        >
                          {clock(timing!.clocks.w)}
                        </span>
                      </span>
                      <span className="player-bar">
                        <span className="piece-pip pip-b" aria-hidden="true" />
                        <span className="sr-only">{boardCopy.black}</span>
                        <span
                          className={`clock ${shown.turn() === 'b' && !game.result ? 'clock-active' : ''}`}
                        >
                          {clock(timing!.clocks.b)}
                        </span>
                      </span>
                    </div>
                    <div className="board-frame">
                      {view === '3d' ? (
                        <OnlineGraphics fallback={<Board {...props} />}>
                          <Suspense fallback={<p>{boardCopy.loading}</p>}>
                            <Board3D
                              {...props}
                              resetKey={resetKey}
                              looking={false}
                              captured={captured}
                              tableClock={{
                                times: { w: clock(timing!.clocks.w), b: clock(timing!.clocks.b) },
                                active:
                                  game.result || timing!.pauseRemaining > 0
                                    ? null
                                    : (game.fen.split(' ')[1] as 'w' | 'b'),
                              }}
                            />
                          </Suspense>
                          <Board {...props} concealed />
                        </OnlineGraphics>
                      ) : (
                        <Board {...props} />
                      )}
                    </div>
                    <div className="board-tools" role="group" aria-label={boardCopy.board}>
                      <Button
                        className="game-secondary icon-button"
                        aria-label={view === '3d' ? boardCopy.view2d : boardCopy.view3d}
                        onClick={() => {
                          setView(view === '3d' ? '2d' : '3d');
                        }}
                      >
                        <ControlIcon name="board" />
                      </Button>
                      <Button
                        className="game-secondary icon-button"
                        aria-label={boardCopy.flip}
                        onClick={() => {
                          setFlipped(!flipped);
                        }}
                      >
                        <ControlIcon name="flip" />
                      </Button>
                      {view === '3d' && (
                        <Button
                          className="game-secondary icon-button"
                          aria-label={boardCopy.reset}
                          onClick={() => {
                            setResetKey(resetKey + 1);
                          }}
                        >
                          <ControlIcon name="reset" />
                        </Button>
                      )}
                    </div>
                  </section>
                  <aside className="match-sidebar">
                    <h2 className="sr-only" role="status">
                      {game.result
                        ? `${c.finished} · ${game.result.reason === 'agreement' ? c.agreement : game.result.reason === 'abort' ? c.abortReason : boardCopy[game.result.reason]}`
                        : shown.turn() === playerColour
                          ? c.turn
                          : c.opponentTurn}
                    </h2>
                    {!game.result &&
                      (!connected ? (
                        <p className="sr-only">{c.reconnect}</p>
                      ) : (
                        timing!.pauseRemaining > 0 && (
                          <p className="sr-only" role="status">
                            {c.disconnected} · {Math.ceil(timing!.pauseRemaining / 1000)}{' '}
                            {c.seconds}
                          </p>
                        )
                      ))}
                    <section aria-label={boardCopy.moveList}>
                      <ol>
                        {(prediction ?? game).moves.map((move, ply) => (
                          <li key={ply}>
                            <Button
                              disabled={!game.result}
                              onClick={() => {
                                navigate({ moves: game.moves, ply: ply + 1, branch: null });
                              }}
                            >
                              {ply % 2 === 0 ? `${Math.floor(ply / 2) + 1}. ` : ''}
                              {move}
                            </Button>
                          </li>
                        ))}
                      </ol>
                    </section>
                    {game.result ? (
                      <section aria-label={c.replay}>
                        <div className="replay-controls">
                          <Button
                            aria-label={boardCopy.beginning}
                            onClick={() => {
                              navigate({
                                moves: replay?.moves ?? game.moves,
                                ply: 0,
                                branch: replay?.branch ?? null,
                              });
                            }}
                          >
                            │‹
                          </Button>
                          <Button
                            aria-label={boardCopy.previous}
                            onClick={() => {
                              navigate({
                                moves: replay?.moves ?? game.moves,
                                ply: Math.max(0, (replay?.ply ?? game.moves.length) - 1),
                                branch: replay?.branch ?? null,
                              });
                            }}
                          >
                            ‹
                          </Button>
                          <Button
                            aria-label={boardCopy.next}
                            onClick={() => {
                              navigate({
                                moves: replay?.moves ?? game.moves,
                                ply: Math.min(
                                  (replay?.moves ?? game.moves).length,
                                  (replay?.ply ?? game.moves.length) + 1,
                                ),
                                branch: replay?.branch ?? null,
                              });
                            }}
                          >
                            ›
                          </Button>
                          <Button
                            aria-label={boardCopy.latest}
                            onClick={() => {
                              navigate(null);
                            }}
                          >
                            ›│
                          </Button>
                        </div>
                        {replay?.branch !== null && replay?.branch !== undefined && (
                          <p className="sr-only">
                            {c.variation}: {replay.moves.slice(replay.branch, replay.ply).join(' ')}
                          </p>
                        )}
                        <div className="icon-row mt-3">
                          <Link
                            className="icon-button"
                            to={`/coach/${game.id}`}
                            aria-label={c.coach}
                          >
                            <Glyph name="medal" />
                          </Link>
                          <Link className="icon-button" to="/online" aria-label={boardCopy.newGame}>
                            ←
                          </Link>
                        </div>
                      </section>
                    ) : (
                      <div className="icon-row">
                        {game.moves.length < 2 && (
                          <Button
                            className="icon-button"
                            aria-label={c.abort}
                            disabled={pending || !connected}
                            onClick={() => void act({ type: 'abort' })}
                          >
                            <Glyph name="close" />
                          </Button>
                        )}
                        <Button
                          className="icon-button"
                          aria-label={c.resign}
                          disabled={pending || !connected}
                          onClick={() => void act({ type: 'resign' })}
                        >
                          <Glyph name="flag" />
                        </Button>
                        {game.drawOffer && game.drawOffer !== playerColour ? (
                          <>
                            <p className="sr-only">{c.drawPending}</p>
                            <Button
                              className="icon-button"
                              aria-label={c.accept}
                              disabled={pending}
                              onClick={() => void act({ type: 'acceptDraw' })}
                            >
                              <Glyph name="yes" />
                            </Button>
                            <Button
                              className="icon-button"
                              aria-label={c.decline}
                              disabled={pending}
                              onClick={() => void act({ type: 'declineDraw' })}
                            >
                              <Glyph name="no" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            className="icon-button"
                            aria-label={c.offer}
                            disabled={pending || game.moves.length < 2 || Boolean(game.drawOffer)}
                            onClick={() => void act({ type: 'offerDraw' })}
                          >
                            <Glyph name="half" />
                          </Button>
                        )}
                        <Button
                          className="icon-button"
                          aria-label={c.claim}
                          disabled={
                            pending ||
                            shown.turn() !== playerColour ||
                            (!shown.isThreefoldRepetition() && !shown.isDrawByFiftyMoves())
                          }
                          onClick={() => void act({ type: 'claimDraw' })}
                        >
                          <Glyph name="medal" />
                        </Button>
                      </div>
                    )}
                    <AppearanceControls state={appearance} swatches />
                    <section aria-label={c.phrases} className="icon-row">
                      <Button
                        className="icon-button"
                        aria-label={muted ? c.unmute : c.mute}
                        aria-pressed={muted}
                        onClick={() => {
                          mutedRef.current = !muted;
                          setMuted(!muted);
                          setReceived(null);
                        }}
                      >
                        <Glyph name={muted ? 'mute' : 'bell'} />
                      </Button>
                      {!muted &&
                        phraseIds.map((phrase) => (
                          <Button
                            key={phrase}
                            className="icon-button"
                            aria-label={c.phrase[phrase]}
                            disabled={pending || !connected}
                            onClick={() =>
                              void run(async () => {
                                await api(`games/${id}/phrase`, { phrase });
                              })
                            }
                          >
                            <Glyph
                              name={
                                (
                                  {
                                    hello: 'wave',
                                    goodLuck: 'star',
                                    wellPlayed: 'medal',
                                    thanks: 'thanks',
                                    goodGame: 'hands',
                                  } as const
                                )[phrase]
                              }
                            />
                          </Button>
                        ))}
                      {!muted && (
                        <p className="sr-only" role="status">
                          {received ? c.phrase[received] : ''}
                        </p>
                      )}
                    </section>
                    <div className="icon-row">
                      <Button
                        className="icon-button"
                        aria-label={c.report}
                        aria-pressed={reporting}
                        disabled={reported}
                        onClick={() => {
                          setReporting(!reporting);
                        }}
                      >
                        <Glyph name="flag" />
                      </Button>
                      {reporting && !reported && (
                        <>
                          <select
                            className="game-input"
                            aria-label={c.report}
                            value={category}
                            onChange={(event) => {
                              setCategory(event.target.value as typeof category);
                            }}
                          >
                            {reportCategories.map((item, index) => (
                              <option key={item} value={item}>
                                {c.reports[index]}
                              </option>
                            ))}
                          </select>
                          <Button
                            className="icon-button"
                            aria-label={c.report}
                            disabled={pending}
                            onClick={() =>
                              void run(async () => {
                                await api(`games/${id}/report`, { category });
                                setReported(true);
                                setReporting(false);
                              })
                            }
                          >
                            <Glyph name="yes" />
                          </Button>
                        </>
                      )}
                      {reported && (
                        <p className="sr-only" role="status">
                          {c.reportSent}
                        </p>
                      )}
                    </div>
                  </aside>
                  {promotion && (
                    <Dialog.Root
                      open
                      onOpenChange={(open) => {
                        if (!open) setPromotion(null);
                      }}
                    >
                      <Dialog.Portal>
                        <Dialog.Backdrop className="fixed inset-0 z-50 bg-ink/50" />
                        <Dialog.Popup className="promotion-panel fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2">
                          <Dialog.Title>{boardCopy.promotion}</Dialog.Title>
                          {(['q', 'r', 'b', 'n'] as const).map((piece) => (
                            <Button
                              className="game-secondary"
                              key={piece}
                              onClick={() => {
                                move(promotion.from, promotion.to, piece);
                              }}
                            >
                              {
                                {
                                  q: boardCopy.queen,
                                  r: boardCopy.rook,
                                  b: boardCopy.bishop,
                                  n: boardCopy.knight,
                                }[piece]
                              }
                            </Button>
                          ))}
                        </Dialog.Popup>
                      </Dialog.Portal>
                    </Dialog.Root>
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="grid max-w-2xl gap-5">
              {inviteToken && !(queue.status === 'invited' && queue.token === inviteToken) ? (
                <>
                  <label className="setup-label">
                    {c.colour}
                    <select
                      className="game-input"
                      value={colour}
                      onChange={(event) => {
                        setColour(event.target.value as typeof colour);
                      }}
                    >
                      <option value="random">{c.random}</option>
                      <option value="w">{boardCopy.white}</option>
                      <option value="b">{boardCopy.black}</option>
                    </select>
                  </label>
                  <Button
                    className="game-primary"
                    disabled={pending}
                    onClick={() =>
                      void run(async () => {
                        setMissingInvite(false);
                        try {
                          const state = await api<QueueState>('invitations/redeem', {
                            token: inviteToken,
                            colour,
                          });
                          if (state.status === 'assigned') setParams({ game: state.match.id });
                        } catch (caught) {
                          if (caught instanceof Error && caught.message === 'not_found') {
                            setMissingInvite(true);
                            return;
                          }
                          throw caught;
                        }
                      })
                    }
                  >
                    {c.join}
                  </Button>
                </>
              ) : (
                <>
                  <label className="setup-label">
                    {c.control}
                    <select
                      className="game-input"
                      value={control}
                      onChange={(event) => {
                        setControl(event.target.value as Control);
                      }}
                    >
                      <option>5+3</option>
                      <option>10+5</option>
                    </select>
                  </label>
                  {queue.status === 'computer' && (
                    <Link className="game-primary" to={`/play?game=${queue.id}`}>
                      {boardCopy.resume}
                    </Link>
                  )}
                  {queue.status === 'idle' && (
                    <div className="flex flex-wrap gap-3">
                      <Button
                        className="game-primary"
                        disabled={pending}
                        onClick={() =>
                          void run(async () => {
                            const result = await api<{ token: string; expiresAt: number }>(
                              'invitations',
                              { control },
                            );
                            setQueue({ status: 'invited', ...result });
                            setParams({ invite: result.token });
                          })
                        }
                      >
                        {c.friend}
                      </Button>
                      <Button
                        className="game-secondary"
                        disabled={pending}
                        onClick={() =>
                          void run(async () => {
                            const state = await api<QueueState>('queue', { control, rated: false });
                            setQueue(state);
                            if (state.status === 'assigned') setParams({ game: state.match.id });
                          })
                        }
                      >
                        {c.find}
                      </Button>
                    </div>
                  )}
                  {queue.status === 'invited' && (
                    <>
                      <label className="setup-label">
                        {c.invitation}
                        <input
                          className="game-input"
                          readOnly
                          value={`${location.origin}/online?invite=${queue.token}`}
                          onFocus={(event) => {
                            event.target.select();
                          }}
                        />
                      </label>
                      <Button
                        className="game-secondary"
                        disabled={pending}
                        onClick={() =>
                          void run(async () => {
                            setQueue(await api('invitations/cancel', { token: queue.token }));
                            setParams({});
                          })
                        }
                      >
                        {c.cancelInvite}
                      </Button>
                    </>
                  )}
                  {queue.status === 'queued' && (
                    <>
                      <p role="status">{c.waiting}</p>
                      <Button
                        className="game-secondary"
                        disabled={pending}
                        onClick={() =>
                          void run(async () => {
                            setQueue(await api('queue/cancel', { token: queue.entry.token }));
                          })
                        }
                      >
                        {c.cancel}
                      </Button>
                      {now - queue.entry.joinedAt >= 30_000 && (
                        <>
                          <p>{c.aiHint}</p>
                          <Button
                            className="game-primary"
                            disabled={pending}
                            onClick={() =>
                              void run(async () => {
                                const state = await api<QueueState & { aiAccepted?: boolean }>(
                                  'queue/ai',
                                  { token: queue.entry.token },
                                );
                                if (state.status === 'assigned')
                                  setParams({ game: state.match.id });
                                else if (state.aiAccepted) location.assign('/play');
                              })
                            }
                          >
                            {c.ai}
                          </Button>
                        </>
                      )}
                    </>
                  )}
                  {history.length > 0 && (
                    <section>
                      <h2 className="sr-only">{c.history}</h2>
                      <ul>
                        {history.map((entry) => (
                          <li key={entry.id}>
                            <Link className="history-row" to={`/online?game=${entry.id}`}>
                              {entry.control} · {entry.result ? c.finished : boardCopy.resume}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </>
              )}
            </div>
          )
        ) : (
          <Link
            to={
              inviteToken
                ? `/play?returnTo=${encodeURIComponent(`/online?invite=${inviteToken}`)}`
                : '/play'
            }
            className="game-primary"
          >
            {c.signIn}
          </Link>
        )}
      </main>
    </div>
  );
}
