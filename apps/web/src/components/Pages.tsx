import { displayUrl, hostOf } from '@nexus/shared';
import { EmptyState, Icon } from '@nexus/ui';
import { browser } from '../runtime';
import { useStore } from '../hooks';
import { openUrl, openUrlInNewTab, submitInput } from '../actions';
import { useState } from 'react';

export function NewTabPage() {
  const state = useStore(browser);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="scroll newtab">
      <div className="hero">
        <div className="wordmark">NEXUS</div>
        <form onSubmit={(e) => { e.preventDefault(); setErr(submitInput(q)); }} role="search">
          <div className={`field big${err ? ' has-error' : ''}`}>
            <span className="field-icon"><Icon name="search" size={20} /></span>
            <input value={q} onChange={(e) => { setQ(e.target.value); setErr(null); }} placeholder="Search or enter address"
              aria-label="Search or enter address" inputMode="url" enterKeyHint="go" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </div>
          {err && <div className="field-error" role="alert">{err}</div>}
        </form>
      </div>
      <section aria-labelledby="bm-h">
        <h2 id="bm-h" className="section-title">Bookmarks</h2>
        {state.bookmarks.length === 0 ? (
          <EmptyState icon="bookmark" title="No bookmarks yet" text="Open a page and tap the star in the address bar to save it here." />
        ) : (
          <ul className="tiles">
            {state.bookmarks.slice(0, 8).map((b) => (
              <li key={b.id}>
                <button className="tile" onClick={() => openUrl(b.url)} onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); openUrlInNewTab(b.url, b.title); } }} title={b.url}>
                  <span className="tile-letter">{(hostOf(b.url)[0] ?? '?').toUpperCase()}</span>
                  <span className="tile-title">{b.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="rc-h">
        <h2 id="rc-h" className="section-title">Recent</h2>
        {state.history.length === 0 ? (
          <EmptyState icon="history" title="Nothing visited yet" text="Pages you open will appear here. History stays on this device." />
        ) : (
          <ul className="list">
            {state.history.slice(0, 5).map((v) => (
              <li key={v.id}><button className="row" onClick={() => openUrl(v.url)} onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); openUrlInNewTab(v.url, v.title); } }}>
                <Icon name="globe" size={18} /><span className="row-main"><b>{v.title}</b><small>{displayUrl(v.url)}</small></span>
              </button></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
