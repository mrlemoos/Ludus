import { profileMetadata, profileStructuredData } from '../shared/profile-seo';
import type { InitialPublicProfile } from '../shared/public-profile';
import type { Language } from '../shared/waitlist';
import { useEffect } from 'react';

export function readInitialPublicProfile(username: string): InitialPublicProfile | null {
  const text = document.getElementById('public-profile-data')?.textContent;
  if (!text) return null;
  try {
    const data = JSON.parse(text) as InitialPublicProfile;
    return typeof data.username === 'string' &&
      data.username.toLowerCase() === username.toLowerCase()
      ? data
      : null;
  } catch {
    return null;
  }
}

export function usePublicProfileMetadata(username: string, language: Language, missing: boolean) {
  useEffect(() => {
    const metadata = profileMetadata(username, language);
    document.title = missing ? 'Profile not found | Ludus' : metadata.title;
    const description = document.querySelector('meta[name="description"]');
    const previousDescription = description?.getAttribute('content');
    description?.setAttribute('content', metadata.description);
    const managed: HTMLElement[] = [];
    function meta(attribute: 'name' | 'property', key: string, content: string) {
      const element =
        document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`) ??
        document.createElement('meta');
      element.setAttribute(attribute, key);
      element.setAttribute('content', content);
      document.head.appendChild(element);
      managed.push(element);
    }
    meta('name', 'robots', missing ? 'noindex, follow' : 'index, follow');
    meta('property', 'og:type', 'profile');
    meta('property', 'og:site_name', 'Ludus');
    meta('property', 'og:title', metadata.title);
    meta('property', 'og:description', metadata.description);
    meta('property', 'og:url', metadata.canonical);
    meta('name', 'twitter:card', 'summary');
    meta('name', 'twitter:title', metadata.title);
    meta('name', 'twitter:description', metadata.description);
    const canonical =
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]') ??
      document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    canonical.setAttribute('href', metadata.canonical);
    document.head.appendChild(canonical);
    managed.push(canonical);
    const structured =
      document.getElementById('profile-structured-data') ?? document.createElement('script');
    structured.id = 'profile-structured-data';
    structured.setAttribute('type', 'application/ld+json');
    structured.textContent = JSON.stringify(profileStructuredData(username));
    if (!missing) {
      document.head.appendChild(structured);
      managed.push(structured);
    } else structured.remove();
    return () => {
      for (const element of managed) element.remove();
      if (previousDescription !== null && previousDescription !== undefined)
        description?.setAttribute('content', previousDescription);
      document.getElementById('profile-structured-data')?.remove();
    };
  }, [username, language, missing]);
}
