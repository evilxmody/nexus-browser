export type SearchEngineId = 'duckduckgo' | 'google' | 'bing' | 'brave';

export const SEARCH_ENGINES: Record<SearchEngineId, { label: string; template: string }> = {
  duckduckgo: { label: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s' },
  google: { label: 'Google', template: 'https://www.google.com/search?q=%s' },
  bing: { label: 'Bing', template: 'https://www.bing.com/search?q=%s' },
  brave: { label: 'Brave Search', template: 'https://search.brave.com/search?q=%s' },
};

export function isSearchEngineId(v: unknown): v is SearchEngineId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(SEARCH_ENGINES, v);
}

/** Internal address of the built-in new tab page. Never sent to the network. */
export const NEWTAB_URL = 'nexus://newtab';

export type ResolveResult =
  | { ok: true; url: string; kind: 'url' | 'search' }
  | { ok: false; error: string };

const MAX_INPUT = 2048;
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const HOST_PORT = /^[^\s/:@]+:\d{1,5}(?:[/?#]|$)/;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const DOMAIN = /^(?:[\p{L}\p{N}-]+\.)+\p{L}{2,}$/u;

function parseHttp(candidate: string): ResolveResult {
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return { ok: false, error: 'That address is not valid.' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https addresses are supported.' };
  }
  if (u.username || u.password) {
    return { ok: false, error: 'Addresses containing a username or password are blocked.' };
  }
  if (!u.hostname) return { ok: false, error: 'That address is not valid.' };
  return { ok: true, url: u.href, kind: 'url' };
}

function hostPart(input: string): string {
  return (input.split(/[/?#]/)[0] ?? '').replace(/:\d{1,5}$/, '');
}
const isLocalHost = (h: string) => h.toLowerCase() === 'localhost' || IPV4.test(h);

/** Loopback hosts are "potentially trustworthy" to browsers, so http:// is not mixed content there. */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

/** https:// twin of an http:// URL, or null when the URL is not plain http. Never changes anything else. */
export function upgradeToHttps(url: string): string | null {
  const r = parseHttp(url);
  if (!r.ok) return null;
  const u = new URL(r.url);
  if (u.protocol !== 'http:') return null;
  u.protocol = 'https:';
  return u.href;
}
const looksLikeHost = (h: string) => isLocalHost(h) || DOMAIN.test(h);

/**
 * Turns whatever the person typed into a safe navigation target.
 * Only http(s) is ever returned; credentials in the URL are rejected
 * (they are a common spoofing trick, e.g. http://google.com@evil.example).
 */
export function resolveInput(raw: string, engine: SearchEngineId = 'duckduckgo'): ResolveResult {
  const input = raw.trim();
  if (!input) return { ok: false, error: 'Enter a web address or search term.' };
  if (input.length > MAX_INPUT) return { ok: false, error: 'That address is too long.' };
  if (/[\u0000-\u001f\u007f]/.test(input)) return { ok: false, error: 'Address contains invalid characters.' };

  if (SCHEME.test(input) && !HOST_PORT.test(input)) return parseHttp(input);

  const host = hostPart(input);
  if (!/\s/.test(input) && looksLikeHost(host)) {
    return parseHttp(`${isLocalHost(host) ? 'http' : 'https'}://${input}`);
  }
  return {
    ok: true,
    kind: 'search',
    url: SEARCH_ENGINES[engine].template.replace('%s', encodeURIComponent(input)),
  };
}

/** True for the internal new tab page or a credential-free http(s) URL. */
export function isNavigableUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  if (url === NEWTAB_URL) return true;
  return parseHttp(url).ok;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isSecureUrl(url: string): boolean {
  return url.startsWith('https://');
}

/** Short human readable form for the address bar. Keeps http:// visible as a warning. */
export function displayUrl(url: string): string {
  if (url === NEWTAB_URL) return '';
  try {
    const u = new URL(url);
    const rest = (u.pathname === '/' ? '' : u.pathname) + u.search + u.hash;
    return (u.protocol === 'http:' ? 'http://' : '') + u.host + rest;
  } catch {
    return url;
  }
}
