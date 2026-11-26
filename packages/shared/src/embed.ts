import { isLoopbackHost } from './url';

/**
 * Embedding policy for the in-app page view.
 *
 * Facts this module is built around (and never pretends otherwise):
 *  - Websites decide whether they may be shown in a frame (X-Frame-Options / CSP frame-ancestors).
 *    A page in another origin cannot read those headers, so NEXUS cannot know in advance and cannot
 *    reliably detect afterwards that a frame was refused. The iframe `load` event also fires for the
 *    browser's "refused to connect" page, so it proves nothing.
 *  - NEXUS does not proxy or rewrite sites to get around those rules.
 * So embedding is opt-in per site (allowlist), and every embedded view keeps an "open in your browser" fallback.
 */

/** Minimal sandbox. Deliberately absent: top-navigation, modals, downloads, presentation, pointer-lock, orientation-lock. */
export const EMBED_SANDBOX_FLAGS = ['allow-scripts', 'allow-same-origin', 'allow-forms', 'allow-popups'] as const;
export const EMBED_SANDBOX = EMBED_SANDBOX_FLAGS.join(' ');
/** Sandbox flags that must never be granted to external content. Used by tests to guard against regressions. */
export const FORBIDDEN_SANDBOX_FLAGS = [
  'allow-top-navigation', 'allow-top-navigation-by-user-activation', 'allow-top-navigation-to-custom-protocols',
  'allow-modals', 'allow-downloads', 'allow-presentation', 'allow-pointer-lock', 'allow-orientation-lock',
  'allow-popups-to-escape-sandbox', 'allow-storage-access-by-user-activation',
] as const;
/** Permissions-Policy for the frame: empty = no camera, microphone, geolocation, etc. */
export const EMBED_PERMISSIONS_POLICY = '';
export const EMBED_REFERRER_POLICY = 'strict-origin-when-cross-origin';

/** NEXUS ships with no external site pre-approved: none could be verified, and none is promised. */
export const DEFAULT_EMBED_ALLOWLIST: readonly string[] = [];
export const MAX_ALLOW_ENTRIES = 100;

/** Sites that widely forbid framing of their main pages. Only used to explain, never to promise. */
export const KNOWN_BLOCKED: ReadonlyArray<{ host: string; label: string }> = [
  { host: 'google.com', label: 'Google' },
  { host: 'bing.com', label: 'Bing' },
  { host: 'duckduckgo.com', label: 'DuckDuckGo' },
  { host: 'search.brave.com', label: 'Brave Search' },
  { host: 'facebook.com', label: 'Facebook' },
  { host: 'instagram.com', label: 'Instagram' },
  { host: 'x.com', label: 'X' },
  { host: 'twitter.com', label: 'X' },
  { host: 'linkedin.com', label: 'LinkedIn' },
  { host: 'github.com', label: 'GitHub' },
  { host: 'paypal.com', label: 'PayPal' },
  { host: 'amazon.com', label: 'Amazon' },
];

export type AllowEntryResult = { ok: true; entry: string } | { ok: false; error: string };

const defaultPort = (u: URL) => u.port || (u.protocol === 'https:' ? '443' : '80');
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/**
 * Normalises something a person typed into an allowlist entry: `host` or `host:port`.
 * An entry matches that host and its subdomains. Wildcards, bare TLDs, credentials and other schemes are refused.
 */
