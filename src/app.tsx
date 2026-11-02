import './home.css';
import { isLanguage, languages, parseWaitlist } from '../shared/waitlist';
import { Button } from './components/button';
import { Wordmark } from './components/wordmark';
import { gameCopy } from './game-copy';
import { HomePreview } from './home-preview';
import { languageNames } from './i18n';
import { Input } from '@base-ui/react/input';
import { Select } from '@base-ui/react/select';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';

function Arrow() {
  return (
    <svg
      className="action-arrow"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function Header({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    if (!/^\/(?:@|%40|players\/)/i.test(pathname)) {
      document.title = t('pageTitle');
      document.querySelector('meta[name="description"]')?.setAttribute('content', t('description'));
    }
    try {
      localStorage.setItem('ludus-language', i18n.language);
    } catch {
      /* Language still works without storage. */
    }
  }, [i18n.language, t, pathname]);
  return (
    <header className="site-header">
      <Wordmark />
      <div className="flex items-center gap-4 sm:gap-7">
        {!compact && (
          <Link
            to="/play"
            className="header-play"
            aria-label={gameCopy[isLanguage(i18n.language) ? i18n.language : 'en-GB'].play}
          >
            <span className="hidden sm:inline">
              {gameCopy[isLanguage(i18n.language) ? i18n.language : 'en-GB'].play}
            </span>
            <span aria-hidden="true" className="text-xl sm:hidden">
              ♞
            </span>
          </Link>
        )}
        {!compact && (
          <span className="hidden text-xs tracking-wide text-muted sm:block">{t('location')}</span>
        )}
        <Select.Root
          value={i18n.language}
          items={languageNames}
          onValueChange={(value) => {
            if (isLanguage(value)) {
              void i18n.changeLanguage(value);
            }
          }}
        >
          <Select.Trigger
            aria-label={t('language')}
            className="language-trigger"
            render={<Button />}
          >
            <Select.Value />
            <Select.Icon aria-hidden="true">⌄</Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner sideOffset={8}>
              <Select.Popup className="z-50 min-w-36 rounded-xl border border-ink/15 bg-paper p-1 shadow-lg">
                <Select.List>
                  {languages.map((language) => (
                    <Select.Item
                      key={language}
                      value={language}
                      className="flex min-h-11 cursor-default items-center rounded-lg px-4 text-sm outline-none data-highlighted:bg-ink/10"
                    >
                      <Select.ItemText>{languageNames[language]}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.List>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </div>
    </header>
  );
}

export function App() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<'invalid' | 'limited' | 'unavailable' | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'pending') {
      return;
    }
    setError(null);
    const entry = parseWaitlist({ email, language: i18n.language });
    if (!entry) {
      setError('invalid');
      return;
    }
    setState('pending');
    try {
      const response = await fetch('/api/waitlist', {
        body: JSON.stringify(entry),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        setError(
          response.status === 429 ? 'limited' : response.status === 400 ? 'invalid' : 'unavailable',
        );
        setState('idle');
        return;
      }
      const result: unknown = await response.json();
      if (
        typeof result !== 'object' ||
        result === null ||
        !('ok' in result) ||
        result.ok !== true
      ) {
        throw new Error('Invalid response');
      }
      setState('success');
    } catch {
      setError('unavailable');
      setState('idle');
    }
  }

  return (
    <div className="home-page">
      <div className="site-shell home-container">
        <a className="skip-link" href="#main">
          {t('skip')}
        </a>
        <Header />
        <main id="main">
          <section className="home-hero">
            <div className="home-copy">
              <p className="home-eyebrow">{t('beta')}</p>
              <h1 className="home-headline">
                {t('headline')}
                <br />
                <em>{t('headlineItalic')}</em>
              </h1>
            </div>
            <div className="home-invitation">
              <p className="home-intro">{t('detail')}</p>
              <div className="waitlist-block" id="waitlist">
                {state === 'success' ? (
                  <div role="status" className="home-success">
                    <p className="font-display text-3xl">{t('successTitle')}</p>
                    <p className="mt-3 text-sm leading-6 text-muted">{t('success')}</p>
                  </div>
                ) : (
                  <form
                    onSubmit={submit}
                    aria-label={t('waitlist')}
                    aria-busy={state === 'pending'}
                    noValidate
                  >
                    <label htmlFor="email" className="mb-3 block text-xs font-semibold">
                      {t('email')}
                    </label>
                    <div className="flex flex-col gap-2 min-[430px]:flex-row">
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={254}
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          setError(null);
                        }}
                        placeholder={t('placeholder')}
                        aria-invalid={error === 'invalid'}
                        aria-describedby={
                          error
                            ? 'form-error invitation-language email-use'
                            : 'invitation-language email-use'
                        }
                        className="game-input min-h-14 min-w-0 flex-1 placeholder:text-muted/70 aria-invalid:border-red-800"
                      />
                      <Button
                        type="submit"
                        disabled={state === 'pending'}
                        className="game-primary flex min-h-14 items-center justify-center gap-5"
                      >
                        {t(state === 'pending' ? 'pending' : 'submit')}
                        <Arrow />
                      </Button>
                    </div>
                    {error && (
                      <p id="form-error" role="alert" className="home-error">
                        {t(error)}
                      </p>
                    )}
                    <p id="invitation-language" className="mt-3 text-xs leading-5 text-muted">
                      {t('preference', {
                        language:
                          languageNames[isLanguage(i18n.language) ? i18n.language : 'en-GB'],
                      })}
                    </p>
                    <p id="email-use" className="mt-1 text-xs leading-5 text-muted">
                      {t('privacy')}
                    </p>
                  </form>
                )}
                <p className="home-trial">{t('trial')}</p>
              </div>
            </div>
          </section>
          <HomePreview />
          <section className="home-details" aria-labelledby="details-heading">
            <div className="home-details-heading">
              <p className="home-eyebrow">{t('included')}</p>
              <h2 id="details-heading">{t('intro')}</h2>
              <p>{t('play')}</p>
            </div>
            <div className="home-details-copy">
              <article>
                <h3>{t('opponentsTitle')}</h3>
                <p>{t('opponents')}</p>
              </article>
              <article>
                <h3>{t('coachTitle')}</h3>
                <p>{t('coach')}</p>
              </article>
            </div>
          </section>
        </main>
        <footer className="home-footer">
          <Wordmark />
          <p>{t('note')}</p>
          <p>{t('soon')}</p>
          <p>
            <Link to="/terms">
              {isLanguage(i18n.language)
                ? { 'en-GB': 'Terms', 'es-ES': 'Condiciones', 'fr-FR': 'Conditions' }[i18n.language]
                : 'Terms'}
            </Link>{' '}
            ·{' '}
            <Link to="/privacy">
              {isLanguage(i18n.language)
                ? { 'en-GB': 'Privacy', 'es-ES': 'Privacidad', 'fr-FR': 'Confidentialité' }[
                    i18n.language
                  ]
                : 'Privacy'}
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}

export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="site-shell">
      <Header />
      <main className="py-24">
        <h1 className="font-display text-6xl">{t('notFound')}</h1>
        <Link className="mt-8 inline-block underline" to="/">
          {t('home')}
        </Link>
      </main>
    </div>
  );
}
