import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { playReturnPath } from '../shared/navigation';
import type { PlayerProfile } from '../shared/profile';
import { teachingProfiles } from '../shared/profile';
import { languageNames } from './i18n';
import { isLanguage, type Language } from '../shared/waitlist';
import { Header } from './App';
import './profile.css';

const labels = {
  'en-GB': { privacy: 'Email, reviews and coach conversations stay private. You control whether activity is public.', streak: 'Daily streak', title: 'Your profile', username: 'Public username', timezone: 'Timezone', language: 'Language', level: 'Chess level', teaching: 'Teaching profile', activity: 'Show my activity publicly', adult: 'I am aged 18 or over', save: 'Save profile', saved: 'Profile saved.', error: 'Could not save. Check your details and try again.', signIn: 'Sign in to complete your profile.', deletion: 'Delete account', confirmation: 'Type DELETE to permanently delete your account', deleteNote: 'This revokes sessions, deletes private reviews and profile data, and anonymises retained matches. Abuse reports expire after 90 days; invitation delivery metadata after 30 days. Uninvited waitlist entries expire after 180 days.', pending: 'Timezone changes start at the next midnight in your current timezone.', plus: 'Beta Plus ends', days: 'Activity', hidden: 'Activity is private.', noProfile: 'Profile not found.', back: 'Play chess' },
  'es-ES': { privacy: 'El correo, los análisis y las conversaciones son privados. Tú decides si tu actividad es pública.', streak: 'Racha diaria', title: 'Tu perfil', username: 'Nombre público', timezone: 'Zona horaria', language: 'Idioma', level: 'Nivel de ajedrez', teaching: 'Perfil del entrenador', activity: 'Mostrar mi actividad públicamente', adult: 'Tengo 18 años o más', save: 'Guardar perfil', saved: 'Perfil guardado.', error: 'No se ha podido guardar. Revisa los datos e inténtalo de nuevo.', signIn: 'Inicia sesión para completar tu perfil.', deletion: 'Eliminar cuenta', confirmation: 'Escribe DELETE para eliminar tu cuenta definitivamente', deleteNote: 'Se revocan las sesiones, se eliminan los análisis privados y el perfil, y se anonimizan las partidas conservadas. Los informes se borran a los 90 días; los datos de envío, a los 30 días. La lista de espera sin invitación caduca a los 180 días.', pending: 'Los cambios de zona horaria se aplican a medianoche en tu zona actual.', plus: 'Plus de la beta termina', days: 'Actividad', hidden: 'La actividad es privada.', noProfile: 'Perfil no encontrado.', back: 'Jugar al ajedrez' },
  'fr-FR': { privacy: 'Votre e-mail, vos analyses et vos conversations restent privés. Vous choisissez de rendre votre activité publique.', streak: 'Série quotidienne', title: 'Votre profil', username: 'Pseudo public', timezone: 'Fuseau horaire', language: 'Langue', level: 'Niveau aux échecs', teaching: 'Profil du coach', activity: 'Afficher mon activité publiquement', adult: 'J’ai 18 ans ou plus', save: 'Enregistrer le profil', saved: 'Profil enregistré.', error: 'Enregistrement impossible. Vérifiez les informations et réessayez.', signIn: 'Connectez-vous pour compléter votre profil.', deletion: 'Supprimer le compte', confirmation: 'Saisissez DELETE pour supprimer définitivement votre compte', deleteNote: 'Les sessions sont révoquées, les analyses privées et le profil supprimés, les parties conservées anonymisées. Les signalements expirent après 90 jours et les données d’envoi après 30 jours. Les inscriptions sans invitation expirent après 180 jours.', pending: 'Le changement de fuseau prend effet à minuit dans votre fuseau actuel.', plus: 'Fin de Plus bêta', days: 'Activité', hidden: 'L’activité est privée.', noProfile: 'Profil introuvable.', back: 'Jouer aux échecs' },
};
type Activity = { days: Record<string, number>; streak: number; today?: string };
const deletionCopy = {
  'en-GB': { pending: 'Deletion is pending. Billing cancellation will retry automatically. You can also retry now.', retry: 'Retry deletion' },
  'es-ES': { pending: 'La eliminación está pendiente. Se reintentará cancelar la facturación automáticamente. También puedes reintentarlo ahora.', retry: 'Reintentar eliminación' },
  'fr-FR': { pending: 'La suppression est en attente. L’annulation de la facturation sera réessayée automatiquement. Vous pouvez aussi réessayer maintenant.', retry: 'Réessayer la suppression' },
};
const complimentaryCopy = { 'en-GB': 'Complimentary Plus · No expiry', 'es-ES': 'Plus de cortesía · Sin caducidad', 'fr-FR': 'Plus offert · Sans expiration' };
const billingDates = {
  'en-GB': { next: 'Next payment', end: 'Access ends', grace: 'Payment overdue. Plus grace ends', refresh: 'Refresh billing status', status: { active: 'Active', trialing: 'Scheduled after beta', past_due: 'Payment overdue', canceled: 'Cancelled', incomplete: 'Payment pending', incomplete_expired: 'Payment expired', unpaid: 'Unpaid', paused: 'Paused' } },
  'es-ES': { next: 'Próximo pago', end: 'El acceso termina', grace: 'Pago pendiente. El periodo de gracia de Plus termina', refresh: 'Actualizar facturación', status: { active: 'Activa', trialing: 'Programada tras la beta', past_due: 'Pago pendiente', canceled: 'Cancelada', incomplete: 'Pago en curso', incomplete_expired: 'Pago caducado', unpaid: 'Sin pagar', paused: 'En pausa' } },
  'fr-FR': { next: 'Prochain paiement', end: 'Fin de l’accès', grace: 'Paiement en retard. Fin du délai de grâce Plus', refresh: 'Actualiser la facturation', status: { active: 'Actif', trialing: 'Prévu après la bêta', past_due: 'Paiement en retard', canceled: 'Annulé', incomplete: 'Paiement en attente', incomplete_expired: 'Paiement expiré', unpaid: 'Impayé', paused: 'En pause' } },
};
const billingCopy = {
  'en-GB': { title: 'Ludus Plus', unavailable: 'Subscriptions are not available yet.', buy: 'Subscribe to Plus', manage: 'Manage subscription', error: 'Could not open billing. Try again.', monthly: 'per month, including applicable tax', renewal: 'Cancel anytime. Your remaining beta days stay free. Billing starts after beta ends.', returned: 'Checking subscription status. Payment confirmation can take a moment.' },
  'es-ES': { title: 'Ludus Plus', unavailable: 'Las suscripciones aún no están disponibles.', buy: 'Suscribirme a Plus', manage: 'Gestionar suscripción', error: 'No se ha podido abrir la facturación. Inténtalo de nuevo.', monthly: 'al mes, impuestos aplicables incluidos', renewal: 'Cancela cuando quieras. Los días restantes de la beta siguen siendo gratuitos. La facturación comienza al terminar la beta.', returned: 'Comprobando la suscripción. La confirmación del pago puede tardar un momento.' },
  'fr-FR': { title: 'Ludus Plus', unavailable: 'Les abonnements ne sont pas encore disponibles.', buy: 'S’abonner à Plus', manage: 'Gérer l’abonnement', error: 'Impossible d’ouvrir la facturation. Réessayez.', monthly: 'par mois, taxes applicables comprises', renewal: 'Annulez à tout moment. Les jours restants de la bêta restent gratuits. La facturation commence à la fin de la bêta.', returned: 'Vérification de l’abonnement. La confirmation du paiement peut prendre un moment.' },
};
type BillingStatus = { enabled: boolean; complimentaryPlus?: boolean; canManage: boolean; amount: number; currency: string; subscription: { status: string; paid_until: number | null; cancel_at: number | null; grace_until: number | null; next_charge_at: number | null; amount: number | null; currency: string | null } | null };
function BillingSection({ language }: { language: Language }) {
  const copy = billingCopy[language];
  const [status, setStatus] = useState<BillingStatus | null>(null), [error, setError] = useState(false), [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true); setError(false);
    try { const response = await fetch('/api/billing'); if (!response.ok) throw new Error(); setStatus(await response.json() as BillingStatus); }
    catch { setError(true); } finally { setBusy(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/billing', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      setStatus(await response.json() as BillingStatus);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  async function open(action: 'checkout' | 'portal') {
    setBusy(true); setError(false);
    try {
      const response = await fetch(`/api/billing/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error();
      const data = await response.json() as { url: string };
      const url = new URL(data.url);
      if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)) throw new Error();
      location.assign(url.href);
    } catch { setError(true); setBusy(false); }
  }
  const subscribed = status?.subscription && !['canceled', 'incomplete_expired'].includes(status.subscription.status);
  const dates = billingDates[language], sub = status?.subscription;
  const date = (value: number) => new Intl.DateTimeFormat(language, { dateStyle: 'long', timeStyle: 'short' }).format(value);
  return <section className="profile-billing" aria-label={copy.title}>
    <h2>{copy.title}</h2>
    {!status ? <p role="status" aria-busy={!error}>{error ? copy.error : '…'}</p> : <>
      {status.complimentaryPlus ? <p>{complimentaryCopy[language]}</p> : <p>{new Intl.NumberFormat(language, { style: 'currency', currency: sub?.currency ?? status.currency }).format((sub?.amount ?? status.amount) / 100)} {copy.monthly}</p>}
      {sub && <p>{dates.status[sub.status as keyof typeof dates.status] ?? copy.returned}</p>}
      {sub?.cancel_at ? <p>{dates.end}: {date(sub.cancel_at)}</p> : subscribed && sub?.next_charge_at ? <p>{dates.next}: {date(sub.next_charge_at)}</p> : null}
      {sub?.grace_until && sub.grace_until > Date.now() && <p>{dates.grace}: {date(sub.grace_until)}</p>}
      {!status.complimentaryPlus && (!status.enabled ? <p>{copy.unavailable}</p> : !subscribed && <><p>{copy.renewal}</p><button disabled={busy} onClick={() => void open('checkout')}>{copy.buy}</button></>)}
      {status.canManage && <button disabled={busy} onClick={() => void open('portal')}>{copy.manage}</button>}
      <button disabled={busy} onClick={() => void refresh()}>{dates.refresh}</button>
      {error && <p role="alert">{copy.error}</p>}
    </>}
  </section>;
}
const levels = { 'en-GB': ['Beginner', 'Casual', 'Intermediate', 'Advanced'], 'es-ES': ['Principiante', 'Ocasional', 'Intermedio', 'Avanzado'], 'fr-FR': ['Débutant', 'Occasionnel', 'Intermédiaire', 'Avancé'] };
const teaching = { 'en-GB': ['Beginner', 'Developing', 'Club', 'Advanced'], 'es-ES': ['Principiante', 'En desarrollo', 'Club', 'Avanzado'], 'fr-FR': ['Débutant', 'En progression', 'Club', 'Avancé'] };
const profileCopy = {
  'en-GB': { share: 'Share profile', copied: 'Link copied', shareError: 'Copy your profile link below.', settings: 'Profile settings', public: 'View public profile', games: 'Games in the past year', active: 'Days played', streak: 'Day streak', less: 'Less', more: 'More', note: 'Completed games against people and the computer. Every day at the board counts.', scroll: 'Scroll to explore the year', inspect: 'Choose a day', matches: 'Completed games', ratings: 'Over the board', unrated: 'Play rated human games to establish your rating.', provisional: 'Provisional', rated: 'rated games', private: 'Only you can see this activity.', join: 'Your next move', invitation: 'A seat at the table is waiting.', play: 'Play chess', account: 'Account', unavailable: 'Activity could not be loaded.' },
  'es-ES': { share: 'Compartir perfil', copied: 'Enlace copiado', shareError: 'Copia el enlace de tu perfil.', settings: 'Ajustes del perfil', public: 'Ver perfil público', games: 'Partidas en el último año', active: 'Días de juego', streak: 'Días de racha', less: 'Menos', more: 'Más', note: 'Partidas completadas contra personas y el ordenador. Cada día en el tablero cuenta.', scroll: 'Desliza para explorar el año', inspect: 'Elige un día', matches: 'Partidas completadas', ratings: 'En el tablero', unrated: 'Juega partidas puntuadas contra personas para obtener tu puntuación.', provisional: 'Provisional', rated: 'partidas puntuadas', private: 'Solo tú puedes ver esta actividad.', join: 'Tu próxima jugada', invitation: 'Te espera un sitio en la mesa.', play: 'Jugar al ajedrez', account: 'Cuenta', unavailable: 'No se ha podido cargar la actividad.' },
  'fr-FR': { share: 'Partager le profil', copied: 'Lien copié', shareError: 'Copiez le lien de votre profil.', settings: 'Paramètres du profil', public: 'Voir le profil public', games: 'Parties cette année', active: 'Jours de jeu', streak: 'Jours de suite', less: 'Moins', more: 'Plus', note: 'Parties terminées contre des joueurs et l’ordinateur. Chaque jour à l’échiquier compte.', scroll: 'Faites défiler pour explorer l’année', inspect: 'Choisir un jour', matches: 'Parties terminées', ratings: 'Sur l’échiquier', unrated: 'Jouez des parties classées contre des joueurs pour obtenir votre classement.', provisional: 'Provisoire', rated: 'parties classées', private: 'Vous seul pouvez voir cette activité.', join: 'Votre prochain coup', invitation: 'Une place vous attend à la table.', play: 'Jouer aux échecs', account: 'Compte', unavailable: 'Impossible de charger l’activité.' },
};
type Rating = { control: string; rating: number; games: number };
function ShareProfile({ username, language }: { username: string; language: Language }) {
  const copy = profileCopy[language];
  const [result, setResult] = useState<'copied' | 'shareError' | null>(null);
  const url = `${location.origin}/@${encodeURIComponent(username)}`;
  async function share() {
    setResult(null);
    try {
      if (navigator.share) await navigator.share({ title: `@${username} · Ludus`, url });
      else { await navigator.clipboard.writeText(url); setResult('copied'); }
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setResult('shareError'); }
  }
  return <div className="profile-share"><button className="profile-button profile-button-primary" onClick={() => void share()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7" /></svg>{copy.share}</button>{result && <p aria-live="polite">{copy[result]}</p>}{result === 'shareError' && <input aria-label={copy.share} readOnly value={url} onFocus={(event) => event.currentTarget.select()} />}</div>;
}
function ActivityGrid({ activity, language, privateActivity = false }: { activity: Activity; language: Language; privateActivity?: boolean }) {
  const copy = profileCopy[language];
  const grid = useRef<HTMLDivElement>(null);
  const today = activity.today ?? new Date().toISOString().slice(0, 10);
  const [selected, setSelected] = useState(today);
  useEffect(() => { if (grid.current) grid.current.scrollLeft = grid.current.scrollWidth; }, [today]);
  const end = new Date(`${today}T12:00:00Z`);
  const dates = Array.from({ length: 365 }, (_, index) => new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 364 + index)).toISOString().slice(0, 10));
  const offset = (new Date(`${dates[0]}T12:00:00Z`).getUTCDay() + 6) % 7;
  const total = dates.reduce((sum, date) => sum + (activity.days[date] ?? 0), 0);
  const active = dates.filter((date) => activity.days[date] > 0).length;
  const monthFormat = new Intl.DateTimeFormat(language, { month: 'short', timeZone: 'UTC' });
  const weekdayFormat = new Intl.DateTimeFormat(language, { weekday: 'short', timeZone: 'UTC' });
  return <section className="profile-activity" aria-label={labels[language].days}>
    <div className="activity-heading"><div><strong>{total.toLocaleString(language)}</strong><h2>{copy.games}</h2></div><span>{new Date(`${dates[0]}T12:00:00Z`).getUTCFullYear()} / {end.getUTCFullYear()}</span></div>
    {privateActivity && <p className="activity-private">{copy.private}</p>}
    <div className="activity-scroll" ref={grid} tabIndex={0} role="group" aria-label={copy.scroll}>
      <div className="activity-calendar">
        <div className="activity-months" aria-hidden="true">{dates.map((date, index) => (index === 0 || (date.endsWith('-01') && index > 7)) && <span key={date} style={{ gridColumn: Math.floor((index + offset) / 7) + 1 }}>{monthFormat.format(new Date(`${date}T12:00:00Z`))}</span>)}</div>
        <div className="activity-weekdays" aria-hidden="true">{[0, 2, 4].map((day) => <span key={day} style={{ gridRow: day + 1 }}>{weekdayFormat.format(new Date(Date.UTC(2026, 0, 5 + day)))}</span>)}</div>
        <div className="activity-cells" role="img" aria-label={`${copy.games}: ${total}. ${copy.active}: ${active}. ${copy.streak}: ${activity.streak}.`}>
          {dates.map((date, index) => { const count = activity.days[date] ?? 0; return <span key={date} className={`activity-cell activity-level-${Math.min(count, 4)}`} style={{ gridColumn: Math.floor((index + offset) / 7) + 1, gridRow: (index + offset) % 7 + 1 }} title={`${date}: ${count}`} />; })}
        </div>
      </div>
    </div>
    <div className="activity-key"><span>{copy.scroll}</span><div>{copy.less}{[0, 1, 2, 3, 4].map((level) => <span key={level} className={`activity-cell activity-level-${level}`} />)}{copy.more}</div></div>
    <div className="activity-statistics"><div><strong>{activity.streak}</strong><span>{copy.streak}</span></div><div><strong>{active}</strong><span>{copy.active}</span></div><label>{copy.inspect}<input type="date" min={dates[0]} max={today} value={selected} onChange={(event) => setSelected(event.target.value)} /><span aria-live="polite">{copy.matches}: {activity.days[selected] ?? 0}</span></label></div>
    <p className="activity-note">{copy.note}</p>
  </section>;
}
function Ratings({ ratings, language }: { ratings: Rating[]; language: Language }) {
  const copy = profileCopy[language];
  return <section className="profile-ratings" aria-label={copy.ratings}><h2>{copy.ratings}</h2><div className="rating-list">{['5+3', '10+5'].map((control) => { const rating = ratings.find((item) => item.control === control); return <div className="rating-item" key={control}><span>{control}</span><strong>{rating?.games ? Math.round(rating.rating) : '—'}</strong><small>{rating?.games ? `${rating.games} ${copy.rated}${rating.games < 10 ? ` · ${copy.provisional}` : ''}` : copy.unrated}</small></div>; })}</div></section>;
}
export function Account() {
  const navigate = useNavigate(), [params] = useSearchParams();
  const { i18n } = useTranslation(); const language = i18n.language in labels ? i18n.language as Language : 'en-GB'; const copy = labels[language];
  const [profile, setProfile] = useState<PlayerProfile | null>(null), [loaded, setLoaded] = useState(false), [signedIn, setSignedIn] = useState(true), [operator, setOperator] = useState(false);
  const [activity, setActivity] = useState<Activity | null>(null), [message, setMessage] = useState(''), [pending, setPending] = useState(false), [confirmation, setConfirmation] = useState('');
  const [deletionPending, setDeletionPending] = useState(false);
  const [ratings, setRatings] = useState<Rating[] | null>(null);
  useEffect(() => {
    if (!profile?.username) return;
    const controller = new AbortController();
    setRatings(null);
    void fetch(`/api/profiles/${encodeURIComponent(profile.username)}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { ratings: Rating[] };
      if (!controller.signal.aborted) setRatings(data.ratings);
    }).catch(() => { /* Profile settings remain available when ratings cannot load. */ });
    return () => controller.abort();
  }, [profile?.username]);
  useEffect(() => { void fetch('/api/account').then(async (r) => { if (r.status === 401) { setSignedIn(false); return; } if (!r.ok) throw new Error(); const data = await r.json() as { profile: PlayerProfile | null; operator: boolean; activity?: Activity; deletionPending?: boolean }; if (data.deletionPending) { setDeletionPending(true); return; } setProfile(data.profile); setOperator(data.operator); setActivity(data.activity ?? null); }).catch(() => setMessage(copy.error)).finally(() => setLoaded(true)); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setPending(true); setMessage('');
    try {
      const response = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.get('username'), language: form.get('language'), timezone: form.get('timezone'), chessLevel: form.get('chessLevel'), teachingProfile: form.get('teachingProfile'), activityPublic: form.get('activityPublic') === 'on', adult: form.get('adult') === 'on' }) });
      if (!response.ok) throw new Error(); const data = await response.json() as { profile: PlayerProfile }; setProfile(data.profile); await i18n.changeLanguage(data.profile.language); localStorage.setItem('ludus-language', data.profile.language); setMessage(copy.saved); if (!profile) navigate(playReturnPath(params.get('returnTo')));
    } catch { setMessage(copy.error); } finally { setPending(false); }
  }
  async function remove() {
    setPending(true);
    try { const result = await fetch('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: deletionPending ? 'DELETE' : confirmation }) }); if (!result.ok) throw new Error(); if (result.status === 202) { setDeletionPending(true); setMessage(''); setPending(false); return; } location.assign('/'); } catch { setMessage(copy.error); setPending(false); }
  }
  return <div className="site-shell profile-page"><Header /><main className="profile-main"><nav className="profile-navigation"><Link to="/play">← {copy.back}</Link>{profile && <Link to={`/@${encodeURIComponent(profile.username)}`}>{profileCopy[language].public} ↗</Link>}</nav>
    <div className="profile-identity"><div><p className="profile-eyebrow">{copy.title}</p><h1>{profile ? `@${profile.username}` : copy.title}</h1></div>{profile && <ShareProfile username={profile.username} language={language} />}</div>
    {loaded && signedIn && !deletionPending && profile && (activity ? <ActivityGrid activity={activity} language={language} privateActivity={!profile.activityPublic} /> : <p>{profileCopy[language].unavailable}</p>)}
    {!loaded ? <p aria-busy="true">…</p> : !signedIn ? <p>{copy.signIn}</p> : deletionPending ? <><p>{deletionCopy[language].pending}</p><button disabled={pending} onClick={() => void remove()}>{deletionCopy[language].retry}</button></> : <>
      {ratings && <Ratings ratings={ratings} language={language} />}
      <div className="profile-account-layout"><section className="profile-settings"><h2>{profileCopy[language].settings}</h2><form className="profile-form" onSubmit={(event) => void save(event)} key={profile?.userId ?? 'new'}>
        <label>{copy.username}<input name="username" required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]{3,24}" defaultValue={profile?.username} autoComplete="nickname" /></label>
        <label>{copy.language}<select name="language" defaultValue={profile?.language ?? language}>{Object.entries(languageNames).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label>{copy.timezone}<input name="timezone" required defaultValue={profile?.pendingTimezone ?? profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone} list="timezones" /></label>
        <datalist id="timezones">{Intl.supportedValuesOf('timeZone').map((zone) => <option key={zone} value={zone} />)}</datalist><small>{copy.pending}</small>
        <label>{copy.level}<select name="chessLevel" defaultValue={profile?.chessLevel ?? 'beginner'}>{['beginner', 'casual', 'intermediate', 'advanced'].map((level, index) => <option key={level} value={level}>{levels[language][index]}</option>)}</select></label>
        <label>{copy.teaching}<select name="teachingProfile" defaultValue={profile?.teachingProfile ?? 'beginner'}>{teachingProfiles.map((level, index) => <option key={level} value={level}>{teaching[language][index]}</option>)}</select></label>
        <label className="profile-check"><input type="checkbox" name="activityPublic" defaultChecked={profile?.activityPublic ?? true} /> {copy.activity}</label>
        <p>{copy.privacy}</p><label className="profile-check"><input type="checkbox" name="adult" required defaultChecked={!!profile} /> {copy.adult}</label>
        <button type="submit" disabled={pending}>{copy.save}</button>
      </form></section><aside className="profile-account-side">
      {profile && <><p className="profile-trial">{copy.plus}: {new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(profile.trialExpiresAt)}</p></>}
      {profile && <BillingSection language={language} />}
      {operator && <p><Link to="/operator">Operator</Link></p>}
      {profile && <details className="profile-danger"><summary>{copy.deletion}</summary><p>{copy.deleteNote}</p><label>{copy.confirmation}<input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label><button disabled={pending || confirmation !== 'DELETE'} onClick={() => void remove()}>{copy.deletion}</button></details>}</aside></div>
    </>}<p role="status">{message}</p></main></div>;
}
export function PublicProfile() {
  const { username: legacyUsername, handle } = useParams(); const username = legacyUsername ?? handle?.slice(1); const { i18n } = useTranslation(); const language: Language = isLanguage(i18n.language) ? i18n.language : 'en-GB'; const copy = labels[language], text = profileCopy[language];
  const [data, setData] = useState<{ username: string; ratings: Rating[]; activity?: Activity } | null>(null), [missing, setMissing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setMissing(false);
    void fetch(`/api/profiles/${encodeURIComponent(username ?? '')}`, { signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error(); const result = await response.json() as { username: string; ratings: Rating[]; activity?: Activity }; if (!controller.signal.aborted) setData(result); }).catch(() => { if (!controller.signal.aborted) setMissing(true); });
    return () => controller.abort();
  }, [username]);
  return <div className="site-shell profile-page"><Header /><main className="profile-main"><nav className="profile-navigation"><Link to="/play">← {copy.back}</Link><Link to="/account">{text.account}</Link></nav>
    <div className="profile-identity"><h1>@{data?.username ?? username}</h1>{data && <ShareProfile username={data.username} language={language} />}</div>
    {missing ? <p role="alert">{copy.noProfile}</p> : !data ? <p aria-busy="true">…</p> : <>
      {data.activity ? <ActivityGrid activity={data.activity} language={language} /> : <section className="profile-activity profile-hidden"><h2>{copy.hidden}</h2></section>}
      <Ratings ratings={data.ratings} language={language} />
      <section className="profile-invitation"><div><p className="profile-eyebrow">{text.join}</p><h2>{text.invitation}</h2></div><Link className="profile-button profile-button-primary" to="/play">{text.play} ↗</Link></section>
    </>}
  </main></div>;
}
