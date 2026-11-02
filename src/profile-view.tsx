import { profilePath, publicOrigin } from '../shared/profile-seo';
import type {
  PublicActivity as Activity,
  PublicPlayerProfile,
  PublicRating as Rating,
} from '../shared/public-profile';
import type { Language } from '../shared/waitlist';
import { Button } from './components/button';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

export const publicLabels = {
  'en-GB': {
    back: 'Play chess',
    days: 'Activity',
    hidden: 'Activity is private.',
    noProfile: 'Profile not found.',
    unavailable: 'Profile temporarily unavailable. Reload to try again.',
  },
  'es-ES': {
    back: 'Jugar al ajedrez',
    days: 'Actividad',
    hidden: 'La actividad es privada.',
    noProfile: 'Perfil no encontrado.',
    unavailable: 'Perfil no disponible temporalmente. Recarga la página para reintentarlo.',
  },
  'fr-FR': {
    back: 'Jouer aux échecs',
    days: 'Activité',
    hidden: 'L’activité est privée.',
    noProfile: 'Profil introuvable.',
    unavailable: 'Profil temporairement indisponible. Rechargez la page pour réessayer.',
  },
};
export const profileCopy = {
  'en-GB': {
    account: 'Account',
    active: 'Days played',
    copied: 'Link copied',
    games: 'Games in the past year',
    inspect: 'Choose a day',
    invitation: 'A seat at the table is waiting.',
    join: 'Your next move',
    less: 'Less',
    matches: 'Completed games',
    more: 'More',
    note: 'Completed games against people and the computer. Every day at the board counts.',
    play: 'Play chess',
    private: 'Only you can see this activity.',
    provisional: 'Provisional',
    public: 'View public profile',
    rated: 'rated games',
    ratings: 'Over the board',
    scroll: 'Scroll to explore the year',
    settings: 'Profile settings',
    share: 'Share profile',
    shareError: 'Copy your profile link below.',
    streak: 'Day streak',
    unavailable: 'Activity could not be loaded.',
    unrated: 'Play rated human games to establish your rating.',
  },
  'es-ES': {
    account: 'Cuenta',
    active: 'Días de juego',
    copied: 'Enlace copiado',
    games: 'Partidas en el último año',
    inspect: 'Elige un día',
    invitation: 'Te espera un sitio en la mesa.',
    join: 'Tu próxima jugada',
    less: 'Menos',
    matches: 'Partidas completadas',
    more: 'Más',
    note: 'Partidas completadas contra personas y el ordenador. Cada día en el tablero cuenta.',
    play: 'Jugar al ajedrez',
    private: 'Solo tú puedes ver esta actividad.',
    provisional: 'Provisional',
    public: 'Ver perfil público',
    rated: 'partidas puntuadas',
    ratings: 'En el tablero',
    scroll: 'Desliza para explorar el año',
    settings: 'Ajustes del perfil',
    share: 'Compartir perfil',
    shareError: 'Copia el enlace de tu perfil.',
    streak: 'Días de racha',
    unavailable: 'No se ha podido cargar la actividad.',
    unrated: 'Juega partidas puntuadas contra personas para obtener tu puntuación.',
  },
  'fr-FR': {
    account: 'Compte',
    active: 'Jours de jeu',
    copied: 'Lien copié',
    games: 'Parties cette année',
    inspect: 'Choisir un jour',
    invitation: 'Une place vous attend à la table.',
    join: 'Votre prochain coup',
    less: 'Moins',
    matches: 'Parties terminées',
    more: 'Plus',
    note: 'Parties terminées contre des joueurs et l’ordinateur. Chaque jour à l’échiquier compte.',
    play: 'Jouer aux échecs',
    private: 'Vous seul pouvez voir cette activité.',
    provisional: 'Provisoire',
    public: 'Voir le profil public',
    rated: 'parties classées',
    ratings: 'Sur l’échiquier',
    scroll: 'Faites défiler pour explorer l’année',
    settings: 'Paramètres du profil',
    share: 'Partager le profil',
    shareError: 'Copiez le lien de votre profil.',
    streak: 'Jours de suite',
    unavailable: 'Impossible de charger l’activité.',
    unrated: 'Jouez des parties classées contre des joueurs pour obtenir votre classement.',
  },
};

