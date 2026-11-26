import { describe, expect, it } from 'vitest';
import { NEWTAB_URL, SEARCH_ENGINES, displayUrl, hostOf, isLoopbackHost, isNavigableUrl, resolveInput, upgradeToHttps } from '@nexus/shared';

const url = (s: string, e?: Parameters<typeof resolveInput>[1]) => {
  const r = resolveInput(s, e);
  return r.ok ? r.url : `ERR:${r.error}`;
};

describe('resolveInput', () => {
  it('adds https to bare domains and lowercases the host', () => {
    expect(url('example.com')).toBe('https://example.com/');
    expect(url('EXAMPLE.com/Path?x=1')).toBe('https://example.com/Path?x=1');
  });
  it('uses http for localhost and IPv4, including ports', () => {
    expect(url('localhost:3000')).toBe('http://localhost:3000/');
    expect(url('192.168.1.1')).toBe('http://192.168.1.1/');
    expect(url('example.com:8080/a')).toBe('https://example.com:8080/a');
  });
  it('keeps explicit http/https URLs', () => {
    expect(url('http://example.com/a b')).toBe('http://example.com/a%20b');
    expect(url('https://example.com')).toBe('https://example.com/');
  });
  it.each(['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://x.com', 'mailto:a@b.co', 'blob:https://x.com/1', 'c:\\temp'])(
    'blocks non-http scheme %s',
    (input) => {
      expect(resolveInput(input).ok).toBe(false);
    },
  );
  it('blocks credentials (spoofing) in URLs', () => {
    expect(resolveInput('https://user:pass@example.com').ok).toBe(false);
    expect(resolveInput('http://google.com@evil.example').ok).toBe(false);
  });
  it('rejects empty, malformed and control-character input', () => {
    expect(resolveInput('   ').ok).toBe(false);
    expect(resolveInput('https://').ok).toBe(false);
    expect(resolveInput('exa\u0000mple.com').ok).toBe(false);
    expect(resolveInput('a'.repeat(3000)).ok).toBe(false);
  });
  it('treats everything else as a search with the chosen engine', () => {
    expect(url('hello world')).toBe('https://duckduckgo.com/?q=hello%20world');
    expect(url('cats', 'google')).toBe('https://www.google.com/search?q=cats');
    expect(url('what is 1.5')).toContain('duckduckgo.com');
    expect(url('user@example.com')).toContain('duckduckgo.com');
    const r = resolveInput('a&b=c d');
    expect(r.ok && r.kind).toBe('search');
    expect(url('a&b=c d')).toBe('https://duckduckgo.com/?q=a%26b%3Dc%20d');
  });
  it('never turns scheme-like text into a request to another scheme', () => {
    expect(url('javascript:1')).toContain('duckduckgo.com');
  });
});

describe('url helpers', () => {
  it('isNavigableUrl', () => {
    expect(isNavigableUrl(NEWTAB_URL)).toBe(true);
    expect(isNavigableUrl('https://example.com/')).toBe(true);
    expect(isNavigableUrl('javascript:alert(1)')).toBe(false);
    expect(isNavigableUrl('https://a:b@example.com')).toBe(false);
    expect(isNavigableUrl(42)).toBe(false);
  });
  it('hostOf / displayUrl', () => {
    expect(hostOf('https://www.example.com/x')).toBe('example.com');
    expect(hostOf('nope')).toBe('');
    expect(displayUrl('https://example.com/')).toBe('example.com');
    expect(displayUrl('https://example.com/a?b=1')).toBe('example.com/a?b=1');
    expect(displayUrl('http://example.com/')).toBe('http://example.com');
    expect(displayUrl(NEWTAB_URL)).toBe('');
  });
});

describe('search engine selection', () => {
  it.each([
    ['google', 'https://www.google.com/search?q=hello%20world'],
    ['duckduckgo', 'https://duckduckgo.com/?q=hello%20world'],
    ['bing', 'https://www.bing.com/search?q=hello%20world'],
    ['brave', 'https://search.brave.com/search?q=hello%20world'],
  ] as const)('%s', (engine, expected) => {
    expect(url('hello world', engine)).toBe(expected);
    expect(Object.keys(SEARCH_ENGINES)).toContain(engine);
  });
  it('detects URLs vs searches regardless of engine', () => {
    for (const e of ['google', 'bing', 'brave', 'duckduckgo'] as const) {
      expect(resolveInput('example.com/x', e)).toMatchObject({ ok: true, kind: 'url', url: 'https://example.com/x' });
      expect(resolveInput('how to cook rice', e)).toMatchObject({ ok: true, kind: 'search' });
    }
  });
  it('treats invalid IPs and hosts as errors instead of navigating', () => {
    expect(resolveInput('999.1.1.1').ok).toBe(false);
    expect(resolveInput('http://').ok).toBe(false);
  });
});

describe('https helpers', () => {
  it('upgrades only plain http', () => {
    expect(upgradeToHttps('http://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(upgradeToHttps('https://example.com/')).toBeNull();
    expect(upgradeToHttps('javascript:alert(1)')).toBeNull();
    expect(upgradeToHttps('http://u:p@example.com/')).toBeNull();
  });
  it('knows loopback hosts', () => {
    for (const h of ['localhost', 'app.localhost', '127.0.0.1', '127.1.2.3', '[::1]']) expect(isLoopbackHost(h)).toBe(true);
    for (const h of ['example.com', '192.168.1.1', 'localhost.evil.test']) expect(isLoopbackHost(h)).toBe(false);
  });
});
