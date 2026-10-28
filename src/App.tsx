import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@base-ui/react/select';
import { Button } from '@base-ui/react/button';
import { Input } from '@base-ui/react/input';
import { Link } from 'react-router';
import { isLanguage, languages, parseWaitlist } from '../shared/waitlist';
import { languageNames } from './i18n';
import { ChessScene } from './ChessScene';
import { gameCopy } from './game-copy';

function Arrow() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

export function Header() {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = t('pageTitle');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('description'));
    try { localStorage.setItem('ludus-language', i18n.language); } catch { /* Language still works without storage. */ }
  }, [i18n.language, t]);
  return <header className="site-header">
    <Link to="/" className="wordmark" aria-label="Ludus">ludus<span aria-hidden="true">.</span></Link>
    <div className="flex items-center gap-4 sm:gap-7">
      <Link to="/play" className="header-play" aria-label={gameCopy[isLanguage(i18n.language) ? i18n.language : 'en-GB'].play}><span className="hidden sm:inline">{gameCopy[isLanguage(i18n.language) ? i18n.language : 'en-GB'].play}</span><span aria-hidden="true" className="text-xl sm:hidden">♞</span></Link>
      <span className="hidden text-xs tracking-wide text-muted sm:block">{t('location')}</span>
      <Select.Root value={i18n.language} items={languageNames} onValueChange={(value) => { if (isLanguage(value)) void i18n.changeLanguage(value); }}>
        <Select.Trigger aria-label={t('language')} className="language-trigger">
          <Select.Value /><Select.Icon aria-hidden="true">⌄</Select.Icon>
        </Select.Trigger>
        <Select.Portal><Select.Positioner sideOffset={8}><Select.Popup className="z-50 min-w-36 rounded-xl border border-ink/15 bg-paper p-1 shadow-lg">
          <Select.List>{languages.map((language) => <Select.Item key={language} value={language} className="flex min-h-11 cursor-default items-center rounded-lg px-4 text-sm outline-none data-highlighted:bg-ink/10">
            <Select.ItemText>{languageNames[language]}</Select.ItemText>
          </Select.Item>)}</Select.List>
        </Select.Popup></Select.Positioner></Select.Portal>
      </Select.Root>
    </div>
  </header>;
}

export function App() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<'invalid' | 'limited' | 'unavailable' | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'pending') return;
    setError(null);
    const entry = parseWaitlist({ email, language: i18n.language });
    if (!entry) { setError('invalid'); return; }
    setState('pending');
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        setError(response.status === 429 ? 'limited' : response.status === 400 ? 'invalid' : 'unavailable');
        setState('idle');
        return;
      }
      const result: unknown = await response.json();
      if (typeof result !== 'object' || result === null || !('ok' in result) || result.ok !== true) throw new Error('Invalid response');
      setState('success');
    } catch {
      setError('unavailable');
      setState('idle');
    }
  }

  return <div className="site-shell">
    <a className="skip-link" href="#main">{t('skip')}</a>
    <Header />
    <main id="main">
      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow flex items-center gap-3"><span className="size-1.5 rounded-full bg-olive" />{t('beta')}</p>
          <h1 className="headline">{t('headline')}<br /><em>{t('headlineItalic')}</em></h1>
          <p className="intro">{t('intro')}</p>
          <p className="mt-4 max-w-108 text-sm leading-7 text-muted">{t('detail')}</p>
          <div className="waitlist-block">
            {state === 'success' ? <div role="status" className="rounded-2xl border border-olive/30 bg-olive/5 p-6">
              <p className="font-display text-3xl">{t('successTitle')}</p>
              <p className="mt-3 text-sm leading-6 text-muted">{t('success')}</p>
            </div> : <form onSubmit={submit} aria-label={t('waitlist')} aria-busy={state === 'pending'} noValidate>
              <label htmlFor="email" className="mb-3 block text-xs font-semibold">{t('email')}</label>
              <div className="flex flex-col gap-2 min-[430px]:flex-row">
                <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} value={email}
                  onChange={(event) => { setEmail(event.target.value); setError(null); }} placeholder={t('placeholder')}
                  aria-invalid={error === 'invalid'} aria-describedby={error ? 'form-error invitation-language email-use' : 'invitation-language email-use'}
                  className="game-input min-h-14 min-w-0 flex-1 placeholder:text-muted/70 aria-invalid:border-red-800" />
                <Button type="submit" disabled={state === 'pending'} className="game-primary flex min-h-14 items-center justify-center gap-5">
                  {t(state === 'pending' ? 'pending' : 'submit')}<Arrow />
                </Button>
              </div>
              {error && <p id="form-error" role="alert" className="mt-3 text-sm text-red-800">{t(error)}</p>}
              <p id="invitation-language" className="mt-3 text-xs leading-5 text-muted">{t('preference', { language: languageNames[isLanguage(i18n.language) ? i18n.language : 'en-GB'] })}</p>
              <p id="email-use" className="mt-1 text-xs leading-5 text-muted">{t('privacy')}</p>
            </form>}
            <p className="mt-4 text-xs leading-5 text-muted">{t('note')}</p>
          </div>
        </div>
        <figure className="hero-figure">
          <ChessScene />
          <figcaption className="flex items-start justify-between gap-5 pt-5">
            <div><p className="font-display text-2xl">{t('boardCaption')}</p><p className="mt-1 text-xs text-muted">{t('boardSub')}</p></div>
            <span className="pt-1 text-lg text-olive" aria-hidden="true">↗</span>
          </figcaption>
        </figure>
      </section>
      <section aria-label="Ludus" className="grid gap-9 border-y border-ink/15 py-10 md:grid-cols-3 md:gap-10 md:py-12">
        {(['play', 'opponents', 'coach'] as const).map((feature) => <article key={feature}>
          <h2 className="font-display text-[1.8rem] leading-tight">{t(`${feature}Title`)}</h2>
          <p className="mt-3 max-w-90 text-sm leading-7 text-muted">{t(feature)}</p>
        </article>)}
      </section>
      <p className="py-7 text-center text-xs leading-6 text-muted">{t('trial')}</p>
    </main>
    <footer className="flex flex-col justify-between gap-2 pb-7 pt-3 text-[11px] text-muted sm:flex-row"><p>{t('footer')}</p><p>{t('soon')}</p></footer>
  </div>;
}

export function NotFound() {
  const { t } = useTranslation();
  return <div className="site-shell"><Header /><main className="py-24"><h1 className="font-display text-6xl">{t('notFound')}</h1><Link className="mt-8 inline-block underline" to="/">{t('home')}</Link></main></div>;
}
