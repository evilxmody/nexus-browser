import { describe, expect, it } from 'vitest';
import { resolveInput } from '@nexus/shared';
import { parseSearchUrl } from '../../apps/web/src/components/SearchResults';

describe('parseSearchUrl', () => {
  it('recognises what resolveInput builds for a plain word, for every engine', () => {
    for (const e of ['google', 'bing', 'brave', 'duckduckgo'] as const) {
      const r = resolveInput('facebook login', e);
      expect(r.ok && r.kind).toBe('search');
      if (r.ok) expect(parseSearchUrl(r.url)).toEqual({ engine: e, query: 'facebook login' });
    }
  });
  it('ignores normal pages', () => {
    expect(parseSearchUrl('https://example.com/?q=hi')).toBeNull();
    expect(parseSearchUrl('nexus://newtab')).toBeNull();
  });
});
