import { coachIdentity, suggestDifficulty } from '../shared/computer';
import type { ComputerHistory } from '../shared/computer';
import { chessFrom, remaining } from '../shared/game';
import type { Action, Control, Difficulty, Game } from '../shared/game';
import { playReturnPath } from '../shared/navigation';
import type { PlayerProfile } from '../shared/profile';
import { replayMove, replayPosition, savedReplay, stepReplay } from '../shared/replay';
import type { Replay } from '../shared/replay';
import { isLanguage } from '../shared/waitlist';
import { Header } from './app';
import { AppearanceControls, useAppearance } from './appearance';
import { Board } from './board';
import { capturedPieces } from './captured-pieces';
import { AppleMailTabs } from './components/apple-mail-tabs';
import { Button } from './components/button';
import { ControlIcon } from './components/control-icon';
import { SlidingPanel } from './components/sliding-panel';
import { gameCopy } from './game-copy';
import { replayCopy } from './replay-copy';
import { Dialog } from '@base-ui/react/dialog';
import { Input } from '@base-ui/react/input';
import { Tabs } from '@base-ui/react/tabs';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

const Board3D = lazy(() => import('./board-3d'));
interface Snapshot {
  game: Game;
  serverNow: number;
}
type History = { id: string; createdAt: number; result: string | null }[];
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(String(response.status));
  }
  return response.json();
}
class GraphicsBoundary extends Component<
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
export function Play() {
  const { i18n } = useTranslation();
  const c = gameCopy[isLanguage(i18n.language) ? i18n.language : 'en-GB'];
  const rc = replayCopy[isLanguage(i18n.language) ? i18n.language : 'en-GB'];
  const [params, setParams] = useSearchParams();
  const gameId = params.get('game');
  const [identity, setIdentity] = useState<{
    user: { id: string; name: string } | null;
    local: boolean;
  } | null>(null);
  const appearanceState = useAppearance(Boolean(identity?.user));
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [computerHistory, setComputerHistory] = useState<ComputerHistory[]>([]);
  const [history, setHistory] = useState<History>([]);
  const [game, setGame] = useState<Game | null>(null);
  const lobbyTab = params.get('tab') === 'history' ? 'history' : 'play';
  function setLobbyTab(tab: 'play' | 'history') {
    setParams(tab === 'history' ? { tab } : {});
  }
  const [email, setEmail] = useState('');
  const [adult, setAdult] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [control, setControl] = useState<Control>('5+3');
  const [difficulty, setDifficulty] = useState<Difficulty>(1);
  const [colour, setColour] = useState<'w' | 'b'>('w');
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [view, setView] = useState<'2d' | '3d'>(() => {
    try {
      return localStorage.getItem('ludus-board') === '2d' ? '2d' : '3d';
    } catch {
      return '3d';
    }
  });
  const [looking, setLooking] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [engineError, setEngineError] = useState(false);
  const [engineRetry, setEngineRetry] = useState(0);
  const [confirmResign, setConfirmResign] = useState(false);
  const [replay, setReplay] = useState<Replay | null>(null);
  const offset = useRef(0);
  const snapshotSequence = useRef(0);
  const lock = useRef(false);
  const accept = useCallback((snapshot: Snapshot) => {
    snapshotSequence.current += 1;
    offset.current = snapshot.serverNow - Date.now();
    setNow(snapshot.serverNow);
    setGame((previous) =>
      previous?.id === snapshot.game.id && previous.revision > snapshot.game.revision
        ? previous
        : snapshot.game,
    );
  }, []);
  const loadHistory = useCallback(
    async () =>
      api<History>('/api/games')
        .then(setHistory)
        .catch(() => {
          setError(true);
        }),
    [],
  );
  useEffect(() => {
    void api<NonNullable<typeof identity>>('/api/me')
      .then(setIdentity)
      .catch(() => {
        setError(true);
      });
  }, []);
  const completedGameKey = game?.result ? `${game.id}:${game.revision}` : null;
  useEffect(() => {
    if (identity?.user) {
      void loadHistory();
    }
  }, [identity?.user?.id, loadHistory, completedGameKey]);
  useEffect(() => {
    if (!identity?.user) {
      return;
    }
    let disposed = false;
    void api<{ profile: PlayerProfile | null }>('/api/account')
      .then((data) => {
        if (!disposed) {
          setProfile(data.profile);
          setProfileLoaded(true);
        }
      })
      .catch(() => {
        if (!disposed) {
          setError(true);
        }
      });
    return () => {
      disposed = true;
    };
  }, [identity?.user?.id]);
  useEffect(() => {
    if (!identity?.user) {
      return;
    }
    let disposed = false;
    void Promise.all(
      history
        .filter((entry) => entry.result)
        .slice(0, 12)
        .map(async (entry) =>
          api<Snapshot>(`/api/games/${entry.id}`).then(({ game }) => ({
            colour: game.colour,
            completedAt: game.updatedAt,
            difficulty: game.difficulty,
            result: game.result,
          })),
        ),
    )
      .then((data) => {
        if (!disposed) {
          setComputerHistory(data);
        }
      })
      .catch(() => {
        /* Suggestions never block play. */
      });
    return () => {
      disposed = true;
    };
  }, [history, identity?.user?.id]);
  const suggestion = profile
    ? suggestDifficulty(profile.chessLevel, difficulty, computerHistory)
    : null;
  useEffect(() => {
    if (!gameId || !identity?.user) {
      setGame(null);
      return;
    }
    let cancelled = false;
    const sequence = snapshotSequence.current;
    setError(false);
    setReplay(null);
    setSelected(null);
    setPromotion(null);
    setLooking(false);
    void api<Snapshot>(`/api/games/${gameId}`)
      .then((data) => {
        if (!cancelled) {
          // A socket snapshot received during this request supersedes the initial read.
          if (snapshotSequence.current === sequence) {
            accept(data);
          }
          setFlipped(data.game.colour === 'b');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, identity?.user?.id, accept]);
  useEffect(() => {
    if (!gameId || !identity?.user) {
      return;
    }
    let disposed = false;
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    function connect() {
      socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/games/${gameId}/socket`,
      );
      socket.onopen = () => {
        if (!disposed) {
          setConnected(true);
          setError(false);
        }
      };
      socket.onmessage = (event) => {
        if (!disposed) {
          try {
            accept(JSON.parse(event.data));
          } catch {
            setError(true);
          }
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
    }
    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      socket.close();
      setConnected(false);
    };
  }, [gameId, identity?.user?.id, accept]);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now() + offset.current);
    }, 200);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const send = useCallback(
    async (action: Action) => {
      if (!gameId || lock.current) {
        return;
      }
      lock.current = true;
      setPending(true);
      setError(false);
      try {
        accept(await api<Snapshot>(`/api/games/${gameId}`, action));
        setSelected(null);
        setPromotion(null);
      } catch {
        setError(true);
        try {
          accept(await api<Snapshot>(`/api/games/${gameId}`));
        } catch {
          /* Retry keeps the accepted board. */
        }
      } finally {
        lock.current = false;
        setPending(false);
      }
    },
    [gameId, accept],
  );
  useEffect(() => {
    if (
      !game ||
      game.result ||
      !connected ||
      game.pauseStarted !== null ||
      game.fen.split(' ')[1] === game.colour
    ) {
      return;
    }
    let cancelled = false;
    let computer: import('./engine').Computer | undefined;
    setEngineError(false);
    void import('./engine')
      .then(async ({ Computer }) => {
        if (cancelled) {
          return;
        }
        computer = new Computer();
        const move = await computer.move(game.fen, game.difficulty);
        if (!cancelled) {
          await send({
            type: 'move',
            from: move.slice(0, 2),
            to: move.slice(2, 4),
            ...(move[4] ? { promotion: move[4] } : {}),
            revision: game.revision,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEngineError(true);
        }
      });
    return () => {
      cancelled = true;
      computer?.dispose();
    };
  }, [game?.id, game?.revision, game?.pauseStarted, connected, engineRetry, send]);
  async function signIn(local: boolean, account: 'leo' | 'friend' = 'leo') {
    setPending(true);
    setError(false);
    try {
      if (local) {
        const { url } = await api<{ url: string }>('/api/dev/sign-in', {
          account,
          returnTo: playReturnPath(params.get('returnTo')),
        });
        location.assign(url);
      } else {
        await api('/api/auth/sign-in/magic-link', {
          adult,
          callbackURL: `${location.origin}${playReturnPath(params.get('returnTo'))}`,
          email,
        });
        setSent(true);
      }
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  async function start() {
    setPending(true);
    setError(false);
    try {
      const snapshot = await api<Snapshot>('/api/games', { colour, control, difficulty });
      accept(snapshot);
      setFlipped(snapshot.game.colour === 'b');
      setParams({ game: snapshot.game.id });
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  function navigateReplay(next: Replay | null) {
    setReplay(next);
    setSelected(null);
    setPromotion(null);
  }
  function playVariation(move: { from: Square; to: Square; promotion?: string }) {
    if (!game?.result) {
      return;
    }
    setReplay(replayMove(game, replay ?? savedReplay(game), move));
    setSelected(null);
    setPromotion(null);
  }
  function chooseSquare(square: Square) {
    if (!game) {
      return;
    }
    const exploring = Boolean(game.result);
    if (
      !exploring &&
      (replay !== null || !connected || pending || game.fen.split(' ')[1] !== game.colour)
    ) {
      return;
    }
    const chess = exploring
      ? replayPosition(game, replay ?? savedReplay(game))
      : new Chess(game.fen);
    const turn = exploring ? chess.turn() : game.colour;
    if (chess.get(square)?.color === turn) {
      setSelected(selected === square ? null : square);
      return;
    }
    if (!selected) {
      return;
    }
    const moves = chess
      .moves({ square: selected, verbose: true })
      .filter((move) => move.to === square);
    if (moves.length === 0) {
      setSelected(null);
      return;
    }
    if (moves.some((move) => move.promotion)) {
      setPromotion({ from: selected, to: square });
      return;
    }
    if (exploring) {
      playVariation({ from: selected, to: square });
    } else {
      void send({ type: 'move', from: selected, to: square, revision: game.revision });
    }
  }
  const boardChess = useMemo(() => (game ? chessFrom(game) : new Chess()), [game?.id, game?.moves]);
  const shown = useMemo(
    () => (game?.result && replay ? replayPosition(game, replay) : boardChess),
    [boardChess, Boolean(game?.result), replay],
  );
  const lastShown = useMemo(() => shown.history({ verbose: true }).at(-1), [shown]);
  const captured = useMemo(() => capturedPieces(shown), [shown]);
  const destinations = selected
    ? shown.moves({ square: selected, verbose: true }).map((move) => move.to)
    : [];
  const clocks = game ? remaining(game, now) : { b: 0, w: 0 };
  function clock(time: number) {
    return `${Math.floor(Math.ceil(time / 1000) / 60)}:${String(Math.ceil(time / 1000) % 60).padStart(2, '0')}`;
  }
  const topColour = flipped ? 'w' : 'b';
  const topIsYou = topColour === game?.colour;
  const boardProps = {
    appearance: appearanceState.appearance,
    copy: c,
    onSquare: chooseSquare,
    position: {
      destinations,
      fen: shown.fen(),
      flipped,
      lastMove: lastShown ? [lastShown.from, lastShown.to] : [],
      selected,
    },
  };
  const resultTitle = game?.result
    ? game.result.winner === null
      ? c.draw
      : game.result.winner === game.colour
        ? c.won
        : c.lost
    : '';
  const status = game?.result
    ? `${resultTitle} · ${c[game.result.reason]}`
    : boardChess.turn() === game?.colour
      ? c.turn
      : c.thinking;
  const pause =
    game?.pauseStarted !== null && game?.pauseStarted !== undefined
      ? Math.max(0, Math.ceil((60_000 - game.pauseUsed - (now - game.pauseStarted)) / 1000))
      : 0;
  function download() {
    if (!game) {
      return;
    }
    const chess = chessFrom(game);
    const result = game.result
      ? game.result.winner === 'w'
        ? '1-0'
        : game.result.winner === 'b'
          ? '0-1'
          : '1/2-1/2'
      : '*';
    chess.header(
      'Event',
      'Ludus casual computer game',
      'White',
      game.colour === 'w' ? (identity?.user?.name ?? 'Player') : coachIdentity.name,
      'Black',
      game.colour === 'b' ? (identity?.user?.name ?? 'Player') : coachIdentity.name,
      'Result',
      result,
    );
    const url = URL.createObjectURL(new Blob([chess.pgn()], { type: 'application/x-chess-pgn' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ludus-${game.id}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div
      className={`site-shell game-shell play-page ${identity?.user && gameId ? 'match-shell' : ''}`}
    >
      <a className="skip-link" href="#main">
        {c.play}
      </a>
      <Header compact={Boolean(identity?.user && gameId)} />
      <main id="main" className="game-main">
        {error && (
          <div role="alert" className="game-notice mb-5">
            {c.error}{' '}
            <Button
              onClick={() => {
                location.reload();
              }}
            >
              {c.retry}
            </Button>
          </div>
        )}
        {identity ? (
          identity.user ? (
            profileLoaded && !profile ? (
              <section className="setup-card">
                <Link
                  className="game-primary"
                  to={`/account?returnTo=${encodeURIComponent(playReturnPath(params.get('returnTo')))}`}
                >
                  {
                    {
                      'en-GB': 'Complete your profile to play',
                      'es-ES': 'Completa tu perfil para jugar',
                      'fr-FR': 'Complétez votre profil pour jouer',
                    }[isLanguage(i18n.language) ? i18n.language : 'en-GB']
                  }
                </Link>
              </section>
            ) : gameId ? (
              !game ? (
                <p>{c.loading}</p>
              ) : (
                <div className="match-layout">
                  <div className="match-heading">
                    <div>
                      <Link to="/play?tab=history" className="eyebrow text-muted">
                        ← {c.history}
                      </Link>
                      <h1 className="match-title font-display">{c.opponent}</h1>
                    </div>
                    <span className="match-badge">
                      <span aria-hidden="true">◷</span>
                      {game.control} · {c.levels[game.difficulty - 1]}
                    </span>
                  </div>
                  <div className="match-grid">
                    <section className="match-stage">
                      <div className="match-players">
                        <div className="player-bar">
                          <div>
                            <span className="player-avatar">L</span>
                            <span>
                              {topIsYou ? c.you : coachIdentity.name}
                              <small>{topIsYou ? identity.user.name : c.computer}</small>
                            </span>
                          </div>
                          <span
                            className={`clock ${boardChess.turn() === topColour && !game.result ? 'clock-active' : ''}`}
                          >
                            {clock(clocks[flipped ? 'w' : 'b'])}
                          </span>
                        </div>
                        <div className="player-bar">
                          <div>
                            <span className="player-avatar player-avatar-you">
                              {topIsYou ? 'L' : identity.user.name[0]}
                            </span>
                            <span>
                              {topIsYou ? coachIdentity.name : c.you}
                              <small>{topIsYou ? c.computer : identity.user.name}</small>
                            </span>
                          </div>
                          <span
                            className={`clock ${boardChess.turn() === (flipped ? 'b' : 'w') && !game.result ? 'clock-active' : ''}`}
                          >
                            {clock(clocks[flipped ? 'b' : 'w'])}
                          </span>
                        </div>
                      </div>
                      <div className="board-frame">
                        {view === '3d' ? (
                          <GraphicsBoundary
                            key={resetKey}
                            fallback={
                              <div className="board-fallback">
                                <p role="status" className="p-3 text-sm">
                                  {c.unavailable3d}
                                </p>
                                <Board {...boardProps} />
                              </div>
                            }
                          >
                            <Suspense
                              fallback={
                                <div className="grid aspect-square place-items-center">
                                  {c.loading}
                                </div>
                              }
                            >
                              <Board3D
                                board={boardProps}
                                resetKey={resetKey}
                                looking={looking}
                                table={{
                                  captured,
                                  tableClock: {
                                    times: { w: clock(clocks.w), b: clock(clocks.b) },
                                    active: game.result || pause > 0 ? null : boardChess.turn(),
                                  },
                                }}
                              />
                            </Suspense>
                            {!looking && <Board {...boardProps} concealed />}
                          </GraphicsBoundary>
                        ) : (
                          <Board {...boardProps} />
                        )}
                      </div>
                      <div className="board-tools" role="group" aria-label={c.board}>
                        <Button
                          className="game-secondary"
                          onClick={() => {
                            const next = view === '3d' ? '2d' : '3d';
                            setView(next);
                            setLooking(false);
                            try {
                              localStorage.setItem('ludus-board', next);
                            } catch {
                              /* Preference is optional. */
                            }
                          }}
                        >
                          <ControlIcon name="board" />
                          {view === '3d' ? c.view2d : c.view3d}
                        </Button>
                        <Button
                          className="game-secondary"
                          onClick={() => {
                            setFlipped(!flipped);
                          }}
                        >
                          <ControlIcon name="flip" />
                          {c.flip}
                        </Button>
                        {view === '3d' && (
                          <>
                            <Button
                              className="game-secondary"
                              aria-pressed={looking}
                              onClick={() => {
                                setSelected(null);
                                setLooking(!looking);
                              }}
                            >
                              <ControlIcon name="look" />
                              {looking ? c.returnToBoard : c.lookAround}
                            </Button>
                            <Button
                              className="game-secondary"
                              onClick={() => {
                                setResetKey(resetKey + 1);
                              }}
                            >
                              <ControlIcon name="reset" />
                              {c.reset}
                            </Button>
                          </>
                        )}
                      </div>
                    </section>
                    <aside className="match-sidebar">
                      <p className="eyebrow mb-3 text-muted">{c.casual}</p>
                      <div role="status" className="match-status">
                        <h2 className="font-display text-3xl">{status}</h2>
                        {!game.result && boardChess.isCheck() && (
                          <p className="mt-2 text-sm">{c.check}</p>
                        )}
                      </div>
                      {!connected && !game.result && (
                        <p className="game-notice text-xs">{c.reconnecting}</p>
                      )}
                      {pause > 0 && !game.result && (
                        <p role="status" className="game-notice text-xs">
                          {c.paused} · {pause} {c.allowance}
                        </p>
                      )}
                      {engineError && (
                        <div role="alert" className="game-notice text-sm">
                          {c.engineError}
                          <Button
                            className="mt-3 block underline"
                            onClick={() => {
                              setEngineRetry(engineRetry + 1);
                            }}
                          >
                            {c.retry}
                          </Button>
                        </div>
                      )}
                      {!game.result &&
                        boardChess.turn() === game.colour &&
                        (boardChess.isThreefoldRepetition() || boardChess.isDrawByFiftyMoves()) && (
                          <Button
                            className="game-secondary"
                            disabled={pending || !connected}
                            onClick={() =>
                              void send({ type: 'claimDraw', revision: game.revision })
                            }
                          >
                            {c.claimDraw}
                          </Button>
                        )}
                      <section className="moves-panel" aria-label={c.moveList}>
                        <h3 className="eyebrow mb-4">{c.moveList}</h3>
                        {!game.moves.length ? (
                          <p className="text-sm text-muted">{c.noMoves}</p>
                        ) : (
                          <ol>
                            {Array.from({ length: Math.ceil(game.moves.length / 2) }, (_, i) => (
                              <li key={i} className="move-row">
                                <span>{i + 1}.</span>
                                {game.moves.slice(i * 2, i * 2 + 2).map((move, j) => (
                                  <Button
                                    key={j}
                                    disabled={!game.result}
                                    aria-pressed={
                                      replay?.branchAt === null && replay.ply === i * 2 + j + 1
                                    }
                                    onClick={() => {
                                      navigateReplay(savedReplay(game, i * 2 + j + 1));
                                    }}
                                    className="move-notation"
                                  >
                                    {move}
                                  </Button>
                                ))}
                              </li>
                            ))}
                          </ol>
                        )}
                      </section>
                      {game.result ? (
                        <div className="mt-5 grid gap-3">
                          <div className="replay-controls">
                            <Button
                              aria-label={c.beginning}
                              onClick={() => {
                                navigateReplay(
                                  replay ? { ...replay, ply: 0 } : savedReplay(game, 0),
                                );
                              }}
                            >
                              │‹
                            </Button>
                            <Button
                              aria-label={c.previous}
                              onClick={() => {
                                navigateReplay(stepReplay(replay ?? savedReplay(game), -1));
                              }}
                            >
                              ‹
                            </Button>
                            <Button
                              aria-label={c.next}
                              onClick={() => {
                                navigateReplay(stepReplay(replay ?? savedReplay(game), 1));
                              }}
                            >
                              ›
                            </Button>
                            <Button
                              aria-label={c.latest}
                              onClick={() => {
                                navigateReplay(null);
                              }}
                            >
                              ›│
                            </Button>
                          </div>
                          <p className="text-xs text-muted">{rc.hint}</p>
                          {replay?.branchAt !== null && replay?.branchAt !== undefined && (
                            <section aria-label={rc.variation}>
                              <p role="status" className="text-sm">
                                {rc.variation}:{' '}
                                {replay.moves.slice(replay.branchAt, replay.ply).join(' ')}
                              </p>
                              <Button
                                className="game-secondary mt-3"
                                onClick={() => {
                                  navigateReplay(savedReplay(game, replay.branchAt!));
                                }}
                              >
                                {rc.saved}
                              </Button>
                            </section>
                          )}
                          <Button className="game-secondary" onClick={download}>
                            {c.download}
                          </Button>
                          <Link className="game-secondary" to={`/coach/${game.id}`}>
                            {
                              {
                                'en-GB': 'Review with Lucía',
                                'es-ES': 'Analizar con Lucía',
                                'fr-FR': 'Analyser avec Lucía',
                              }[isLanguage(i18n.language) ? i18n.language : 'en-GB']
                            }
                          </Link>
                          <Link to="/play" className="game-primary text-center">
                            {c.newGame}
                          </Link>
                        </div>
                      ) : confirmResign ? (
                        <div className="mt-5">
                          <p className="mb-3 text-sm">{c.confirmResign}</p>
                          <div className="flex gap-3">
                            <Button
                              className="game-secondary"
                              onClick={() => {
                                setConfirmResign(false);
                              }}
                            >
                              {c.cancel}
                            </Button>
                            <Button
                              className="game-primary"
                              disabled={pending || !connected}
                              onClick={() => {
                                setConfirmResign(false);
                                void send({ type: 'resign', revision: game.revision });
                              }}
                            >
                              {c.resign}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          className="game-secondary mt-5"
                          disabled={!connected || pending}
                          onClick={() => {
                            setConfirmResign(true);
                          }}
                        >
                          {c.resign}
                        </Button>
                      )}
                    </aside>
                  </div>
                  {promotion && (
                    <Dialog.Root
                      open
                      onOpenChange={(open) => {
                        if (!open) {
                          setPromotion(null);
                        }
                      }}
                    >
                      <Dialog.Portal>
                        <Dialog.Backdrop className="fixed inset-0 z-50 bg-ink/50" />
                        <Dialog.Popup className="promotion-panel fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2">
                          <Dialog.Title className="mb-5 font-display text-3xl">
                            {c.promotion}
                          </Dialog.Title>
                          <div className="grid grid-cols-2 gap-3">
                            {(['q', 'r', 'b', 'n'] as const).map((piece, i) => (
                              <Button
                                autoFocus={i === 0}
                                key={piece}
                                className="game-secondary"
                                onClick={() => {
                                  game.result
                                    ? playVariation({ ...promotion, promotion: piece })
                                    : void send({
                                        type: 'move',
                                        ...promotion,
                                        promotion: piece,
                                        revision: game.revision,
                                      });
                                }}
                              >
                                {{ q: c.queen, r: c.rook, b: c.bishop, n: c.knight }[piece]}
                              </Button>
                            ))}
                          </div>
                          <Button
                            className="mt-4 text-sm underline"
                            onClick={() => {
                              setPromotion(null);
                            }}
                          >
                            {rc.cancelPromotion}
                          </Button>
                        </Dialog.Popup>
                      </Dialog.Portal>
                    </Dialog.Root>
                  )}
                </div>
              )
            ) : (
              <>
                <div className="lobby-heading">
                  <div>
                    <p className="eyebrow mb-3">{identity.user.name} · Ludus</p>
                    <h1 className="lobby-title">{c.setup}.</h1>
                  </div>
                  <Button
                    className="py-3 text-xs underline"
                    onClick={() =>
                      void api('/api/auth/sign-out', {}).then(() => {
                        location.assign('/play');
                      })
                    }
                  >
                    {c.signOut}
                  </Button>
                </div>
                <nav className="lobby-navigation" aria-label="Ludus">
                  <Link to="/online">
                    {
                      {
                        'en-GB': 'Play online',
                        'es-ES': 'Jugar en línea',
                        'fr-FR': 'Jouer en ligne',
                      }[isLanguage(i18n.language) ? i18n.language : 'en-GB']
                    }
                  </Link>
                  <Link to="/account">
                    {
                      { 'en-GB': 'Your profile', 'es-ES': 'Tu perfil', 'fr-FR': 'Votre profil' }[
                        isLanguage(i18n.language) ? i18n.language : 'en-GB'
                      ]
                    }
                  </Link>
                </nav>
                <div className="lobby-grid">
                  <div className="lobby-controls">
                    <AppleMailTabs
                      value={lobbyTab}
                      onValueChange={setLobbyTab}
                      menu={{
                        minimal: true,
                        label: c.play,
                        tabs: [
                          { value: 'play', label: c.newGame, icon: '♞' },
                          { value: 'history', label: c.history, icon: '↺' },
                        ],
                      }}
                    >
                      <SlidingPanel activeKey={lobbyTab} direction={lobbyTab === 'play' ? -1 : 1}>
                        <Tabs.Panel value={lobbyTab} className="lobby-tab-panel">
                          {lobbyTab === 'play' ? (
                            <section className="setup-card">
                              <p className="eyebrow text-olive">{c.opponent}</p>
                              <h2>{c.play}</h2>
                              <div className="lobby-settings">
                                <label className="setup-label">
                                  {c.control}
                                  <select
                                    className="game-input"
                                    value={control}
                                    onChange={(e) => {
                                      setControl(e.target.value as Control);
                                    }}
                                  >
                                    <option>5+3</option>
                                    <option>10+5</option>
                                  </select>
                                </label>
                                <label className="setup-label">
                                  {c.difficulty}
                                  <select
                                    className="game-input"
                                    value={difficulty}
                                    onChange={(e) => {
                                      setDifficulty(Number(e.target.value) as Difficulty);
                                    }}
                                  >
                                    {c.levels.map((name, i) => (
                                      <option key={name} value={i + 1}>
                                        {name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="setup-label">
                                  {c.colour}
                                  <select
                                    className="game-input"
                                    value={colour}
                                    onChange={(e) => {
                                      setColour(e.target.value as 'w' | 'b');
                                    }}
                                  >
                                    <option value="w">{c.white}</option>
                                    <option value="b">{c.black}</option>
                                  </select>
                                </label>
                              </div>
                              {suggestion && (
                                <Button
                                  className="game-secondary mb-3"
                                  onClick={() => {
                                    setDifficulty(suggestion.difficulty);
                                  }}
                                >
                                  {
                                    {
                                      'en-GB': 'Use suggested difficulty',
                                      'es-ES': 'Usar dificultad sugerida',
                                      'fr-FR': 'Utiliser la difficulté conseillée',
                                    }[isLanguage(i18n.language) ? i18n.language : 'en-GB']
                                  }
                                  : {c.levels[suggestion.difficulty - 1]}
                                </Button>
                              )}
                              <Button
                                className="game-primary"
                                disabled={pending}
                                onClick={() => void start()}
                              >
                                {history.some((g) => !g.result) ? c.resume : c.start} ↗
                              </Button>
                              <p className="mt-4 text-xs leading-6 text-muted">{c.provisional}</p>
                              <details className="lobby-materials">
                                <summary>
                                  {
                                    {
                                      'en-GB': 'Board materials',
                                      'es-ES': 'Materiales del tablero',
                                      'fr-FR': 'Matériaux de l’échiquier',
                                    }[isLanguage(i18n.language) ? i18n.language : 'en-GB']
                                  }
                                </summary>
                                <AppearanceControls state={appearanceState} />
                              </details>
                            </section>
                          ) : (
                            <section className="history-panel">
                              <h2 className="mb-6 font-display text-3xl">{c.history}</h2>
                              {history.length ? (
                                <ul>
                                  {history.map((entry) => (
                                    <li key={entry.id}>
                                      <Link className="history-row" to={`/play?game=${entry.id}`}>
                                        <span>
                                          <span className="block text-sm">{c.opponent}</span>
                                          <span className="text-xs text-muted">
                                            {new Intl.DateTimeFormat(i18n.language, {
                                              dateStyle: 'medium',
                                              timeStyle: 'short',
                                            }).format(entry.createdAt)}
                                          </span>
                                        </span>
                                        <span className="text-xs">
                                          {entry.result ? c.replay : c.resume} →
                                        </span>
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-sm text-muted">{c.noHistory}</p>
                              )}
                            </section>
                          )}
                        </Tabs.Panel>
                      </SlidingPanel>
                    </AppleMailTabs>
                  </div>
                </div>
              </>
            )
          ) : (
            <div className="entry-layout">
              <section className="entry-panel">
                <p className="eyebrow">Ludus · Madrid</p>
                <h1 className="font-display text-6xl sm:text-7xl">{c.title}</h1>
                <p className="text-muted">{c.subtitle}</p>
                <form
                  className="mt-8 grid gap-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (adult) {
                      void signIn(false);
                    }
                  }}
                >
                  <label className="grid gap-2 text-sm">
                    {c.email}
                    <Input
                      type="email"
                      required
                      maxLength={254}
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                      }}
                      className="game-input"
                    />
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={adult}
                      onChange={(e) => {
                        setAdult(e.target.checked);
                      }}
                      required
                    />
                    {c.adult}
                  </label>
                  <Button className="game-primary" type="submit" disabled={pending || !adult}>
                    {c.sendLink}
                  </Button>
                </form>
                {sent && (
                  <p role="status" className="mt-4 text-sm">
                    {c.sent}
                  </p>
                )}
                <p className="mt-4 text-xs leading-6 text-muted">
                  {c.invitation}{' '}
                  <Link className="underline" to="/">
                    {c.waitlist}
                  </Link>
                </p>
                {identity.local && (
                  <div className="mt-8 border-t border-ink/15 pt-5">
                    <p className="eyebrow mb-3">{c.localNote}</p>
                    <div className="grid gap-3">
                      <Button
                        disabled={pending}
                        className="game-secondary w-full"
                        onClick={() => void signIn(true)}
                      >
                        {c.local}
                      </Button>
                      <Button
                        disabled={pending}
                        className="game-secondary w-full"
                        onClick={() => void signIn(true, 'friend')}
                      >
                        {c.localFriend}
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )
        ) : (
          <p>{c.loading}</p>
        )}
      </main>
    </div>
  );
}
