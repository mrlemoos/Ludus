import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { PlayerProfile } from '../shared/profile';
import { teachingProfiles } from '../shared/profile';
import { languageNames } from './i18n';
import type { Language } from '../shared/waitlist';

const labels = {
  'en-GB': { title: 'Your profile', username: 'Public username', timezone: 'Timezone', language: 'Language', level: 'Chess level', teaching: 'Teaching profile', activity: 'Show my activity publicly', adult: 'I am aged 18 or over', save: 'Save profile', saved: 'Profile saved.', error: 'Could not save. Check your details and try again.', signIn: 'Sign in to complete your profile.', deletion: 'Delete account', confirmation: 'Type DELETE to permanently delete your account', deleteNote: 'This revokes sessions, deletes private reviews and profile data, and anonymises retained matches. Abuse reports expire after 90 days; invitation delivery metadata after 30 days. Uninvited waitlist entries expire after 180 days.', pending: 'Timezone changes start at the next midnight in your current timezone.', plus: 'Beta Plus ends', days: 'Activity', hidden: 'Activity is private.', noProfile: 'Profile not found.', back: 'Play chess' },
  'es-ES': { title: 'Tu perfil', username: 'Nombre público', timezone: 'Zona horaria', language: 'Idioma', level: 'Nivel de ajedrez', teaching: 'Perfil del entrenador', activity: 'Mostrar mi actividad públicamente', adult: 'Tengo 18 años o más', save: 'Guardar perfil', saved: 'Perfil guardado.', error: 'No se ha podido guardar. Revisa los datos e inténtalo de nuevo.', signIn: 'Inicia sesión para completar tu perfil.', deletion: 'Eliminar cuenta', confirmation: 'Escribe DELETE para eliminar tu cuenta definitivamente', deleteNote: 'Se revocan las sesiones, se eliminan los análisis privados y el perfil, y se anonimizan las partidas conservadas. Los informes se borran a los 90 días; los datos de envío, a los 30 días. La lista de espera sin invitación caduca a los 180 días.', pending: 'Los cambios de zona horaria se aplican a medianoche en tu zona actual.', plus: 'Plus de la beta termina', days: 'Actividad', hidden: 'La actividad es privada.', noProfile: 'Perfil no encontrado.', back: 'Jugar al ajedrez' },
  'fr-FR': { title: 'Votre profil', username: 'Pseudo public', timezone: 'Fuseau horaire', language: 'Langue', level: 'Niveau aux échecs', teaching: 'Profil du coach', activity: 'Afficher mon activité publiquement', adult: 'J’ai 18 ans ou plus', save: 'Enregistrer le profil', saved: 'Profil enregistré.', error: 'Enregistrement impossible. Vérifiez les informations et réessayez.', signIn: 'Connectez-vous pour compléter votre profil.', deletion: 'Supprimer le compte', confirmation: 'Saisissez DELETE pour supprimer définitivement votre compte', deleteNote: 'Les sessions sont révoquées, les analyses privées et le profil supprimés, les parties conservées anonymisées. Les signalements expirent après 90 jours et les données d’envoi après 30 jours. Les inscriptions sans invitation expirent après 180 jours.', pending: 'Le changement de fuseau prend effet à minuit dans votre fuseau actuel.', plus: 'Fin de Plus bêta', days: 'Activité', hidden: 'L’activité est privée.', noProfile: 'Profil introuvable.', back: 'Jouer aux échecs' },
};
type Activity = { days: Record<string, number>; streak: number; today?: string };
const levels = { 'en-GB': ['Beginner', 'Casual', 'Intermediate', 'Advanced'], 'es-ES': ['Principiante', 'Ocasional', 'Intermedio', 'Avanzado'], 'fr-FR': ['Débutant', 'Occasionnel', 'Intermédiaire', 'Avancé'] };
const teaching = { 'en-GB': ['Beginner', 'Developing', 'Club', 'Advanced'], 'es-ES': ['Principiante', 'En desarrollo', 'Club', 'Avanzado'], 'fr-FR': ['Débutant', 'En progression', 'Club', 'Avancé'] };
function ActivityGrid({ activity, label }: { activity: Activity; label: string }) {
  const end = activity.today ? new Date(`${activity.today}T12:00:00Z`) : new Date();
  const dates = Array.from({ length: 364 }, (_, index) => new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 363 + index)).toISOString().slice(0, 10));
  return <section aria-label={label}><p>{label}: {activity.streak}</p><div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 10px)', gridAutoFlow: 'column', gap: 3, overflowX: 'auto', padding: 4 }}>
    {dates.map((date) => <span key={date} role="img" aria-label={`${date}: ${activity.days[date] ?? 0}`} title={`${date}: ${activity.days[date] ?? 0}`} style={{ width: 10, height: 10, borderRadius: 2, background: activity.days[date] ? 'var(--accent, #9e6d3d)' : '#ccc5b8' }} />)}
  </div></section>;
}
export function Account() {
  const { i18n } = useTranslation(); const language = i18n.language in labels ? i18n.language as Language : 'en-GB'; const copy = labels[language];
  const [profile, setProfile] = useState<PlayerProfile | null>(null), [loaded, setLoaded] = useState(false), [signedIn, setSignedIn] = useState(true), [operator, setOperator] = useState(false);
  const [activity, setActivity] = useState<Activity | null>(null), [message, setMessage] = useState(''), [pending, setPending] = useState(false), [confirmation, setConfirmation] = useState('');
  useEffect(() => { void fetch('/api/account').then(async (r) => { if (r.status === 401) { setSignedIn(false); return; } if (!r.ok) throw new Error(); const data = await r.json() as { profile: PlayerProfile | null; operator: boolean; activity?: Activity }; setProfile(data.profile); setOperator(data.operator); setActivity(data.activity ?? null); }).catch(() => setMessage(copy.error)).finally(() => setLoaded(true)); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setPending(true); setMessage('');
    try {
      const response = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.get('username'), language: form.get('language'), timezone: form.get('timezone'), chessLevel: form.get('chessLevel'), teachingProfile: form.get('teachingProfile'), activityPublic: form.get('activityPublic') === 'on', adult: form.get('adult') === 'on' }) });
      if (!response.ok) throw new Error(); const data = await response.json() as { profile: PlayerProfile }; setProfile(data.profile); await i18n.changeLanguage(data.profile.language); localStorage.setItem('ludus-language', data.profile.language); setMessage(copy.saved);
    } catch { setMessage(copy.error); } finally { setPending(false); }
  }
  async function remove() {
    setPending(true);
    try { const result = await fetch('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation }) }); if (!result.ok) throw new Error(); location.assign('/'); } catch { setMessage(copy.error); setPending(false); }
  }
  return <main className="lobby" style={{ maxWidth: 640, margin: '3rem auto', padding: 24 }}><Link to="/play">{copy.back}</Link><h1>{copy.title}</h1>
    {!loaded ? <p aria-busy="true">…</p> : !signedIn ? <p>{copy.signIn}</p> : <>
      <form onSubmit={(event) => void save(event)} style={{ display: 'grid', gap: 16 }} key={profile?.userId ?? 'new'}>
        <label>{copy.username}<input name="username" required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]{3,24}" defaultValue={profile?.username} autoComplete="nickname" /></label>
        <label>{copy.language}<select name="language" defaultValue={profile?.language ?? language}>{Object.entries(languageNames).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label>{copy.timezone}<input name="timezone" required defaultValue={profile?.pendingTimezone ?? profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone} list="timezones" /></label>
        <datalist id="timezones">{Intl.supportedValuesOf('timeZone').map((zone) => <option key={zone} value={zone} />)}</datalist><small>{copy.pending}</small>
        <label>{copy.level}<select name="chessLevel" defaultValue={profile?.chessLevel ?? 'beginner'}>{['beginner', 'casual', 'intermediate', 'advanced'].map((level, index) => <option key={level} value={level}>{levels[language][index]}</option>)}</select></label>
        <label>{copy.teaching}<select name="teachingProfile" defaultValue={profile?.teachingProfile ?? 'beginner'}>{teachingProfiles.map((level, index) => <option key={level} value={level}>{teaching[language][index]}</option>)}</select></label>
        <label><input type="checkbox" name="activityPublic" defaultChecked={profile?.activityPublic ?? true} /> {copy.activity}</label>
        <p>{copy.deleteNote}</p><label><input type="checkbox" name="adult" required defaultChecked={!!profile} /> {copy.adult}</label>
        <button disabled={pending}>{copy.save}</button>
      </form>
      {profile && <><p>{copy.plus}: {new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(profile.trialExpiresAt)}</p><Link to={`/players/${profile.username}`}>{profile.username}</Link></>}
      {activity && <ActivityGrid activity={activity} label={copy.days} />}{operator && <p><Link to="/operator">Operator</Link></p>}
      {profile && <details><summary>{copy.deletion}</summary><p>{copy.deleteNote}</p><label>{copy.confirmation}<input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label><button disabled={pending || confirmation !== 'DELETE'} onClick={() => void remove()}>{copy.deletion}</button></details>}
    </>}<p role="status">{message}</p></main>;
}
export function PublicProfile() {
  const { username } = useParams(); const { i18n } = useTranslation(); const copy = labels[i18n.language as Language] ?? labels['en-GB'];
  const [data, setData] = useState<{ username: string; ratings: { control: string; rating: number; games: number }[]; activity?: Activity } | null>(null), [missing, setMissing] = useState(false);
  useEffect(() => { setData(null); setMissing(false); void fetch(`/api/profiles/${encodeURIComponent(username ?? '')}`).then(async (r) => { if (!r.ok) throw new Error(); setData(await r.json()); }).catch(() => setMissing(true)); }, [username]);
  return <main style={{ maxWidth: 720, margin: '3rem auto', padding: 24 }}><Link to="/play">{copy.back}</Link><h1>{data?.username ?? username}</h1>{missing ? <p>{copy.noProfile}</p> : !data ? <p aria-busy="true">…</p> : <>{data.ratings.map((rating) => <p key={rating.control}>{rating.control}: {Math.round(rating.rating)} {rating.games < 10 ? '*' : ''}</p>)}{data.activity ? <ActivityGrid activity={data.activity} label={copy.days} /> : <p>{copy.hidden}</p>}</>}</main>;
}
