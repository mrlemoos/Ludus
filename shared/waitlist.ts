export const languages = ['en-GB', 'es-ES', 'fr-FR'] as const;
export type Language = (typeof languages)[number];

export function isLanguage(value: unknown): value is Language {
  return languages.some((language) => language === value);
}

export function parseWaitlist(value: unknown): { email: string; language: Language } | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('email' in value) ||
    !('language' in value)
  ) {
    return null;
  }
  if (typeof value.email !== 'string' || !isLanguage(value.language)) {
    return null;
  }
  const email = value.email.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(
      email,
    )
  ) {
    return null;
  }
  const [local, domain] = email.split('@');
  if (
    local.length > 64 ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..') ||
    domain.split('.').some((label) => label.length > 63)
  ) {
    return null;
  }
  return { email, language: value.language };
}
