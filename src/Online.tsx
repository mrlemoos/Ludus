import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@base-ui/react/button';
import { Dialog } from '@base-ui/react/dialog';
import { Chess, type Square } from 'chess.js';
import { Header } from './App';
import { Board } from './Board';
import { capturedPieces } from './captured-pieces';
import { gameCopy } from './game-copy';
import { onlineCopy } from './online-copy';
import { AppearanceControls, useAppearance } from './appearance';
import { isLanguage } from '../shared/waitlist';
import { humanTiming, phraseIds, reportCategories, type HumanAction, type HumanGame, type PhraseId } from '../shared/human-game';
import type { Control } from '../shared/game';
import type { QueueState } from '../shared/matchmaking';
const Board3D = lazy(() => import('./Board3D'));
class OnlineGraphics extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> { state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; } render() { return this.state.failed ? this.props.fallback : this.props.children; } }
async function api<T>(path: string, input?: unknown): Promise<T> { const response = await fetch(`/api/online/${path}`, { ...(input !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {}), signal: AbortSignal.timeout(15_000) }); if (!response.ok) throw new Error('request_failed'); return response.json(); }
export function Online() {
  const { i18n } = useTranslation(), language = isLanguage(i18n.language) ? i18n.language : 'en-GB', c = onlineCopy[language], boardCopy = gameCopy[language];
  const [params, setParams] = useSearchParams(), id = params.get('game'), inviteToken = params.get('invite');
  const [user, setUser] = useState<string | null | undefined>();
  const appearance = useAppearance(Boolean(user));
  const [queue, setQueue] = useState<QueueState>({ status: 'idle' });
  const [game, setGame] = useState<HumanGame | null>(null), [connected, setConnected] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState(false);
  const [control, setControl] = useState<Control>('5+3'), [colour, setColour] = useState<'w' | 'b' | 'random'>('random');
  const [selected, setSelected] = useState<Square | null>(null), [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [view, setView] = useState<'2d' | '3d'>(() => { try { return localStorage.getItem('ludus-board') === '2d' ? '2d' : '3d'; } catch { return '3d'; } });
  const [resetKey, setResetKey] = useState(0), [flipped, setFlipped] = useState(false), [now, setNow] = useState(Date.now());
  const [muted, setMuted] = useState(false), mutedRef = useRef(false), [received, setReceived] = useState<PhraseId | null>(null);
  const [category, setCategory] = useState<typeof reportCategories[number]>('assistance'), [reported, setReported] = useState(false);
  const [replay, setReplay] = useState<{ moves: string[]; ply: number; branch: number | null } | null>(null);
  const [history, setHistory] = useState<{ id: string; control: string; rated: boolean; result: string | null }[]>([]);
  const offset = useRef(0), latest = useRef<HumanGame | null>(null), lock = useRef(false);
  const accept = (snapshot: { game: HumanGame; serverNow: number }) => { if (latest.current?.id === snapshot.game.id && (latest.current.revision > snapshot.game.revision || (latest.current.revision === snapshot.game.revision && latest.current.updatedAt > snapshot.game.updatedAt))) return; latest.current = snapshot.game; offset.current = snapshot.serverNow - Date.now(); setGame(snapshot.game); setNow(snapshot.serverNow); };
  useEffect(() => { void fetch('/api/me').then((response) => response.json() as Promise<{ user: { id: string } | null }>).then((identity) => setUser(identity.user?.id ?? null)).catch(() => setError(true)); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now() + offset.current), 200); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!user || id) return;
    let cancelled = false;
    const poll = () => { void api<QueueState>('status').then((state) => { if (cancelled) return; setQueue(state); if (state.status === 'assigned') setParams({ game: state.match.id }); }).catch(() => { if (!cancelled) setError(true); }); };
    poll(); const timer = setInterval(poll, 2000); void api<typeof history>('history').then(setHistory).catch(() => setError(true)); return () => { cancelled = true; clearInterval(timer); };
  }, [user, id]);
  useEffect(() => {
    if (!user || !id) { setGame(null); latest.current = null; return; }
    let disposed = false, socket: WebSocket, timer: ReturnType<typeof setTimeout>;
    setReplay(null); setSelected(null); setPromotion(null); setReported(false); setReceived(null);
    void api<{ game: HumanGame; serverNow: number }>(`games/${id}`).then((snapshot) => { if (!disposed) { if (!latest.current || latest.current.id !== snapshot.game.id || latest.current.revision < snapshot.game.revision) accept(snapshot); setFlipped(snapshot.game.players.b === user); } }).catch(() => { if (!disposed) setError(true); });
    const connect = () => { socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/online/games/${id}/socket`); socket.onopen = () => { if (!disposed) setConnected(true); }; socket.onmessage = (event) => { if (disposed) return; try { const data = JSON.parse(event.data); if (data.game) accept(data); else if (phraseIds.includes(data.phrase) && !mutedRef.current) setReceived(data.phrase); } catch { setError(true); } }; socket.onclose = () => { if (!disposed) { setConnected(false); timer = setTimeout(connect, 1500); } }; socket.onerror = () => socket.close(); };
    connect(); return () => { disposed = true; clearTimeout(timer); socket?.close(); setConnected(false); };
  }, [user, id]);
  async function run(operation: () => Promise<void>) { if (lock.current) return; lock.current = true; setPending(true); setError(false); try { await operation(); } catch { setError(true); } finally { lock.current = false; setPending(false); } }
  const act = (action: Omit<HumanAction, 'revision'>) => run(async () => { if (!game) return; accept(await api(`games/${game.id}`, { ...action, revision: game.revision })); setSelected(null); setPromotion(null); });
  const navigate = (next: typeof replay) => { setReplay(next); setSelected(null); setPromotion(null); };
  const shown = new Chess(); if (game) for (const move of replay ? replay.moves.slice(0, replay.ply) : game.moves) shown.move(move);
  const playerColour = game?.players.w === user ? 'w' : 'b';
  function move(from: Square, to: Square, promoted?: string) {
    if (!game) return;
    if (game.result) { const chess = new Chess(shown.fen()); const played = chess.move({ from, to, promotion: promoted }); const cursor = replay?.ply ?? game.moves.length; setReplay({ moves: [...(replay?.moves ?? game.moves).slice(0, cursor), played.san], ply: cursor + 1, branch: Math.min(replay?.branch ?? cursor, cursor) }); setSelected(null); setPromotion(null); }
    else void run(async () => { accept(await api(`games/${game.id}`, { type: 'move', from, to, promotion: promoted, revision: game.revision })); setSelected(null); setPromotion(null); });
  }
  function square(square: Square) {
    if (!game || (!game.result && (!connected || pending || shown.turn() !== playerColour))) return;
    if (shown.get(square)?.color === shown.turn()) { setSelected(selected === square ? null : square); return; }
    if (!selected) return;
    const legal = shown.moves({ square: selected, verbose: true }).filter((candidate) => candidate.to === square);
    if (!legal.length) { setSelected(null); return; }
    if (legal.some((candidate) => candidate.promotion)) setPromotion({ from: selected, to: square }); else move(selected, square);
  }
  const timing = game ? humanTiming(game, now) : null, last = shown.history({ verbose: true }).at(-1);
  const props = { fen: shown.fen(), selected, destinations: selected ? shown.moves({ square: selected, verbose: true }).map((move) => move.to) : [], lastMove: last ? [last.from, last.to] : [], flipped, onSquare: square, copy: boardCopy, appearance: appearance.appearance };
  const clock = (time: number) => `${Math.floor(Math.ceil(time / 1000) / 60)}:${String(Math.ceil(time / 1000) % 60).padStart(2, '0')}`;
  return <div className="site-shell game-shell"><Header /><main id="main" className="game-main"><Link to="/play" className="underline text-sm">{c.back}</Link><h1 className="font-display text-5xl my-6">{c.title}</h1>
    {error && <p role="alert" className="game-notice">{c.error}</p>}
    {user === undefined ? <p>{boardCopy.loading}</p> : !user ? <Link to="/play" className="game-primary">{c.signIn}</Link> : !id ? <div className="grid gap-5 max-w-2xl">
      {inviteToken ? <Button className="game-primary" disabled={pending} onClick={() => void run(async () => { const state = await api<QueueState>('invitations/redeem', { token: inviteToken }); if (state.status === 'assigned') setParams({ game: state.match.id }); })}>{c.join}</Button> : <>
      <label className="setup-label">{c.control}<select className="game-input" value={control} onChange={(event) => setControl(event.target.value as Control)}><option>5+3</option><option>10+5</option></select></label>
      <label className="setup-label">{c.colour}<select className="game-input" value={colour} onChange={(event) => setColour(event.target.value as typeof colour)}><option value="random">{c.random}</option><option value="w">{boardCopy.white}</option><option value="b">{boardCopy.black}</option></select></label>
      <p className="text-sm">{c.ratedGate}</p>
      {queue.status === 'computer' && <Link className="game-primary" to={`/play?game=${queue.id}`}>{boardCopy.resume}</Link>}
      {queue.status === 'idle' && <div className="flex flex-wrap gap-3"><Button className="game-primary" disabled={pending} onClick={() => void run(async () => { const result = await api<{ token: string; expiresAt: number }>('invitations', { control, colour }); setQueue({ status: 'invited', ...result }); })}>{c.friend}</Button><Button className="game-secondary" disabled={pending} onClick={() => void run(async () => { setQueue(await api<QueueState>('queue', { control, rated: false })); })}>{c.find}</Button></div>}
      {queue.status === 'invited' && <><label className="setup-label">{c.invitation}<input className="game-input" readOnly value={`${location.origin}/online?invite=${queue.token}`} onFocus={(event) => event.target.select()} /></label><Button className="game-secondary" disabled={pending} onClick={() => void run(async () => setQueue(await api('invitations/cancel', { token: queue.token })))}>{c.cancelInvite}</Button></>}
      {queue.status === 'queued' && <><p role="status">{c.waiting}</p><Button className="game-secondary" disabled={pending} onClick={() => void run(async () => { setQueue(await api('queue/cancel', { token: queue.entry.token })); })}>{c.cancel}</Button>{now - queue.entry.joinedAt >= 30_000 && <><p>{c.aiHint}</p><Button className="game-primary" disabled={pending} onClick={() => void run(async () => { const state = await api<QueueState & { aiAccepted?: boolean }>('queue/ai', { token: queue.entry.token }); if (state.status === 'assigned') setParams({ game: state.match.id }); else if (state.aiAccepted) location.assign('/play'); })}>{c.ai}</Button></>}</>}
      <section><h2 className="font-display text-3xl">{c.history}</h2>{history.length ? <ul>{history.map((entry) => <li key={entry.id}><Link className="history-row" to={`/online?game=${entry.id}`}>{entry.control} · {entry.rated ? c.rated : c.casual} · {entry.result ? c.finished : boardCopy.resume}</Link></li>)}</ul> : <p>{c.noHistory}</p>}</section></>}
    </div> : !game ? <p>{boardCopy.loading}</p> : <div className="match-grid"><section>
      <div className="flex justify-between py-4" aria-label={c.control}><span>{boardCopy.white} {clock(timing!.clocks.w)}</span><span>{boardCopy.black} {clock(timing!.clocks.b)}</span></div>
      <div className="board-frame">{view === '3d' ? <OnlineGraphics fallback={<Board {...props} />}><Suspense fallback={<p>{boardCopy.loading}</p>}><Board3D {...props} resetKey={resetKey} looking={false} captured={capturedPieces(shown)} tableClock={{ times: { w: clock(timing!.clocks.w), b: clock(timing!.clocks.b) }, active: game.result || timing!.pauseRemaining > 0 ? null : shown.turn() }} /></Suspense><Board {...props} concealed /></OnlineGraphics> : <Board {...props} />}</div>
      <div className="board-tools"><Button className="game-secondary" onClick={() => setView(view === '3d' ? '2d' : '3d')}>{view === '3d' ? boardCopy.view2d : boardCopy.view3d}</Button><Button className="game-secondary" onClick={() => setFlipped(!flipped)}>{boardCopy.flip}</Button>{view === '3d' && <Button className="game-secondary" onClick={() => setResetKey(resetKey + 1)}>{boardCopy.reset}</Button>}</div>
    </section><aside className="match-sidebar"><p>{game.control} · {game.rated ? c.rated : c.casual}</p><h2 role="status" className="font-display text-3xl my-4">{game.result ? `${c.finished} · ${game.result.reason === 'agreement' ? c.agreement : game.result.reason === 'abort' ? c.abortReason : boardCopy[game.result.reason]}` : shown.turn() === playerColour ? c.turn : c.opponentTurn}</h2>
      {!game.result && (!connected ? <p>{c.reconnect}</p> : timing!.pauseRemaining > 0 && <p role="status">{c.disconnected} · {Math.ceil(timing!.pauseRemaining / 1000)} {c.seconds}</p>)}
      <section aria-label={boardCopy.moveList}><ol>{game.moves.map((move, ply) => <li key={ply}><Button disabled={!game.result} onClick={() => navigate({ moves: game.moves, ply: ply + 1, branch: null })}>{ply % 2 === 0 ? `${Math.floor(ply / 2) + 1}. ` : ''}{move}</Button></li>)}</ol></section>
      {game.result ? <section className="grid gap-3 mt-5" aria-label={c.replay}><div className="replay-controls"><Button aria-label={boardCopy.beginning} onClick={() => navigate({ moves: replay?.moves ?? game.moves, ply: 0, branch: replay?.branch ?? null })}>│‹</Button><Button aria-label={boardCopy.previous} onClick={() => navigate({ moves: replay?.moves ?? game.moves, ply: Math.max(0, (replay?.ply ?? game.moves.length) - 1), branch: replay?.branch ?? null })}>‹</Button><Button aria-label={boardCopy.next} onClick={() => navigate({ moves: replay?.moves ?? game.moves, ply: Math.min((replay?.moves ?? game.moves).length, (replay?.ply ?? game.moves.length) + 1), branch: replay?.branch ?? null })}>›</Button><Button aria-label={boardCopy.latest} onClick={() => navigate(null)}>›│</Button></div>{replay?.branch !== null && replay?.branch !== undefined && <><p>{c.variation}: {replay.moves.slice(replay.branch, replay.ply).join(' ')}</p><Button className="game-secondary" onClick={() => navigate({ moves: game.moves, ply: replay.branch!, branch: null })}>{c.saved}</Button></>}<Link className="game-secondary text-center" to={`/coach/${game.id}`}>{c.coach}</Link><Link className="game-primary text-center" to="/online">{boardCopy.newGame}</Link></section> : <div className="grid gap-3 my-5">{game.moves.length < 2 && <Button className="game-secondary" disabled={pending || !connected} onClick={() => void act({ type: 'abort' })}>{c.abort}</Button>}<Button className="game-secondary" disabled={pending || !connected} onClick={() => void act({ type: 'resign' })}>{c.resign}</Button>{game.drawOffer && game.drawOffer !== playerColour ? <><p>{c.drawPending}</p><Button className="game-primary" disabled={pending} onClick={() => void act({ type: 'acceptDraw' })}>{c.accept}</Button><Button className="game-secondary" disabled={pending} onClick={() => void act({ type: 'declineDraw' })}>{c.decline}</Button></> : <Button className="game-secondary" disabled={pending || game.moves.length < 2 || Boolean(game.drawOffer)} onClick={() => void act({ type: 'offerDraw' })}>{c.offer}</Button>}<Button className="game-secondary" disabled={pending || shown.turn() !== playerColour || (!shown.isThreefoldRepetition() && !shown.isDrawByFiftyMoves())} onClick={() => void act({ type: 'claimDraw' })}>{c.claim}</Button></div>}
      <AppearanceControls state={appearance} />
      <section aria-label={c.phrases} className="grid gap-2 my-5"><Button className="game-secondary" aria-pressed={muted} onClick={() => { mutedRef.current = !muted; setMuted(!muted); setReceived(null); }}>{muted ? c.unmute : c.mute}</Button>{!muted && <><p role="status">{received ? c.phrase[received] : ''}</p>{phraseIds.map((phrase) => <Button key={phrase} className="game-secondary" disabled={pending || !connected} onClick={() => void run(async () => { await api(`games/${id}/phrase`, { phrase }); })}>{c.phrase[phrase]}</Button>)}</>}</section>
      <label className="setup-label">{c.report}<select className="game-input" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>{reportCategories.map((category, index) => <option key={category} value={category}>{c.reports[index]}</option>)}</select></label><Button className="game-secondary" disabled={pending || reported} onClick={() => void run(async () => { await api(`games/${id}/report`, { category }); setReported(true); })}>{c.report}</Button>{reported && <p role="status">{c.reportSent}</p>}
    </aside>{promotion && <Dialog.Root open onOpenChange={(open) => { if (!open) setPromotion(null); }}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-50 bg-ink/50" /><Dialog.Popup className="promotion-panel fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2"><Dialog.Title>{boardCopy.promotion}</Dialog.Title>{(['q', 'r', 'b', 'n'] as const).map((piece) => <Button className="game-secondary" key={piece} onClick={() => move(promotion.from, promotion.to, piece)}>{({ q: boardCopy.queen, r: boardCopy.rook, b: boardCopy.bishop, n: boardCopy.knight })[piece]}</Button>)}</Dialog.Popup></Dialog.Portal></Dialog.Root>}</div>}
  </main></div>;
}
