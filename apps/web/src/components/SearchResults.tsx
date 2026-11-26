import { useEffect, useState } from 'react';
import { SEARCH_ENGINES, type SearchEngineId } from '@nexus/shared';
import { EmptyState, Icon } from '@nexus/ui';

/**
 * Search engines (Google, Bing, DuckDuckGo, Brave) forbid being shown inside another app, so their result pages can never
 * appear in the in-app frame. Instead of a dead end, a search in NEXUS shows this page: quick results from Wikipedia
 * (its API allows browsers to call it) plus one-tap buttons that open the full search in a real browser tab.
 * Real in-app web search needs the native WebView of Phase 5 or a search API key.
 */

/** If `url` is a search-results address from one of the built-in engines, returns the engine and the query. */
export function parseSearchUrl(url: string): { engine: SearchEngineId; query: string } | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  for (const id of Object.keys(SEARCH_ENGINES) as SearchEngineId[]) {
    const t = new URL(SEARCH_ENGINES[id].template.replace('%s', 'x'));
    if (u.hostname === t.hostname && u.pathname === t.pathname) {
      const q = u.searchParams.get('q');
      if (q) return { engine: id, query: q };
    }
  }
  return null;
}

interface Hit { title: string; snippet: string; url: string }
type State = { s: 'loading' } | { s: 'done'; hits: Hit[] } | { s: 'failed' };

const stripTags = (h: string) => h.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export function SearchResults({ engine, query }: { engine: SearchEngineId; query: string }) {
  const [st, setSt] = useState<State>({ s: 'loading' });
  useEffect(() => {
    const ac = new AbortController();
    setSt({ s: 'loading' });
    // Wikipedia in the language of the query: Arabic letters search ar.wikipedia, everything else en.wikipedia.
    const lang = /[\u0600-\u06FF]/.test(query) ? 'ar' : 'en';
    const api = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&format=json&origin=*`;
    fetch(api, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { query?: { search?: { title: string; snippet: string }[] } }) => {
        const hits = (j.query?.search ?? []).map((x) => ({
          title: x.title, snippet: stripTags(x.snippet), url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(x.title.replace(/ /g, '_'))}`,
        }));
        setSt({ s: 'done', hits });
      })
      .catch((e) => { if (!ac.signal.aborted) { console.error('[nexus] search failed', e); setSt({ s: 'failed' }); } });
    return () => ac.abort();
  }, [query]);

  const link = (id: SearchEngineId) => SEARCH_ENGINES[id].template.replace('%s', encodeURIComponent(query));
  return (
    <div className="scroll" data-state="search" style={{ padding: 16 }}>
      <div style={{ maxWidth: 680, margin: "0 auto", display: "grid", gap: 12 }}>
        <h2 className="section-title">Search: {query}</h2>
        <p className="note">Search sites cannot be shown inside NEXUS. Open the full results in your browser:</p>
        <div className="actions">
          <a className="btn primary" href={link(engine)} target="_blank" rel="noopener noreferrer"><Icon name="external" size={18} />Search with {SEARCH_ENGINES[engine].label}</a>
          {(Object.keys(SEARCH_ENGINES) as SearchEngineId[]).filter((id) => id !== engine).map((id) => (
            <a key={id} className="btn" href={link(id)} target="_blank" rel="noopener noreferrer">{SEARCH_ENGINES[id].label}</a>
          ))}
        </div>
        <h3 className="section-title">Quick results (Wikipedia)</h3>
        {st.s === 'loading' && <p className="note">Searching...</p>}
        {st.s === 'failed' && <EmptyState icon="warn" title="Quick results are not available" text="Check your connection. You can still use the buttons above." />}
        {st.s === 'done' && st.hits.length === 0 && <p className="note">No Wikipedia results. Try the buttons above.</p>}
        {st.s === 'done' && st.hits.length > 0 && (
          <ul className="list">
            {st.hits.map((h) => (
              <li key={h.url}>
                <a className="row" href={h.url} target="_blank" rel="noopener noreferrer">
                  <Icon name="globe" size={18} /><span className="row-main"><b>{h.title}</b><small style={{ whiteSpace: 'normal' }}>{h.snippet}</small></span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
