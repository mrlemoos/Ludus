import { positionAt, teachingProfiles } from '../shared/coaching';
import type {
  AnalysisLine,
  CoachDocument,
  MistakeTag,
  SavedCoachHistory,
  SavedCoachMatch,
  SavedReply,
  SavedReview,
  SavedReviewWithAnalysis,
  TeachingProfile,
} from '../shared/coaching';
import type { ReviewCreditStatus } from '../shared/review-credits';
import { isLanguage } from '../shared/waitlist';
import type { Language } from '../shared/waitlist';
import { analyseMatch } from './analysis';
import { Header } from './app';
import { Board } from './board';
import { coachCopy } from './coach-copy';
import { Button } from './components/button';
import { gameCopy } from './game-copy';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

interface Status {
  available: boolean;
  reviewCredits: ReviewCreditStatus;
  replyLimit: number;
  profile: TeachingProfile;
  suggestedProfile: TeachingProfile | null;
  recurring: { tag: MistakeTag; matches: number }[];
  reviews: SavedReview[];
}
class CoachError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  const payload = method === 'DELETE' && body === undefined ? {} : body;
  const response = await fetch(path, {
    body: payload === undefined ? undefined : JSON.stringify(payload),
    headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
    method,
    signal: AbortSignal.timeout(60_000),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new CoachError(result.error ?? 'unavailable');
  }
  return result;
}
function languageName(language: Language, ui: Language) {
  return new Intl.DisplayNames([ui], { type: 'language' }).of(language) ?? language;
}
interface NoticeProps {
  savedLanguage: Language;
}

interface ReviewTextProps {
  document: CoachDocument;
  onVariation: (ply: number, moves: string[]) => void;
}

