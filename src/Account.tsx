import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { playReturnPath } from '../shared/navigation';
import type { PlayerProfile } from '../shared/profile';
import { teachingProfiles } from '../shared/profile';
import { languageNames } from './i18n';
import { isLanguage, type Language } from '../shared/waitlist';
import { Header } from './App';
import { ActivityGrid, Ratings, ShareProfile, PublicProfilePage, profileCopy } from './ProfileView';
import type { PublicActivity as Activity, PublicRating as Rating, PublicPlayerProfile } from '../shared/public-profile';
import { profilePath } from '../shared/profile-seo';
import { readInitialPublicProfile, usePublicProfileMetadata } from './profile-metadata';

const labels = {
  'en-GB': { privacy: 'Email, reviews and coach conversations stay private. You control whether activity is public.', streak: 'Daily streak', title: 'Your profile', username: 'Public username', timezone: 'Timezone', language: 'Language', level: 'Chess level', teaching: 'Teaching profile', activity: 'Show my activity publicly', adult: 'I am aged 18 or over', save: 'Save profile', saved: 'Profile saved.', error: 'Could not save. Check your details and try again.', signIn: 'Sign in to complete your profile.', deletion: 'Delete account', confirmation: 'Type DELETE to permanently delete your account', deleteNote: 'This revokes sessions, deletes private reviews and profile data, and anonymises retained matches. Abuse reports expire after 90 days; invitation delivery metadata after 30 days. Uninvited waitlist entries expire after 180 days.', pending: 'Timezone changes start at the next midnight in your current timezone.', plus: 'Beta Plus ends', days: 'Activity', hidden: 'Activity is private.', noProfile: 'Profile not found.', back: 'Play chess' },
  'es-ES': { privacy: 'El correo, los análisis y las conversaciones son privados. Tú decides si tu actividad es pública.', streak: 'Racha diaria', title: 'Tu perfil', username: 'Nombre público', timezone: 'Zona horaria', language: 'Idioma', level: 'Nivel de ajedrez', teaching: 'Perfil del entrenador', activity: 'Mostrar mi actividad públicamente', adult: 'Tengo 18 años o más', save: 'Guardar perfil', saved: 'Perfil guardado.', error: 'No se ha podido guardar. Revisa los datos e inténtalo de nuevo.', signIn: 'Inicia sesión para completar tu perfil.', deletion: 'Eliminar cuenta', confirmation: 'Escribe DELETE para eliminar tu cuenta definitivamente', deleteNote: 'Se revocan las sesiones, se eliminan los análisis privados y el perfil, y se anonimizan las partidas conservadas. Los informes se borran a los 90 días; los datos de envío, a los 30 días. La lista de espera sin invitación caduca a los 180 días.', pending: 'Los cambios de zona horaria se aplican a medianoche en tu zona actual.', plus: 'Plus de la beta termina', days: 'Actividad', hidden: 'La actividad es privada.', noProfile: 'Perfil no encontrado.', back: 'Jugar al ajedrez' },
  'fr-FR': { privacy: 'Votre e-mail, vos analyses et vos conversations restent privés. Vous choisissez de rendre votre activité publique.', streak: 'Série quotidienne', title: 'Votre profil', username: 'Pseudo public', timezone: 'Fuseau horaire', language: 'Langue', level: 'Niveau aux échecs', teaching: 'Profil du coach', activity: 'Afficher mon activité publiquement', adult: 'J’ai 18 ans ou plus', save: 'Enregistrer le profil', saved: 'Profil enregistré.', error: 'Enregistrement impossible. Vérifiez les informations et réessayez.', signIn: 'Connectez-vous pour compléter votre profil.', deletion: 'Supprimer le compte', confirmation: 'Saisissez DELETE pour supprimer définitivement votre compte', deleteNote: 'Les sessions sont révoquées, les analyses privées et le profil supprimés, les parties conservées anonymisées. Les signalements expirent après 90 jours et les données d’envoi après 30 jours. Les inscriptions sans invitation expirent après 180 jours.', pending: 'Le changement de fuseau prend effet à minuit dans votre fuseau actuel.', plus: 'Fin de Plus bêta', days: 'Activité', hidden: 'L’activité est privée.', noProfile: 'Profil introuvable.', back: 'Jouer aux échecs' },
};

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
  return <div className="site-shell profile-page"><Header /><main className="profile-main"><nav className="profile-navigation"><Link to="/play">← {copy.back}</Link>{profile && <Link to={profilePath(profile.username)}>{profileCopy[language].public} ↗</Link>}</nav>
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
  const { username: legacyUsername, handle } = useParams(); const username = legacyUsername ?? handle?.slice(1) ?? '';
  const { i18n } = useTranslation(); const language: Language = isLanguage(i18n.language) ? i18n.language : 'en-GB';
  const [data, setData] = useState<PublicPlayerProfile | null>(() => readInitialPublicProfile(username)?.data ?? null);
  const [missing, setMissing] = useState(() => readInitialPublicProfile(username)?.missing ?? false);
  const [unavailable, setUnavailable] = useState(false);
  usePublicProfileMetadata(data?.username ?? username, language, missing);
  useEffect(() => {
    const controller = new AbortController();
    setData((current) => current?.username.toLowerCase() === username.toLowerCase() ? current : null); setMissing(false); setUnavailable(false);
    void fetch(`/api/profiles/${encodeURIComponent(username)}`, { signal: controller.signal }).then(async (response) => {
      if (controller.signal.aborted) return;
      if (response.status === 404) { setData(null); setMissing(true); return; }
      if (!response.ok) throw new Error();
      const result = await response.json() as PublicPlayerProfile;
      if (!controller.signal.aborted) { setData(result); setMissing(false); }
    }).catch(() => { if (!controller.signal.aborted) setUnavailable(true); });
    return () => controller.abort();
  }, [username]);
  return <PublicProfilePage data={data} username={username} language={language} missing={missing} unavailable={unavailable && !data} header={<Header />} />;
}