export function ShareProfile({ username, language }: { username: string; language: Language }) {
  const copy = profileCopy[language];
  const [result, setResult] = useState<'copied' | 'shareError' | null>(null);
  const url = `${typeof window === 'undefined' ? publicOrigin : window.location.origin}${profilePath(username)}`;
  async function share() {
    setResult(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: `@${username} · Ludus`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setResult('copied');
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setResult('shareError');
      }
    }
  }
  return (
    <div className="profile-share">
      <Button className="profile-button profile-button-primary" onClick={() => void share()}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7" />
        </svg>
        {copy.share}
      </Button>
      {result && <p aria-live="polite">{copy[result]}</p>}
      {result === 'shareError' && (
        <input
          aria-label={copy.share}
          readOnly
          value={url}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
      )}
    </div>
  );
}
export function ActivityGrid({
  activity,
  language,
  privateActivity = false,
}: {
  activity: Activity;
  language: Language;
  privateActivity?: boolean;
}) {
  const copy = profileCopy[language];
  const grid = useRef<HTMLDivElement>(null);
  const today = activity.today ?? new Date().toISOString().slice(0, 10);
  const [selected, setSelected] = useState(today);
  useEffect(() => {
    if (grid.current) {
      grid.current.scrollLeft = grid.current.scrollWidth;
    }
  }, [today]);
  const end = new Date(`${today}T12:00:00Z`);
  const dates = Array.from({ length: 365 }, (_, index) =>
    new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 364 + index))
      .toISOString()
      .slice(0, 10),
  );
  const offset = (new Date(`${dates[0]}T12:00:00Z`).getUTCDay() + 6) % 7;
  const total = dates.reduce((sum, date) => sum + (activity.days[date] ?? 0), 0);
  const active = dates.filter((date) => activity.days[date] > 0).length;
  const monthFormat = new Intl.DateTimeFormat(language, { month: 'short', timeZone: 'UTC' });
  const weekdayFormat = new Intl.DateTimeFormat(language, { timeZone: 'UTC', weekday: 'short' });
  return (
    <section className="profile-activity" aria-label={publicLabels[language].days}>
      <div className="activity-heading">
        <div>
          <strong>{total.toLocaleString(language)}</strong>
          <h2>{copy.games}</h2>
        </div>
        <span>
          {new Date(`${dates[0]}T12:00:00Z`).getUTCFullYear()} / {end.getUTCFullYear()}
        </span>
      </div>
      {privateActivity && <p className="activity-private">{copy.private}</p>}
      <div
        className="activity-scroll"
        ref={grid}
        tabIndex={0}
        role="group"
        aria-label={copy.scroll}
      >
        <div className="activity-calendar">
          <div className="activity-months" aria-hidden="true">
            {dates.map(
              (date, index) =>
                (index === 0 || (date.endsWith('-01') && index > 7)) && (
                  <span key={date} style={{ gridColumn: Math.floor((index + offset) / 7) + 1 }}>
                    {monthFormat.format(new Date(`${date}T12:00:00Z`))}
                  </span>
                ),
            )}
          </div>
          <div className="activity-weekdays" aria-hidden="true">
            {[0, 2, 4].map((day) => (
              <span key={day} style={{ gridRow: day + 1 }}>
                {weekdayFormat.format(new Date(Date.UTC(2026, 0, 5 + day)))}
              </span>
            ))}
          </div>
          <div
            className="activity-cells"
            role="img"
            aria-label={`${copy.games}: ${total}. ${copy.active}: ${active}. ${copy.streak}: ${activity.streak}.`}
          >
            {dates.map((date, index) => {
              const count = activity.days[date] ?? 0;
              return (
                <span
                  key={date}
                  className={`activity-cell activity-level-${Math.min(count, 4)}`}
                  style={{
                    gridColumn: Math.floor((index + offset) / 7) + 1,
                    gridRow: ((index + offset) % 7) + 1,
                  }}
                  title={`${date}: ${count}`}
                />
              );
            })}
          </div>
        </div>
      </div>
      <div className="activity-key">
        <span>{copy.scroll}</span>
        <div>
          {copy.less}
          {[0, 1, 2, 3, 4].map((level) => (
            <span key={level} className={`activity-cell activity-level-${level}`} />
          ))}
          {copy.more}
        </div>
      </div>
      <div className="activity-statistics">
        <div>
          <strong>{activity.streak}</strong>
          <span>{copy.streak}</span>
        </div>
        <div>
          <strong>{active}</strong>
          <span>{copy.active}</span>
        </div>
        <label>
          {copy.inspect}
          <input
            type="date"
            min={dates[0]}
            max={today}
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
            }}
          />
          <span aria-live="polite">
            {copy.matches}: {activity.days[selected] ?? 0}
          </span>
        </label>
      </div>
      <p className="activity-note">{copy.note}</p>
    </section>
  );
}
export function Ratings({ ratings, language }: { ratings: Rating[]; language: Language }) {
  const copy = profileCopy[language];
  return (
    <section className="profile-ratings" aria-label={copy.ratings}>
      <h2>{copy.ratings}</h2>
      <div className="rating-list">
        {['5+3', '10+5'].map((control) => {
          const rating = ratings.find((item) => item.control === control);
          return (
            <div className="rating-item" key={control}>
              <span>{control}</span>
              <strong>{rating?.games ? Math.round(rating.rating) : '—'}</strong>
              <small>
                {rating?.games
                  ? `${rating.games} ${copy.rated}${rating.games < 10 ? ` · ${copy.provisional}` : ''}`
                  : copy.unrated}
              </small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function PublicProfilePage({
  data,
  username,
  language,
  missing = false,
  unavailable = false,
  header,
}: {
  data: PublicPlayerProfile | null;
  username: string;
  language: Language;
  missing?: boolean;
  unavailable?: boolean;
  header: ReactNode;
}) {
  const copy = publicLabels[language];
  const text = profileCopy[language];
  return (
    <div className="site-shell profile-page">
      {header}
      <main className="profile-main">
        <nav className="profile-navigation">
          <Link to="/play">← {copy.back}</Link>
          <Link to="/account">{text.account}</Link>
        </nav>
        <div className="profile-identity">
          <h1>@{data?.username ?? username}</h1>
          {data && <ShareProfile username={data.username} language={language} />}
        </div>
        {missing ? (
          <p role="alert">{copy.noProfile}</p>
        ) : unavailable ? (
          <p role="alert">{copy.unavailable}</p>
        ) : data ? (
          <>
            {data.activity ? (
              <ActivityGrid activity={data.activity} language={language} />
            ) : (
              <section className="profile-activity profile-hidden">
                <h2>{copy.hidden}</h2>
              </section>
            )}
            <Ratings ratings={data.ratings} language={language} />
            <section className="profile-invitation">
              <div>
                <p className="profile-eyebrow">{text.join}</p>
                <h2>{text.invitation}</h2>
              </div>
              <Link className="profile-button profile-button-primary" to="/play">
                {text.play} ↗
              </Link>
            </section>
          </>
        ) : (
          <p aria-busy="true">…</p>
        )}
      </main>
    </div>
  );
}
