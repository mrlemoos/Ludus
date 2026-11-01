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
import type { ReviewCreditStatus } from '../shared/review-credits';

const labels = {
  'en-GB': { privacy: 'Your email, reviews and coach conversations stay private. Coaching uses the selected game and, when available, up to three earlier finished games. You control whether activity is public.', streak: 'Daily streak', title: 'Your profile', username: 'Public username', timezone: 'Timezone', language: 'Language', level: 'Chess level', teaching: 'Teaching profile', activity: 'Show my activity publicly', adult: 'I am aged 18 or over', save: 'Save profile', saved: 'Profile saved.', error: 'Could not save. Check your details and try again.', signIn: 'Sign in to complete your profile.', deletion: 'Delete account', confirmation: 'Type DELETE to permanently delete your account', deleteNote: 'This revokes sessions, deletes private reviews and profile data, and anonymises retained matches. Abuse reports expire after 90 days; invitation delivery metadata after 30 days. Uninvited waitlist entries expire after 180 days.', pending: 'Timezone changes start at the next midnight in your current timezone.', betaCredits: 'Beta monthly credits end', days: 'Activity', hidden: 'Activity is private.', noProfile: 'Profile not found.', back: 'Play chess' },
  'es-ES': { privacy: 'El correo, los análisis y las conversaciones son privados. Para analizar una partida se usan esa partida y, si están disponibles, hasta tres partidas terminadas anteriores. Tú decides si tu actividad es pública.', streak: 'Racha diaria', title: 'Tu perfil', username: 'Nombre público', timezone: 'Zona horaria', language: 'Idioma', level: 'Nivel de ajedrez', teaching: 'Perfil del entrenador', activity: 'Mostrar mi actividad públicamente', adult: 'Tengo 18 años o más', save: 'Guardar perfil', saved: 'Perfil guardado.', error: 'No se ha podido guardar. Revisa los datos e inténtalo de nuevo.', signIn: 'Inicia sesión para completar tu perfil.', deletion: 'Eliminar cuenta', confirmation: 'Escribe DELETE para eliminar tu cuenta definitivamente', deleteNote: 'Se revocan las sesiones, se eliminan los análisis privados y el perfil, y se anonimizan las partidas conservadas. Los informes se borran a los 90 días; los datos de envío, a los 30 días. La lista de espera sin invitación caduca a los 180 días.', pending: 'Los cambios de zona horaria se aplican a medianoche en tu zona actual.', betaCredits: 'Los créditos mensuales de beta terminan', days: 'Actividad', hidden: 'La actividad es privada.', noProfile: 'Perfil no encontrado.', back: 'Jugar al ajedrez' },
  'fr-FR': { privacy: 'Votre e-mail, vos analyses et vos conversations restent privés. Une analyse utilise la partie choisie et, si elles sont disponibles, jusqu’à trois parties terminées précédentes. Vous choisissez de rendre votre activité publique.', streak: 'Série quotidienne', title: 'Votre profil', username: 'Pseudo public', timezone: 'Fuseau horaire', language: 'Langue', level: 'Niveau aux échecs', teaching: 'Profil du coach', activity: 'Afficher mon activité publiquement', adult: 'J’ai 18 ans ou plus', save: 'Enregistrer le profil', saved: 'Profil enregistré.', error: 'Enregistrement impossible. Vérifiez les informations et réessayez.', signIn: 'Connectez-vous pour compléter votre profil.', deletion: 'Supprimer le compte', confirmation: 'Saisissez DELETE pour supprimer définitivement votre compte', deleteNote: 'Les sessions sont révoquées, les analyses privées et le profil supprimés, les parties conservées anonymisées. Les signalements expirent après 90 jours et les données d’envoi après 30 jours. Les inscriptions sans invitation expirent après 180 jours.', pending: 'Le changement de fuseau prend effet à minuit dans votre fuseau actuel.', betaCredits: 'Fin des crédits mensuels bêta', days: 'Activité', hidden: 'L’activité est privée.', noProfile: 'Profil introuvable.', back: 'Jouer aux échecs' },
};

