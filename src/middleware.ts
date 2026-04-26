import { defineMiddleware } from 'astro:middleware';

const ADMIN_BUILD = import.meta.env.ADMIN_BUILD === true;
const PUBLIC_SITE_ORIGIN = 'https://bears-space.de';

// On the admin deploy (admin.bears-space.de) we only expose the dashboard at
// `/` and the Keystatic CMS under `/keystatic`. Anything else gets bounced to
// the public site so editors who land here on a stale link aren't stuck on a
// 404. Asset paths (`/_astro`, `/_image`, `/favicon*`) must pass through so
// the dashboard and CMS can load their resources. `/api/keystatic/*` covers
// the OAuth + App-creation callbacks Keystatic registers internally — the
// setup wizard's post-App-creation redirect lands at
// `/api/keystatic/github/created-app`, so that path can't be bounced.
function isAdminAllowedPath(pathname: string): boolean {
  if (pathname === '/') return true;
  if (pathname.startsWith('/keystatic')) return true;
  if (pathname.startsWith('/api/keystatic')) return true;
  if (pathname.startsWith('/_')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (/\.[a-z0-9]+$/i.test(pathname)) return true;
  return false;
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (ADMIN_BUILD) {
    const { pathname, search } = context.url;

    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      return context.redirect('/', 301);
    }

    if (!isAdminAllowedPath(pathname)) {
      return Response.redirect(`${PUBLIC_SITE_ORIGIN}${pathname}${search}`, 301);
    }
  }

  const response = await next();

  if (
    !context.url.pathname.startsWith('/keystatic') ||
    !response.headers.get('content-type')?.includes('text/html')
  ) {
    return response;
  }

  const html = await response.text();
  if (html.includes('<title>')) return new Response(html, response);

  const withTitle = html.replace(
    '<!DOCTYPE html>',
    '<!DOCTYPE html><title>CMS | BEARS</title>',
  );

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(withTitle, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
