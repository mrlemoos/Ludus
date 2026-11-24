import { isLanguage } from '../shared/waitlist';

export interface Messages {
  'Join the waitlist': {
    'es-ES': string;
    'fr-FR': string;
  };
}

const messages = {
  'Join the waitlist': {
    'es-ES': 'Apuntarme a la lista',
    'fr-FR': 'Rejoindre la liste d’attente',
  },
} as const satisfies Messages;

export type BritishEnglish = keyof Messages;

export interface Translate {
  (text: BritishEnglish): string;
}

export function translator(language: string): Translate {
  const selected = isLanguage(language) ? language : 'en-GB';
  return function t(text) {
    if (selected === 'en-GB') {
      return text;
    }
    return messages[text][selected];
  };
}
