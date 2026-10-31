import type { Language } from './waitlist';

export const publicOrigin = 'https://ludus.mrlemoos.dev';
export const profilePath = (username: string) => `/@${encodeURIComponent(username.toLowerCase())}`;
export const profileUrl = (username: string) => `${publicOrigin}${profilePath(username)}`;
export const validPublicUsername = (username: string) => /^[a-zA-Z0-9_]{3,24}$/.test(username);

export function profileMetadata(username: string, language: Language = 'en-GB') {
  const copy = {
    'en-GB': { title: `@${username} · Chess profile | Ludus`, description: `View @${username}'s chess profile on Ludus, with 5+3 and 10+5 ratings. Play online chess in a Madrid-inspired café.` },
    'es-ES': { title: `@${username} · Perfil de ajedrez | Ludus`, description: `Consulta el perfil de ajedrez de @${username} en Ludus, con puntuaciones de 5+3 y 10+5. Juega al ajedrez en un café inspirado en Madrid.` },
    'fr-FR': { title: `@${username} · Profil d’échecs | Ludus`, description: `Consultez le profil d’échecs de @${username} sur Ludus, avec ses classements en 5+3 et 10+5. Jouez dans un café inspiré de Madrid.` },
  };
  return { ...copy[language], canonical: profileUrl(username) };
}

export const profileStructuredData = (username: string) => ({
  '@context': 'https://schema.org', '@type': 'ProfilePage', url: profileUrl(username),
  mainEntity: { '@type': 'Person', name: `@${username}`, identifier: username, url: profileUrl(username) },
});