export function normalizeAllowEntry(raw: unknown): AllowEntryResult {
  if (typeof raw !== 'string') return { ok: false, error: 'Enter a site such as example.com.' };
  let v = raw.trim().toLowerCase();
  if (!v) return { ok: false, error: 'Enter a site such as example.com.' };
  if (v.length > 260 || /[\s\u0000-\u001f\u007f]/.test(v)) return { ok: false, error: 'That is not a valid site name.' };
  if (/^https?:\/\//.test(v)) v = v.replace(/^https?:\/\//, '');
  else if (/^[a-z][a-z0-9+.-]*:(?!\d{1,5}(?:[/?#]|$))/.test(v)) return { ok: false, error: 'Only http and https sites can be added.' };
  v = v.replace(/^\*\./, '');
  const body = v.split(/[/?#]/)[0] ?? '';
  if (!body || body.includes('@')) return { ok: false, error: 'Site names cannot contain a username or password.' };
  if (body.includes('*')) return { ok: false, error: 'Wildcards are not supported. A site also covers its subdomains.' };
  let u: URL;
  try { u = new URL(`https://${body}`); } catch { return { ok: false, error: 'That is not a valid site name.' }; }
  const rawHost = body.replace(/:\d{1,5}$/, '');
  if (/^[\d.]+$/.test(rawHost) && !IPV4.test(rawHost)) return { ok: false, error: 'That is not a valid site name.' };
  const host = u.hostname;
  if (!host || host.startsWith('[')) return { ok: false, error: 'That is not a valid site name.' };
  if (!(host.includes('.') || host === 'localhost')) return { ok: false, error: 'Enter a full site name such as example.com.' };
  const explicitPort = /:\d{1,5}$/.test(body) ? (body.match(/:(\d{1,5})$/)![1] as string) : '';
  const port = u.port || explicitPort;
  return { ok: true, entry: port ? `${host}:${port}` : host };
}

export function matchesAllowEntry(entry: string, url: URL): boolean {
  const m = /^(.*?)(?::(\d{1,5}))?$/.exec(entry);
  const host = m?.[1] ?? entry;
  const port = m?.[2];
  if (!host) return false;
  if (!(url.hostname === host || url.hostname.endsWith(`.${host}`))) return false;
  return port === undefined || defaultPort(url) === port;
}

export type EmbedBlockReason = 'invalid-url' | 'self-origin' | 'mixed-content' | 'known-blocked' | 'not-allowlisted';
export type EmbedDecision =
  | { embed: true; host: string }
  | { embed: false; reason: EmbedBlockReason; host: string; label?: string };

export interface EmbedContext {
  /** Effective allowlist (built-in defaults + the person's own entries). */
  allow: readonly string[];
  /** Origin NEXUS itself is served from. A frame with this origin plus allow-same-origin could escape its sandbox. */
  appOrigin?: string;
  appProtocol?: string;
}

/** Pure decision: may this URL be shown in an in-app frame? */
export function decideEmbed(url: string, ctx: EmbedContext): EmbedDecision {
  let u: URL;
  try { u = new URL(url); } catch { return { embed: false, reason: 'invalid-url', host: '' }; }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password || !u.hostname) {
    return { embed: false, reason: 'invalid-url', host: u.hostname };
  }
  const host = u.hostname.replace(/^www\./, '');
  if (ctx.appOrigin && u.origin === ctx.appOrigin) return { embed: false, reason: 'self-origin', host };
  if (ctx.appProtocol === 'https:' && u.protocol === 'http:' && !isLoopbackHost(u.hostname)) {
    return { embed: false, reason: 'mixed-content', host };
  }
  if (ctx.allow.some((e) => matchesAllowEntry(e, u))) return { embed: true, host };
  const known = KNOWN_BLOCKED.find((k) => u.hostname === k.host || u.hostname.endsWith(`.${k.host}`));
  if (known) return { embed: false, reason: 'known-blocked', host, label: known.label };
  return { embed: false, reason: 'not-allowlisted', host };
}

export function mergeAllowlist(user: readonly string[], defaults: readonly string[] = DEFAULT_EMBED_ALLOWLIST): string[] {
  return Array.from(new Set([...defaults, ...user]));
}

/** What to tell the person for each reason. Kept here so UI and tests share the wording. */
export const EMBED_REASON_COPY: Record<EmbedBlockReason, { title: string; text: string }> = {
  'invalid-url': { title: 'Invalid address', text: 'This address is not a valid web page, so NEXUS will not load it.' },
  'self-origin': { title: 'Cannot open NEXUS inside itself', text: 'Showing this address would let the page reach NEXUS’s own data, so it is blocked.' },
  'mixed-content': {
    title: 'Insecure page blocked',
    text: 'This page uses plain HTTP. Browsers refuse to show insecure pages inside a secure app. Try the secure (https) version, or open it in your browser.',
  },
  'known-blocked': {
    title: 'This site does not allow embedding',
    text: 'Many large sites tell browsers not to show their pages inside other apps, to protect you from click-jacking. NEXUS does not bypass that.',
  },
  'not-allowlisted': {
    title: 'Not on your embedding list',
    text: 'NEXUS only shows sites you have allowed. Some sites refuse to be embedded even then; if the page stays blank, open it in your browser.',
  },
};