const deletionCopy = {
  'en-GB': { pending: 'Deletion is pending. Billing cancellation will retry automatically. You can also retry now.', retry: 'Retry deletion' },
  'es-ES': { pending: 'La eliminación está pendiente. Se reintentará cancelar la facturación automáticamente. También puedes reintentarlo ahora.', retry: 'Reintentar eliminación' },
  'fr-FR': { pending: 'La suppression est en attente. L’annulation de la facturation sera réessayée automatiquement. Vous pouvez aussi réessayer maintenant.', retry: 'Réessayer la suppression' },
};
const billingCopy = {
  'en-GB': { title: 'Coach review credits', unavailable: 'Purchases are paused while billing checks are completed.', buy: 'Buy 10 reviews · €4.99', error: 'Could not open secure checkout. Try again.', description: 'Ten coach reviews cost €4.99. The pack does not expire. You always get one introductory review. Monthly free reviews are used before paid reviews. Accounts with a complimentary grant keep 30 monthly reviews after beta.', returned: 'Payment is being confirmed. Credits appear after Stripe confirms it.', intro: 'Introductory review', paid: 'Paid reviews', refund: 'Unused paid packs are refunded on request. Refunds are processed manually. Requests for partly used packs are reviewed individually. See the refund policy.', policies: 'Terms', privacy: 'Privacy', refresh: 'Refresh balance' },
  'es-ES': { title: 'Créditos para análisis del entrenador', unavailable: 'Las compras están pausadas mientras se completan las comprobaciones de facturación.', buy: 'Comprar 10 análisis · 4,99 €', error: 'No se ha podido abrir el pago seguro. Inténtalo de nuevo.', description: 'Diez análisis del entrenador cuestan 4,99 €. El paquete no caduca. Siempre tienes un análisis de bienvenida. Los análisis mensuales gratuitos se usan antes que los comprados. Las cuentas con una concesión de cortesía conservan 30 análisis mensuales después de la beta.', returned: 'Se está confirmando el pago. Los créditos aparecerán cuando Stripe lo confirme.', intro: 'Análisis de bienvenida', beta: 'Análisis mensuales de beta', paid: 'Análisis comprados', refund: 'Los paquetes pagados sin usar se devuelven si lo solicitas. Las devoluciones se tramitan manualmente. Las solicitudes para paquetes usados parcialmente se revisan de forma individual. Consulta la política de reembolsos.', policies: 'Condiciones', privacy: 'Privacidad', refresh: 'Actualizar saldo' },
  'fr-FR': { title: 'Crédits d’analyse du coach', unavailable: 'Les achats sont suspendus pendant les vérifications de facturation.', buy: 'Acheter 10 analyses · 4,99 €', error: 'Impossible d’ouvrir le paiement sécurisé. Réessayez.', description: 'Dix analyses du coach coûtent 4,99 €. Le pack n’expire pas. Vous recevez toujours une analyse de bienvenue. Les analyses mensuelles gratuites sont utilisées avant les analyses payées. Les comptes bénéficiant d’un crédit offert conservent 30 analyses mensuelles après la bêta.', returned: 'Le paiement est en cours de confirmation. Les crédits apparaîtront après confirmation de Stripe.', intro: 'Analyse de bienvenue', beta: 'Analyses mensuelles bêta', paid: 'Analyses achetées', refund: 'Les packs payés non utilisés sont remboursés sur demande. Les remboursements sont traités manuellement. Les demandes concernant un pack partiellement utilisé sont examinées au cas par cas. Consultez la politique de remboursement.', policies: 'Conditions', privacy: 'Confidentialité', refresh: 'Actualiser le solde' },
};
type BillingStatus = { enabled: boolean; reviewCredits?: ReviewCreditStatus };
function BillingSection({ language }: { language: Language }) {
  const copy = billingCopy[language];
  const [params] = useSearchParams();
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
  async function open() {
    setBusy(true); setError(false);
    try {
      const response = await fetch('/api/billing/review-pack/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error();
      const data = await response.json() as { url: string };
      const url = new URL(data.url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error();
      location.assign(url.href);
    } catch { setError(true); setBusy(false); }
  }
  const credits = status?.reviewCredits;
  return <section className="profile-billing" aria-label={copy.title}>
    <h2>{copy.title}</h2>
    {!status ? <p role="status" aria-busy={!error}>{error ? copy.error : '…'}</p> : <>
      <p>{copy.description}</p>
      <p className="profile-credit-balance"><strong>{credits?.available ?? '…'}</strong> {language === 'es-ES' ? 'análisis disponibles' : language === 'fr-FR' ? 'analyses disponibles' : 'reviews available'}</p>
      {credits?.introAvailable && <p>{copy.intro}: 1</p>}
      {credits && credits.monthlyFreeRemaining > 0 && <p>{language === 'es-ES' ? 'Créditos gratuitos de este mes' : language === 'fr-FR' ? 'Crédits gratuits ce mois-ci' : 'Monthly free reviews'}: {credits.monthlyFreeRemaining}</p>}
      {credits && credits.paidRemaining > 0 && <p>{copy.paid}: {credits.paidRemaining}</p>}
      {status.enabled ? <button disabled={busy} onClick={() => void open()}>{copy.buy}</button> : <p>{copy.unavailable}</p>}
      <p className="text-sm">{copy.refund}</p>
      <p className="text-sm"><Link to="/terms">{copy.policies}</Link> · <Link to="/privacy">{copy.privacy}</Link></p>
      <button disabled={busy} onClick={() => void refresh()}>{copy.refresh}</button>
      {params.get('credits') === 'purchased' && <p role="status">{copy.returned}</p>}
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
      {profile && <BillingSection language={language} />}
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
      {profile && <><p className="profile-trial">{copy.betaCredits}: {new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(profile.trialExpiresAt)}</p></>}
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
