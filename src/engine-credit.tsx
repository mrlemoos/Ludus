import { isLanguage } from '../shared/waitlist';
import { useTranslation } from 'react-i18next';

const copy = {
  'en-GB': {
    credit: 'Computer moves powered by',
    engine: 'Stockfish',
    licence: 'GPLv3 licence',
    source: 'source',
  },
  'es-ES': {
    credit: 'Los movimientos del ordenador usan',
    engine: 'Stockfish',
    licence: 'licencia GPLv3',
    source: 'código fuente',
  },
  'fr-FR': {
    credit: 'Les coups de l’ordinateur utilisent',
    engine: 'Stockfish',
    licence: 'licence GPLv3',
    source: 'code source',
  },
} as const;

export function EngineCredit() {
  const { i18n } = useTranslation();
  const language = isLanguage(i18n.language) ? i18n.language : 'en-GB';
  const text = copy[language];
  return (
    <p className="engine-credit text-xs leading-5 text-muted">
      {text.credit}{' '}
      <a className="underline" href="/engine/Copying.txt" target="_blank" rel="license noopener">
        {text.engine}
      </a>{' '}
      (
      <a className="underline" href="/engine/Copying.txt" target="_blank" rel="license noopener">
        {text.licence}
      </a>
      ,{' '}
      <a className="underline" href="/engine/SOURCE.txt" target="_blank" rel="noopener">
        {text.source}
      </a>
      ).
    </p>
  );
}
