import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMBED_ALLOWLIST, EMBED_PERMISSIONS_POLICY, EMBED_SANDBOX, EMBED_SANDBOX_FLAGS, FORBIDDEN_SANDBOX_FLAGS,
  decideEmbed, matchesAllowEntry, mergeAllowlist, normalizeAllowEntry, parseBridgeMessage,
} from '@nexus/shared';

const ctx = (allow: string[] = [], extra: object = {}) => ({ allow, appOrigin: 'https://nexus.test', appProtocol: 'https:', ...extra });

describe('sandbox configuration', () => {
  it('grants only the minimal flags and none of the dangerous ones', () => {
    const granted = EMBED_SANDBOX.split(' ');
    expect(granted).toEqual([...EMBED_SANDBOX_FLAGS]);
    for (const bad of FORBIDDEN_SANDBOX_FLAGS) expect(granted).not.toContain(bad);
    expect(granted).not.toContain('allow-top-navigation');
  });
  it('grants no device permissions to frames', () => {
    expect(EMBED_PERMISSIONS_POLICY).toBe('');
  });
  it('ships with no pre-approved external site', () => {
    expect(DEFAULT_EMBED_ALLOWLIST).toEqual([]);
  });
});

describe('decideEmbed', () => {
  it('embeds allowlisted hosts and their subdomains, ignoring www', () => {
    expect(decideEmbed('https://example.com/a', ctx(['example.com'])).embed).toBe(true);
    expect(decideEmbed('https://docs.example.com/', ctx(['example.com'])).embed).toBe(true);
    expect(decideEmbed('https://www.example.com/', ctx(['example.com']))).toEqual({ embed: true, host: 'example.com' });
  });
  it('does not match look-alike hosts', () => {
    expect(decideEmbed('https://notexample.com/', ctx(['example.com'])).embed).toBe(false);
    expect(decideEmbed('https://example.com.evil.test/', ctx(['example.com'])).embed).toBe(false);
  });
  it('refuses everything by default (unsupported embedding state)', () => {
    expect(decideEmbed('https://example.com/', ctx())).toMatchObject({ embed: false, reason: 'not-allowlisted' });
  });
  it('explains known-blocking sites, including the search engines, and lets the person override', () => {
    for (const u of ['https://www.google.com/search?q=a', 'https://duckduckgo.com/?q=a', 'https://www.bing.com/search?q=a', 'https://search.brave.com/search?q=a']) {
      expect(decideEmbed(u, ctx())).toMatchObject({ embed: false, reason: 'known-blocked' });
    }
    expect(decideEmbed('https://www.google.com/maps/embed', ctx(['google.com'])).embed).toBe(true);
  });
  it('port-specific entries match only that port', () => {
    const c = ctx(['localhost:4400']);
    expect(decideEmbed('http://localhost:4400/x', c).embed).toBe(true);
    expect(decideEmbed('http://localhost:4401/x', c).embed).toBe(false);
    expect(decideEmbed('http://localhost/x', c).embed).toBe(false);
    expect(decideEmbed('http://localhost:4401/', ctx(['localhost'])).embed).toBe(true);
  });
  it('never embeds NEXUS inside itself, even if allowlisted', () => {
    expect(decideEmbed('https://nexus.test/#/settings', ctx(['nexus.test']))).toMatchObject({ embed: false, reason: 'self-origin' });
  });
  it('blocks http pages from a secure app, except loopback', () => {
    expect(decideEmbed('http://example.com/', ctx(['example.com']))).toMatchObject({ embed: false, reason: 'mixed-content' });
    expect(decideEmbed('http://localhost:3000/', ctx(['localhost'])).embed).toBe(true);
    expect(decideEmbed('http://example.com/', ctx(['example.com'], { appProtocol: 'http:' })).embed).toBe(true);
  });
  it('rejects invalid and dangerous URLs even when "allowlisted"', () => {
    for (const u of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'https://u:p@example.com/', 'nope', 'blob:https://example.com/1']) {
      expect(decideEmbed(u, ctx(['example.com', 'localhost']))).toMatchObject({ embed: false, reason: 'invalid-url' });
    }
  });
  it('merges default and user allowlists without duplicates', () => {
    expect(mergeAllowlist(['a.com', 'a.com'], ['b.com'])).toEqual(['b.com', 'a.com']);
  });
});

describe('normalizeAllowEntry', () => {
  const ok = (s: string) => { const r = normalizeAllowEntry(s); return r.ok ? r.entry : `ERR`; };
  it('normalises hosts, URLs and ports', () => {
    expect(ok(' Example.COM ')).toBe('example.com');
    expect(ok('https://Example.com/path?q=1')).toBe('example.com');
    expect(ok('*.example.com')).toBe('example.com');
    expect(ok('localhost:4400')).toBe('localhost:4400');
    expect(ok('https://example.com:8443/x')).toBe('example.com:8443');
    expect(ok('example.com:443')).toBe('example.com:443');
    expect(ok('127.0.0.1:3000')).toBe('127.0.0.1:3000');
  });
  it.each(['', '   ', '*', 'com', 'javascript:alert(1)', 'ftp://example.com', 'user:pw@example.com', 'a b.com', 'exa*mple.com', '999', '[::1]', 'x'.repeat(300)])(
    'rejects %j', (s) => expect(normalizeAllowEntry(s).ok).toBe(false));
  it('rejects non-strings', () => expect(normalizeAllowEntry(42).ok).toBe(false));
  it('matchesAllowEntry honours explicit default ports', () => {
    expect(matchesAllowEntry('example.com:443', new URL('https://example.com/'))).toBe(true);
    expect(matchesAllowEntry('example.com:443', new URL('https://example.com:8443/'))).toBe(false);
  });
});

describe('bridge messages from embedded pages', () => {
  it('accepts only the three known, well-formed messages', () => {
    expect(parseBridgeMessage({ nexus: 1, type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseBridgeMessage({ nexus: 1, type: 'title', title: '  Hi   there ' })).toEqual({ type: 'title', title: 'Hi there' });
    expect(parseBridgeMessage({ nexus: 1, type: 'open-link', url: 'https://example.com' })).toEqual({ type: 'open-link', url: 'https://example.com/' });
  });
  it('rejects everything else', () => {
    for (const m of [
      null, 'ready', [], {}, { type: 'ready' }, { nexus: 2, type: 'ready' }, { nexus: 1, type: 'navigate', url: 'https://a.test' },
      { nexus: 1, type: 'title', title: '   ' }, { nexus: 1, type: 'title', title: 5 },
      { nexus: 1, type: 'open-link', url: 'javascript:alert(1)' }, { nexus: 1, type: 'open-link', url: 'data:text/html,x' },
      { nexus: 1, type: 'open-link', url: 'https://u:p@a.test/' }, { nexus: 1, type: 'open-link', url: 'nexus://newtab' },
      { nexus: 1, type: 'open-link', url: 'https://a.test/' + 'x'.repeat(3000) }, { nexus: 1, type: 'open-link' },
    ]) expect(parseBridgeMessage(m)).toBeNull();
  });
});