function ReviewText({ document, onVariation }: ReviewTextProps) {
  return (
    <>
      <p className="whitespace-pre-wrap">{document.summary}</p>
      {document.variations.map((line, i) => (
        <div key={i} className="mt-4">
          <Button
            className="underline"
            onClick={() => {
              onVariation(line.ply, line.moves);
            }}
          >
            {line.ply + 1}. {line.moves.join(' ')}
          </Button>
          <p>{line.explanation}</p>
        </div>
      ))}
      {document.mistakes.map((mistake, i) => (
        <p key={i} className="mt-3">
          {mistake.ply}. {mistake.explanation}
        </p>
      ))}
    </>
  );
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
  const [historyGaps, setHistoryGaps] = useState(0);
  const [historyMatches, setHistoryMatches] = useState<SavedCoachHistory[]>([]);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ ply: number; moves: string[]; step: number } | null>(
    null,
  );
  const [ply, setPly] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const reviewRequest = useRef<{
    key: string;
    analysis: AnalysisLine[];
    history: { matchId: string; analysis: AnalysisLine[] | null }[];
    language: Language;
    profile: TeachingProfile;
  } | null>(null);
  const replyRequest = useRef<{
    key: string;
    language: Language;
    question: string;
    reviewId: string;
    profile: TeachingProfile;
  } | null>(null);
  const loadVersion = useRef(0);
  async function load() {
    const version = ++loadVersion.current;
    setError('');
    try {
      const [nextStatus, nextMatch] = await Promise.all([
        api<Status>('/api/coach/status'),
        api<{ match: SavedCoachMatch }>(`/api/coach/matches/${encodeURIComponent(matchId)}`),
      ]);
      if (version !== loadVersion.current) {
        return;
      }
      setStatus(nextStatus);
      setMatch(nextMatch.match);
      const saved = await api<{ review: SavedReviewWithAnalysis | null; replies: SavedReply[] }>(
        `/api/coach/matches/${encodeURIComponent(matchId)}/review`,
      );
      if (version !== loadVersion.current) {
        return;
      }
      setReview(saved.review);
      setReplies(saved.replies);
      setHistoryGaps(saved.review?.historyGaps ?? 0);
      setHistoryMatches(saved.review?.history ?? []);
    } catch {
      if (version === loadVersion.current) {
        setError('load');
      }
    }
  }
  useEffect(() => {
    setStatus(null);
    setMatch(null);
    setReview(null);
    setReplies([]);
    setLocalLines([]);
    setHistoryGaps(0);
    setHistoryMatches([]);
    setPly(0);
    setPreview(null);
    reviewRequest.current = null;
    replyRequest.current = null;
    void load();
    return () => {
      loadVersion.current++;
      abort.current?.abort();
    };
  }, [matchId]);
  async function analyseLocally() {
    if (!match || pending) {
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setPending('analysis');
    setError('');
    try {
      setLocalLines(
        await analyseMatch(match, controller.signal, (done, total) => {
          setProgress(`${done}/${total}`);
        }),
      );
    } catch {
      if (!controller.signal.aborted) {
        setError('engine_unavailable');
      }
    } finally {
      setPending(null);
    }
  }
  async function generate() {
    if (!match || !status || pending || review || status.reviewCredits.available < 1) {
      return;
    }
    setError('');
    abort.current = new AbortController();
    try {
      if (
        !reviewRequest.current ||
        reviewRequest.current.language !== language ||
        reviewRequest.current.profile !== status.profile
      ) {
        setPending('analysis');
        const context = await api<{ matches: SavedCoachMatch[]; gaps: number }>(
          `/api/coach/matches/${encodeURIComponent(matchId)}/history`,
        );
        if (context.matches.length === 0 || context.matches[0].id !== match.id) {
          throw new CoachError('history_unavailable');
        }
        let missing = context.gaps;
        setHistoryMatches(
          context.matches.slice(1, 4).map((previous) => ({
            analysis: null,
            colour: previous.colour,
            completedAt: previous.completedAt ?? 0,
            kind: previous.kind ?? 'computer',
            matchId: previous.id,
            moves: previous.moves,
            result: previous.result,
          })),
        );
        const total = 1 + context.matches.length - 1 + context.gaps;
        const analysis =
          localLines.length > 0
            ? localLines
            : await analyseMatch(match, abort.current.signal, (done, positions) => {
                setProgress(`1/${total} · ${done}/${positions}`);
              });
        setLocalLines(analysis);
        const history: { matchId: string; analysis: AnalysisLine[] | null }[] = [];
        const earlierAnalyses: (AnalysisLine[] | null)[] = [];
        for (const [index, previous] of context.matches.slice(1, 4).entries()) {
          try {
            const earlier = await analyseMatch(
              previous,
              abort.current.signal,
              (done, positions) => {
                setProgress(`${index + 2}/${total} · ${done}/${positions}`);
              },
            );
            history.push({ analysis: earlier, matchId: previous.id });
            earlierAnalyses.push(earlier);
          } catch {
            if (abort.current.signal.aborted) {
              throw new CoachError('analysis_cancelled');
            }
            history.push({ analysis: null, matchId: previous.id });
            earlierAnalyses.push(null);
            missing++;
          }
        }
        setHistoryMatches(
          context.matches.slice(1, 4).map((previous, index) => ({
            analysis: earlierAnalyses[index],
            colour: previous.colour,
            completedAt: previous.completedAt ?? 0,
            kind: previous.kind ?? 'computer',
            matchId: previous.id,
            moves: previous.moves,
            result: previous.result,
          })),
        );
        setHistoryGaps(missing);
        reviewRequest.current = {
          analysis,
          history,
          key: crypto.randomUUID(),
          language,
          profile: status.profile,
        };
      }
      setPending('generation');
      const result = await api<{ review: SavedReviewWithAnalysis }>('/api/coach/reviews', {
        ...reviewRequest.current,
        matchId,
      });
      setReview(result.review);
      setReplies([]);
      setHistoryGaps(result.review.historyGaps ?? 0);
      setHistoryMatches(result.review.history ?? []);
      reviewRequest.current = null;
      setStatus(await api<Status>('/api/coach/status'));
    } catch (error_) {
      if (!abort.current.signal.aborted) {
        setError(error_ instanceof CoachError ? error_.code : 'coach_unavailable');
      }
    } finally {
      setPending(null);
    }
  }
  async function send() {
    if (!review || !question.trim() || pending) {
      return;
    }
    setPending('reply');
    setError('');
    const text = question.trim();
    if (
      !replyRequest.current ||
      replyRequest.current.question !== text ||
      replyRequest.current.language !== language ||
      replyRequest.current.reviewId !== review.id ||
      replyRequest.current.profile !== status?.profile
    ) {
      replyRequest.current = {
        key: crypto.randomUUID(),
        language,
        question: text,
        reviewId: review.id,
        profile: status?.profile ?? 'beginner',
      };
    }
    try {
      const result = await api<{ reply: SavedReply }>(
        `/api/coach/reviews/${review.id}/replies`,
        replyRequest.current,
      );
      setReplies((current) =>
        current.some((item) => item.id === result.reply.id) ? current : [...current, result.reply],
      );
      setQuestion('');
      replyRequest.current = null;
      setStatus(await api<Status>('/api/coach/status'));
    } catch (error_) {
      setError(error_ instanceof CoachError ? error_.code : 'coach_unavailable');
    } finally {
      setPending(null);
    }
  }
  async function acceptProfile() {
    if (!status?.suggestedProfile) {
      return;
    }
    try {
      const { profile } = await api<{ profile: object }>('/api/account');
      await api('/api/account', {
        ...profile,
        adult: true,
        teachingProfile: status.suggestedProfile,
      });
      setStatus(await api<Status>('/api/coach/status'));
    } catch {
      setError('load');
    }
  }
  async function removeReview() {
    if (!review || !confirm(c.confirmDelete)) {
      return;
    }
    try {
      await api(`/api/coach/reviews/${review.id}`, undefined, 'DELETE');
      setReview(null);
      setReplies([]);
      setHistoryGaps(0);
      setHistoryMatches([]);
      setStatus(await api<Status>('/api/coach/status'));
    } catch {
      setError('load');
    }
  }
  function variation(start: number, moves: string[]) {
    setPreview({ moves, ply: start, step: 0 });
  }
  const board = match ? positionAt(match.moves, preview?.ply ?? ply) : null;
  if (board && preview) {
    for (const move of preview.moves.slice(0, preview.step)) {
      board.move(move);
    }
  }
  function Notice({ savedLanguage }: NoticeProps) {
    if (savedLanguage === language) {
      return null;
    }
    return (
      <p role="note" className="game-notice my-3">
        {c.language} {languageName(savedLanguage, language)}. {c.preserved}
      </p>
    );
  }
  const errorText =
    error === 'load'
      ? c.error
      : error === 'quota_budget_or_pending'
        ? c.quota
        : error === 'review_credit_required'
          ? c.noCredits
          : error === 'review_pending' || error === 'generation_pending'
            ? c.pendingReview
            : error === 'history_mismatch' || error === 'invalid_history_analysis'
              ? c.historyChanged
              : error === 'reply_limit'
                ? c.replyLimitReached
                : ['idempotency_conflict', 'profile_changed'].includes(error)
                  ? c.mismatch
                  : c.unavailable;
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <Link
          className="underline"
          to={`${match?.kind === 'human' ? '/online' : '/play'}?game=${encodeURIComponent(matchId)}`}
        >
          {c.back}
        </Link>
        <h1 className="my-6 font-display text-4xl">{c.title}</h1>
        {error && (
          <div role="alert" className="game-notice">
            {errorText}{' '}
            {error === 'review_credit_required' && (
              <Link className="underline" to="/account">
                {c.buyCredits}
              </Link>
            )}{' '}
            <Button className="underline" onClick={() => void load()}>
              {c.retry}
            </Button>
          </div>
        )}
        {!status && !error && <p role="status">{gameCopy[language].loading}</p>}
        {status && (
          <>
            <p>
              {c.balance}: {status.reviewCredits.available} · {c.introCredit}:{' '}
              {status.reviewCredits.introAvailable ? 1 : 0} · {c.monthlyFree}:{' '}
              {status.reviewCredits.monthlyFreeRemaining} · {c.paidCredits}:{' '}
              {status.reviewCredits.paidRemaining}
            </p>
            <p className="mt-3">
              <Link className="underline" to="/account">
                {c.settings}
              </Link>{' '}
              · {c.profiles[teachingProfiles.indexOf(status.profile)]}
            </p>
            {status.suggestedProfile && (
              <p className="game-notice mt-3">
                {c.suggestion}{' '}
                <Button className="underline" onClick={() => void acceptProfile()}>
                  {c.accept} · {c.profiles[teachingProfiles.indexOf(status.suggestedProfile)]}
                </Button>
              </p>
            )}
            {!status.available && (
              <p role="status" className="game-notice mt-5">
                {c.unavailable}{' '}
                <Button className="underline" onClick={() => void load()}>
                  {c.retry}
                </Button>
              </p>
            )}
            <p className="my-5 text-sm">{c.analysisNote}</p>
            <p className="my-3 text-sm">
              {c.historyNote}{' '}
              {historyGaps > 0 ? ` ${c.historyGaps.replace('{count}', String(historyGaps))}` : ''}
            </p>
            {historyMatches.length > 0 && (
              <ul aria-label={c.earlierGames} className="grid gap-2 text-sm">
                {historyMatches.map((item, index) => (
                  <li key={item.matchId}>
                    <Link className="underline" to={`/coach/${encodeURIComponent(item.matchId)}`}>
                      {c.earlierGame.replace('{number}', String(index + 1))}
                    </Link>
                    {item.completedAt > 0
                      ? ` · ${new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(item.completedAt)}`
                      : ''}
                  </li>
                ))}
              </ul>
            )}
            {match?.moves.length === 0 && <p>{c.noMoves}</p>}
            <Button
              className="game-secondary mr-3"
              disabled={Boolean(pending) || !match?.moves.length}
              onClick={() => void analyseLocally()}
            >
              {pending === 'analysis'
                ? `${c.analysing} ${progress}`
                : {
                    'en-GB': 'Analyse locally',
                    'es-ES': 'Analizar en este dispositivo',
                    'fr-FR': 'Analyser sur cet appareil',
                  }[language]}
            </Button>
            {!review && (
              <Button
                className="game-primary"
                disabled={
                  !status.available ||
                  status.reviewCredits.available < 1 ||
                  Boolean(pending) ||
                  !match?.moves.length
                }
                onClick={() => void generate()}
              >
                {pending === 'analysis'
                  ? `${c.analysing} ${progress}`
                  : pending === 'generation'
                    ? c.generating
                    : c.generate}
              </Button>
            )}
            {!review && status.reviewCredits.available < 1 && (
              <p className="text-sm">
                <Link className="underline" to="/account">
                  {c.buyCredits}
                </Link>
              </p>
            )}
            {pending === 'analysis' && (
              <Button className="ml-4 underline" onClick={() => abort.current?.abort()}>
                {c.cancel}
              </Button>
            )}
            {localLines.length > 0 && (
              <section aria-label={c.analysisNote} className="mt-5 grid gap-2">
                <p className="text-sm">{c.untrusted}</p>
                {localLines.map((line) => (
                  <Button
                    key={line.ply}
                    className="text-left text-sm underline"
                    onClick={() => {
                      variation(line.ply, line.moves);
                    }}
                  >
                    {line.ply + 1}.{' '}
                    {positionAt(match!.moves, line.ply).turn() === 'w'
                      ? gameCopy[language].white
                      : gameCopy[language].black}
                    : {line.mate === null ? ((line.cp ?? 0) / 100).toFixed(2) : `#${line.mate}`} ·{' '}
                    {line.moves.join(' ')}
                  </Button>
                ))}
              </section>
            )}
            <div className="mt-8 grid gap-8 lg:grid-cols-2">
              {board && (
                <section aria-label={c.position}>
                  <Board
                    position={{
                      fen: board.fen(),
                      flipped: match?.colour === 'b',
                      selected: null,
                      destinations: [],
                      lastMove: [],
                    }}
                    onSquare={() => {}}
                    copy={gameCopy[language]}
                  />
                  <div className="my-4 flex gap-4">
                    <Button
                      className="underline"
                      disabled={(preview?.step ?? ply) === 0}
                      onClick={() => {
                        preview
                          ? setPreview({ ...preview, step: preview.step - 1 })
                          : setPly(ply - 1);
                      }}
                    >
                      {c.previous}
                    </Button>
                    <Button
                      className="underline"
                      disabled={
                        preview
                          ? preview.step === preview.moves.length
                          : ply === match!.moves.length
                      }
                      onClick={() => {
                        preview
                          ? setPreview({ ...preview, step: preview.step + 1 })
                          : setPly(ply + 1);
                      }}
                    >
                      {c.next}
                    </Button>
                    {preview && (
                      <Button
                        className="underline"
                        onClick={() => {
                          setPly(preview.ply);
                          setPreview(null);
                        }}
                      >
                        {c.before}
                      </Button>
                    )}
                  </div>
                  <p>
                    {c.position} {preview ? `${preview.ply} + ${preview.step}` : ply}
                  </p>
                </section>
              )}
              <section aria-label={c.saved}>
                <h2 className="mb-4 font-display text-2xl">{c.saved}</h2>
                {!review && <p>{c.empty}</p>}
                {review && (
                  <article>
                    <Notice savedLanguage={review.language} />
                    <ReviewText document={review.document} onVariation={variation} />
                    <p className="mt-4 text-sm">{c.untrusted}</p>
                    <Button className="mt-4 text-sm underline" onClick={() => void removeReview()}>
                      {c.delete}
                    </Button>
                    <h3 className="mt-8 font-display text-xl">{c.conversation}</h3>
                    {replies.map((reply) => (
                      <div key={reply.id} className="my-5 border-t pt-4">
                        <p className="font-medium">{reply.question}</p>
                        <Notice savedLanguage={reply.language} />
                        <ReviewText document={reply.document} onVariation={variation} />
                      </div>
                    ))}
                    <p className="my-3 text-sm">
                      {c.replyLimit
                        .replace('{used}', String(replies.length))
                        .replace('{limit}', String(status.replyLimit))}
                    </p>
                    {replies.length < status.replyLimit && (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void send();
                        }}
                      >
                        <label className="block" htmlFor="coach-question">
                          {c.ask}
                        </label>
                        <textarea
                          id="coach-question"
                          className="game-input my-3 w-full"
                          maxLength={2000}
                          value={question}
                          onChange={(event) => {
                            setQuestion(event.target.value);
                          }}
                          disabled={Boolean(pending)}
                        />
                        <Button
                          className="game-primary"
                          type="submit"
                          disabled={Boolean(pending) || !status.available || !question.trim()}
                        >
                          {c.send}
                        </Button>
                      </form>
                    )}
                  </article>
                )}
              </section>
            </div>
            {status.recurring.length > 0 && (
              <section className="mt-8">
                <h2 className="font-display text-2xl">{c.recurring}</h2>
                {status.recurring.map((item) => (
                  <p key={item.tag}>
                    {c.tags[item.tag]} · {item.matches} {c.matches}
                  </p>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
