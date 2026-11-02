import {
  profileMetadata,
  profilePath,
  profileStructuredData,
  profileUrl,
  publicOrigin,
  validPublicUsername,
} from '../shared/profile-seo';
import type { InitialPublicProfile, PublicPlayerProfile } from '../shared/public-profile';
import { Wordmark } from '../src/components/wordmark';
import { PublicProfilePage, publicLabels } from '../src/profile-view';
import { readPublicProfile } from './accounts';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { Link, StaticRouter } from 'react-router';

export const sitemapPageSize = 1000;
const publicProfiles =
  'FROM player_profiles p WHERE NOT EXISTS(SELECT 1 FROM account_deletions d WHERE d.user_id=p.user_id)';
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
export const serialisePublicProfile = (value: InitialPublicProfile) =>
  JSON.stringify(value).replace(/</g, '\\u003c');
const responseHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const xml = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    headers: { ...responseHeaders, 'Content-Type': 'application/xml; charset=utf-8' },
  });
const notFound = () =>
  new Response('Not found', {
    status: 404,
    headers: { ...responseHeaders, 'X-Robots-Tag': 'noindex' },
  });

export async function profileSitemap(db: D1Database, path: string): Promise<Response> {
  if (path === '/sitemap.xml') {
    const row = await db
      .prepare(`SELECT COUNT(*) AS count ${publicProfiles}`)
      .first<{ count: number }>();
    const pages = Math.ceil((row?.count ?? 0) / sitemapPageSize);
    if (pages > 49_999) throw new Error('sitemap_index_limit');
    const urls = [
      '/sitemaps/pages.xml',
      ...Array.from({ length: pages }, (_, index) => `/sitemaps/profiles-${index + 1}.xml`),
    ];
    return xml(
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<sitemap><loc>${publicOrigin}${url}</loc></sitemap>`).join('')}</sitemapindex>`,
    );
  }
  if (path === '/sitemaps/pages.xml')
    return xml(
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${publicOrigin}/</loc></url></urlset>`,
    );
  const page = /^\/sitemaps\/profiles-([1-9]\d*)\.xml$/.exec(path);
  const offset = page ? (Number(page[1]) - 1) * sitemapPageSize : -1;
  if (!Number.isSafeInteger(offset) || offset < 0) return notFound();
  const rows = await db
    .prepare(
      `SELECT p.username ${publicProfiles} ORDER BY p.username COLLATE NOCASE LIMIT ? OFFSET ?`,
    )
    .bind(sitemapPageSize, offset)
    .all<{ username: string }>();
  if (!rows.results.length) return notFound();
  return xml(
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.results
      .filter((row) => validPublicUsername(row.username))
      .map((row) => `<url><loc>${escapeHtml(profileUrl(row.username))}</loc></url>`)
      .join('')}</urlset>`,
  );
}

async function profileDocument(
  request: Request,
  env: Env,
  username: string,
  data: PublicPlayerProfile | null,
): Promise<Response> {
  const asset = await env.ASSETS.fetch(new Request(new URL('/', request.url)));
  if (!asset.ok) throw new Error('profile_template_unavailable');
  const metadata = profileMetadata(data?.username ?? username);
  const title = data ? metadata.title : 'Profile not found | Ludus';
  const robots = data ? 'index, follow' : 'noindex, follow';
  const structured = data
    ? `<script type="application/ld+json" id="profile-structured-data">${JSON.stringify(profileStructuredData(data.username)).replace(/</g, '\\u003c')}</script>`
    : '';
  const extraHead = `<link rel="canonical" href="${escapeHtml(metadata.canonical)}"><meta name="robots" content="${robots}"><meta property="og:type" content="profile"><meta property="og:site_name" content="Ludus"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(metadata.description)}"><meta property="og:url" content="${escapeHtml(metadata.canonical)}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(metadata.description)}">${structured}`;
  const content = renderToStaticMarkup(
    <StaticRouter location={profilePath(username)}>
      <PublicProfilePage
        username={username}
        data={data}
        missing={!data}
        language="en-GB"
        header={
          <header className="site-header">
            <Wordmark />
            <Link to="/play" className="header-play">
              {publicLabels['en-GB'].back}
            </Link>
          </header>
        }
      />
    </StaticRouter>,
  );
  const initial: InitialPublicProfile = { username, data, missing: !data };
  const headers = new Headers(asset.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.delete('Content-Length');
  headers.delete('ETag');
  headers.delete('Last-Modified');
  if (!data) headers.set('X-Robots-Tag', 'noindex');
  return new HTMLRewriter()
    .on('title', {
      element: (element) => {
        element.setInnerContent(title);
      },
    })
    .on('meta[name="description"]', {
      element: (element) => {
        element.setAttribute('content', metadata.description);
      },
    })
    .on('head', {
      element: (element) => {
        element.append(extraHead, { html: true });
      },
    })
    .on('#root', {
      element: (element) => {
        element.setInnerContent(content, { html: true });
      },
    })
    .on('body', {
      element: (element) => {
        element.append(
          `<script type="application/json" id="public-profile-data">${serialisePublicProfile(initial)}</script>`,
          { html: true },
        );
      },
    })
    .transform(new Response(asset.body, { status: data ? 200 : 404, headers }));
}

export async function publicProfileSeo(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return notFound();
  }
  const profile = /^\/(?:@|players\/)([^/]+)\/?$/.exec(path);
  const sitemap = path === '/sitemap.xml' || path.startsWith('/sitemaps/');
  if (!profile && !sitemap && path !== '/robots.txt') return null;
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response(null, { status: 405, headers: { ...responseHeaders, Allow: 'GET, HEAD' } });
  try {
    let response: Response;
    if (path === '/robots.txt') {
      response = new Response(
        `User-agent: *\nAllow: /\nAllow: /api/profiles/\nDisallow: /api/\nDisallow: /account\nDisallow: /operator\nDisallow: /coach/\nDisallow: /online\nDisallow: /play$\nSitemap: ${publicOrigin}/sitemap.xml\n`,
        { headers: { ...responseHeaders, 'Content-Type': 'text/plain; charset=utf-8' } },
      );
    } else if (sitemap) response = await profileSitemap(env.DB, path);
    else {
      const username = profile![1];
      if (!validPublicUsername(username)) return notFound();
      const data = await readPublicProfile(env.DB, username);
      if (data && path !== profilePath(data.username)) {
        response = new Response(null, {
          status: 301,
          headers: { ...responseHeaders, Location: profilePath(data.username) },
        });
      } else response = await profileDocument(request, env, username, data);
    }
    return request.method === 'HEAD'
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  } catch {
    console.error({ event: 'public_profile_seo_unavailable' });
    return new Response(
      request.method === 'HEAD' ? null : 'Profile temporarily unavailable. Please try again.',
      { status: 503, headers: { ...responseHeaders, 'Retry-After': '60' } },
    );
  }
}
