import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Language } from '../shared/waitlist';
import type { PublicActivity as Activity, PublicRating as Rating, PublicPlayerProfile } from '../shared/public-profile';
import { profilePath, publicOrigin } from '../shared/profile-seo';

export const publicLabels = {
  'en-GB': { unavailable: 'Profile temporarily unavailable. Reload to try again.', days: 'Activity', hidden: 'Activity is private.', noProfile: 'Profile not found.', back: 'Play chess' },
  'es-ES': { unavailable: 'Perfil no disponible temporalmente. Recarga la página para reintentarlo.', days: 'Actividad', hidden: 'La actividad es privada.', noProfile: 'Perfil no encontrado.', back: 'Jugar al ajedrez' },
  'fr-FR': { unavailable: 'Profil temporairement indisponible. Rechargez la page pour réessayer.', days: 'Activité', hidden: 'L’activité est privée.', noProfile: 'Profil introuvable.', back: 'Jouer aux échecs' },
};
export const profileCopy = {
  'en-GB': { share: 'Share profile', copied: 'Link copied', shareError: 'Copy your profile link below.', settings: 'Profile settings', public: 'View public profile', games: 'Games in the past year', active: 'Days played', streak: 'Day streak', less: 'Less', more: 'More', note: 'Completed games against people and the computer. Every day at the board counts.', scroll: 'Scroll to explore the year', inspect: 'Choose a day', matches: 'Completed games', ratings: 'Over the board', unrated: 'Play rated human games to establish your rating.', provisional: 'Provisional', rated: 'rated games', private: 'Only you can see this activity.', join: 'Your next move', invitation: 'A seat at the table is waiting.', play: 'Play chess', account: 'Account', unavailable: 'Activity could not be loaded.' },
  'es-ES': { share: 'Compartir perfil', copied: 'Enlace copiado', shareError: 'Copia el enlace de tu perfil.', settings: 'Ajustes del perfil', public: 'Ver perfil público', games: 'Partidas en el último año', active: 'Días de juego', streak: 'Días de racha', less: 'Menos', more: 'Más', note: 'Partidas completadas contra personas y el ordenador. Cada día en el tablero cuenta.', scroll: 'Desliza para explorar el año', inspect: 'Elige un día', matches: 'Partidas completadas', ratings: 'En el tablero', unrated: 'Juega partidas puntuadas contra personas para obtener tu puntuación.', provisional: 'Provisional', rated: 'partidas puntuadas', private: 'Solo tú puedes ver esta actividad.', join: 'Tu próxima jugada', invitation: 'Te espera un sitio en la mesa.', play: 'Jugar al ajedrez', account: 'Cuenta', unavailable: 'No se ha podido cargar la actividad.' },
  'fr-FR': { share: 'Partager le profil', copied: 'Lien copié', shareError: 'Copiez le lien de votre profil.', settings: 'Paramètres du profil', public: 'Voir le profil public', games: 'Parties cette année', active: 'Jours de jeu', streak: 'Jours de suite', less: 'Moins', more: 'Plus', note: 'Parties terminées contre des joueurs et l’ordinateur. Chaque jour à l’échiquier compte.', scroll: 'Faites défiler pour explorer l’année', inspect: 'Choisir un jour', matches: 'Parties terminées', ratings: 'Sur l’échiquier', unrated: 'Jouez des parties classées contre des joueurs pour obtenir votre classement.', provisional: 'Provisoire', rated: 'parties classées', private: 'Vous seul pouvez voir cette activité.', join: 'Votre prochain coup', invitation: 'Une place vous attend à la table.', play: 'Jouer aux échecs', account: 'Compte', unavailable: 'Impossible de charger l’activité.' },
};

export function ShareProfile({ username, language }: { username: string; language: Language }) {
  const copy = profileCopy[language];
  const [result, setResult] = useState<'copied' | 'shareError' | null>(null);
  const url = `${typeof window === 'undefined' ? publicOrigin : window.location.origin}${profilePath(username)}`;
  async function share() {
    setResult(null);
    try {
      if (navigator.share) await navigator.share({ title: `@${username} · Ludus`, url });
      else { await navigator.clipboard.writeText(url); setResult('copied'); }
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setResult('shareError'); }
  }
  return <div className="profile-share"><button className="profile-button profile-button-primary" onClick={() => void share()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7" /></svg>{copy.share}</button>{result && <p aria-live="polite">{copy[result]}</p>}{result === 'shareError' && <input aria-label={copy.share} readOnly value={url} onFocus={(event) => event.currentTarget.select()} />}</div>;
}
export function ActivityGrid({ activity, language, privateActivity = false }: { activity: Activity; language: Language; privateActivity?: boolean }) {
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
  return <section className="profile-activity" aria-label={publicLabels[language].days}>
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
export function Ratings({ ratings, language }: { ratings: Rating[]; language: Language }) {
  const copy = profileCopy[language];
  return <section className="profile-ratings" aria-label={copy.ratings}><h2>{copy.ratings}</h2><div className="rating-list">{['5+3', '10+5'].map((control) => { const rating = ratings.find((item) => item.control === control); return <div className="rating-item" key={control}><span>{control}</span><strong>{rating?.games ? Math.round(rating.rating) : '—'}</strong><small>{rating?.games ? `${rating.games} ${copy.rated}${rating.games < 10 ? ` · ${copy.provisional}` : ''}` : copy.unrated}</small></div>; })}</div></section>;
}

export function PublicProfilePage({ data, username, language, missing = false, unavailable = false, header }: { data: PublicPlayerProfile | null; username: string; language: Language; missing?: boolean; unavailable?: boolean; header: ReactNode }) {
  const copy = publicLabels[language], text = profileCopy[language];
  return <div className="site-shell profile-page">{header}<main className="profile-main"><nav className="profile-navigation"><Link to="/play">← {copy.back}</Link><Link to="/account">{text.account}</Link></nav>
    <div className="profile-identity"><h1>@{data?.username ?? username}</h1>{data && <ShareProfile username={data.username} language={language} />}</div>
    {missing ? <p role="alert">{copy.noProfile}</p> : unavailable ? <p role="alert">{copy.unavailable}</p> : !data ? <p aria-busy="true">…</p> : <>
      {data.activity ? <ActivityGrid activity={data.activity} language={language} /> : <section className="profile-activity profile-hidden"><h2>{copy.hidden}</h2></section>}
      <Ratings ratings={data.ratings} language={language} />
      <section className="profile-invitation"><div><p className="profile-eyebrow">{text.join}</p><h2>{text.invitation}</h2></div><Link className="profile-button profile-button-primary" to="/play">{text.play} ↗</Link></section>
    </>}
  </main></div>;
}
