import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@base-ui/react/button';
import { Header } from './App';
import { Board } from './Board';
import { gameCopy } from './game-copy';
import { coachCopy } from './coach-copy';
import { analyseMatch } from './analysis';
import { isLanguage, type Language } from '../shared/waitlist';
import { positionAt, teachingProfiles, type AnalysisLine, type MistakeTag, type CoachDocument, type SavedCoachMatch, type SavedReply, type SavedReview, type TeachingProfile } from '../shared/coaching';

type Status = { available: boolean; plus: boolean; limit: number; usage: { reviews: number; replies: number }; profile: TeachingProfile; suggestedProfile: TeachingProfile | null; recurring: { tag: MistakeTag; matches: number }[]; reviews: SavedReview[] };
class CoachError extends Error { constructor(public code: string) { super(code); } }
async function api<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const payload = method === 'DELETE' && body === undefined ? {} : body;
  const response = await fetch(path, { method, headers: payload === undefined ? {} : { 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(60_000) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new CoachError(result.error ?? 'unavailable');
  return result;
}
function languageName(language: Language, ui: Language) { return new Intl.DisplayNames([ui], { type: 'language' }).of(language) ?? language; }
function ReviewText({ document, onVariation }: { document: CoachDocument; onVariation: (ply: number, moves: string[]) => void }) {
  return <><p className="whitespace-pre-wrap">{document.summary}</p>
    {document.variations.map((line, i) => <div key={i} className="mt-4"><Button className="underline" onClick={() => onVariation(line.ply, line.moves)}>{line.ply + 1}. {line.moves.join(' ')}</Button><p>{line.explanation}</p></div>)}
    {document.mistakes.map((mistake, i) => <p key={i} className="mt-3">{mistake.ply}. {mistake.explanation}</p>)}
  </>;
}
export function Coach() {
  const { matchId = '' } = useParams();
  const { i18n } = useTranslation();
  const language: Language = isLanguage(i18n.language) ? i18n.language : 'en-GB';
  const c = coachCopy[language];
  const [status, setStatus] = useState<Status | null>(null);
  const [match, setMatch] = useState<SavedCoachMatch | null>(null);
  const [review, setReview] = useState<SavedReview | null>(null);
  const [replies, setReplies] = useState<SavedReply[]>([]);
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState<'analysis' | 'generation' | 'reply' | null>(null);
  const [localLines, setLocalLines] = useState<AnalysisLine[]>([]);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ ply: number; moves: string[]; step: number } | null>(null);
  const [ply, setPly] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const reviewRequest = useRef<{ key: string; analysis: AnalysisLine[]; language: Language; profile: TeachingProfile } | null>(null);
  const replyRequest = useRef<{ key: string; language: Language; question: string; reviewId: string; profile: TeachingProfile } | null>(null);
  const loadVersion = useRef(0);
  const load = async () => {
    const version = ++loadVersion.current;
    setError('');
    try {
      const [nextStatus, nextMatch] = await Promise.all([api<Status>('/api/coach/status'), api<{ match: SavedCoachMatch }>(`/api/coach/matches/${encodeURIComponent(matchId)}`)]);
      if (version !== loadVersion.current) return;
      setStatus(nextStatus); setMatch(nextMatch.match);
      const saved = nextStatus.reviews.find((item) => item.matchId === matchId);
      if (saved) { const full = await api<{ review: SavedReview; replies: SavedReply[] }>(`/api/coach/reviews/${saved.id}`); if (version !== loadVersion.current) return; setReview(full.review); setReplies(full.replies); }
    } catch { if (version === loadVersion.current) setError('load'); }
  };
  useEffect(() => {
    setStatus(null); setMatch(null); setReview(null); setReplies([]); setLocalLines([]); setPly(0); setPreview(null); reviewRequest.current = null; replyRequest.current = null;
    void load(); return () => { loadVersion.current++; abort.current?.abort(); };
  }, [matchId]);
  async function analyseLocally() {
    if (!match || pending) return;
    const controller = new AbortController(); abort.current = controller;
    setPending('analysis'); setError('');
    try { setLocalLines(await analyseMatch(match, controller.signal, (done, total) => setProgress(`${done}/${total}`))); }
    catch { if (!controller.signal.aborted) setError('engine_unavailable'); }
    finally { setPending(null); }
  }
  async function generate() {
    if (!match || !status || pending) return;
    setError(''); abort.current = new AbortController();
    try {
      if (!reviewRequest.current || reviewRequest.current.language !== language || reviewRequest.current.profile !== status.profile) {
        setPending('analysis');
        const analysis = localLines.length ? localLines : await analyseMatch(match, abort.current.signal, (done, total) => setProgress(`${done}/${total}`));
        setLocalLines(analysis);
        reviewRequest.current = { key: crypto.randomUUID(), analysis, language, profile: status.profile };
      }
      setPending('generation');
      const result = await api<{ review: SavedReview }>('/api/coach/reviews', { ...reviewRequest.current, matchId });
      setReview(result.review); setReplies([]); reviewRequest.current = null;
      setStatus(await api<Status>('/api/coach/status'));
    } catch (failure) { if (!abort.current.signal.aborted) setError(failure instanceof CoachError ? failure.code : 'coach_unavailable'); }
    finally { setPending(null); }
  }
  async function send() {
    if (!review || !question.trim() || pending) return;
    setPending('reply'); setError('');
    const text = question.trim();
    if (!replyRequest.current || replyRequest.current.question !== text || replyRequest.current.language !== language || replyRequest.current.reviewId !== review.id || replyRequest.current.profile !== status?.profile) replyRequest.current = { key: crypto.randomUUID(), language, question: text, reviewId: review.id, profile: status?.profile ?? 'beginner' };
    try {
      const result = await api<{ reply: SavedReply }>(`/api/coach/reviews/${review.id}/replies`, replyRequest.current);
      setReplies((current) => current.some((item) => item.id === result.reply.id) ? current : [...current, result.reply]); setQuestion(''); replyRequest.current = null;
      setStatus(await api<Status>('/api/coach/status'));
    } catch (failure) { setError(failure instanceof CoachError ? failure.code : 'coach_unavailable'); }
    finally { setPending(null); }
  }
  async function acceptProfile() {
    if (!status?.suggestedProfile) return;
    try { const { profile } = await api<{ profile: object }>('/api/account'); await api('/api/account', { ...profile, teachingProfile: status.suggestedProfile, adult: true }); setStatus(await api<Status>('/api/coach/status')); } catch { setError('load'); }
  }
  async function removeReview() {
    if (!review || !confirm(c.confirmDelete)) return;
    try { await api(`/api/coach/reviews/${review.id}`, undefined, 'DELETE'); setReview(null); setReplies([]); setStatus(await api<Status>('/api/coach/status')); } catch { setError('load'); }
  }
  function variation(start: number, moves: string[]) { setPreview({ ply: start, moves, step: 0 }); }
  const board = match ? positionAt(match.moves, preview?.ply ?? ply) : null;
  if (board && preview) for (const move of preview.moves.slice(0, preview.step)) board.move(move);
  const notice = (savedLanguage: Language) => savedLanguage !== language ? <p role="note" className="game-notice my-3">{c.language} {languageName(savedLanguage, language)}. {c.preserved}</p> : null;
  const errorText = error === 'load' ? c.error : error === 'quota_budget_or_pending' ? c.quota : ['idempotency_conflict', 'profile_changed'].includes(error) ? c.mismatch : c.unavailable;
  return <><Header /><main className="mx-auto max-w-6xl px-5 py-10">
    <Link className="underline" to={`${match?.kind === 'human' ? '/online' : '/play'}?game=${encodeURIComponent(matchId)}`}>{c.back}</Link>
    <h1 className="font-display text-4xl my-6">{c.title}</h1>
    {error && <div role="alert" className="game-notice">{errorText} <Button className="underline" onClick={() => void load()}>{c.retry}</Button></div>}
    {!status && !error && <p role="status">{gameCopy[language].loading}</p>}
    {status && <>
      <p>{status.plus ? c.plus : c.free} · {status.usage.reviews}/{status.limit} {c.usage}</p>
      <p className="mt-3"><Link className="underline" to="/account">{c.settings}</Link> · {c.profiles[teachingProfiles.indexOf(status.profile)]}</p>
      {status.suggestedProfile && <p className="game-notice mt-3">{c.suggestion} <Button className="underline" onClick={() => void acceptProfile()}>{c.accept} · {c.profiles[teachingProfiles.indexOf(status.suggestedProfile)]}</Button></p>}
      {!status.available && <p role="status" className="game-notice mt-5">{c.unavailable} <Button className="underline" onClick={() => void load()}>{c.retry}</Button></p>}
      <p className="text-sm my-5">{c.analysisNote}</p>
      {match?.moves.length === 0 && <p>{c.noMoves}</p>}
      <Button className="game-secondary mr-3" disabled={Boolean(pending) || !match?.moves.length} onClick={() => void analyseLocally()}>{pending === 'analysis' ? `${c.analysing} ${progress}` : ({ 'en-GB': 'Analyse locally', 'es-ES': 'Analizar en este dispositivo', 'fr-FR': 'Analyser sur cet appareil' })[language]}</Button>
      <Button className="game-primary" disabled={!status.available || Boolean(pending) || !match?.moves.length} onClick={() => void generate()}>{pending === 'analysis' ? `${c.analysing} ${progress}` : pending === 'generation' ? c.generating : c.generate}</Button>
      {pending === 'analysis' && <Button className="underline ml-4" onClick={() => abort.current?.abort()}>{c.cancel}</Button>}
      {localLines.length > 0 && <section aria-label={c.analysisNote} className="grid gap-2 mt-5"><p className="text-sm">{c.untrusted}</p>{localLines.map((line) => <Button key={line.ply} className="text-left underline text-sm" onClick={() => variation(line.ply, line.moves)}>{line.ply + 1}. {positionAt(match!.moves, line.ply).turn() === 'w' ? gameCopy[language].white : gameCopy[language].black}: {line.mate !== null ? `#${line.mate}` : ((line.cp ?? 0) / 100).toFixed(2)} · {line.moves.join(' ')}</Button>)}</section>}
      <div className="grid gap-8 lg:grid-cols-2 mt-8">
        {board && <section aria-label={c.position}><Board fen={board.fen()} flipped={match?.colour === 'b'} selected={null} destinations={[]} lastMove={[]} onSquare={() => {}} copy={gameCopy[language]} />
          <div className="flex gap-4 my-4"><Button className="underline" disabled={(preview?.step ?? ply) === 0} onClick={() => preview ? setPreview({ ...preview, step: preview.step - 1 }) : setPly(ply - 1)}>{c.previous}</Button>
            <Button className="underline" disabled={preview ? preview.step === preview.moves.length : ply === match!.moves.length} onClick={() => preview ? setPreview({ ...preview, step: preview.step + 1 }) : setPly(ply + 1)}>{c.next}</Button>
            {preview && <Button className="underline" onClick={() => { setPly(preview.ply); setPreview(null); }}>{c.before}</Button>}</div>
          <p>{c.position} {preview ? `${preview.ply} + ${preview.step}` : ply}</p></section>}
        <section aria-label={c.saved}>
          <h2 className="font-display text-2xl mb-4">{c.saved}</h2>
          {status.reviews.filter((item) => item.matchId === matchId).map((item) => <Button key={item.id} className="underline block mb-3" onClick={() => { void api<{ review: SavedReview; replies: SavedReply[] }>(`/api/coach/reviews/${item.id}`).then((result) => { setReview(result.review); setReplies(result.replies); }).catch(() => setError('load')); }}>{new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(item.createdAt)} · {languageName(item.language, language)}</Button>)}
          {!review && <p>{c.empty}</p>}
          {review && <article>{notice(review.language)}<ReviewText document={review.document} onVariation={variation} /><p className="text-sm mt-4">{c.untrusted}</p>
            <Button className="underline text-sm mt-4" onClick={() => void removeReview()}>{c.delete}</Button>
            <h3 className="font-display text-xl mt-8">{c.conversation}</h3>
            {replies.map((reply) => <div key={reply.id} className="my-5 border-t pt-4"><p className="font-medium">{reply.question}</p>{notice(reply.language)}<ReviewText document={reply.document} onVariation={variation} /></div>)}
            <p className="text-sm my-3">{status.plus ? c.replyLimit : c.plusNote}</p>
            {status.plus && <form onSubmit={(event) => { event.preventDefault(); void send(); }}><label className="block" htmlFor="coach-question">{c.ask}</label><textarea id="coach-question" className="game-input w-full my-3" maxLength={2000} value={question} onChange={(event) => setQuestion(event.target.value)} disabled={Boolean(pending)} /><Button className="game-primary" type="submit" disabled={Boolean(pending) || !status.available || !question.trim()}>{c.send}</Button></form>}
          </article>}
        </section>
      </div>
      {status.plus && status.recurring.length > 0 && <section className="mt-8"><h2 className="font-display text-2xl">{c.recurring}</h2>{status.recurring.map((item) => <p key={item.tag}>{c.tags[item.tag]} · {item.matches} {c.matches}</p>)}</section>}
    </>}
  </main></>;
}
