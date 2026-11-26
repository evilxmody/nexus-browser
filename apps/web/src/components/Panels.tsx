import { useMemo, useState, type ReactNode } from 'react';
import { MAX_TABS, currentEntry, frameFor, pageKey } from '@nexus/browser';
import { SEARCH_ENGINES, decideEmbed, displayUrl, hostOf, resolveInput, type SearchEngineId } from '@nexus/shared';
import { EmptyState, Icon, IconButton } from '@nexus/ui';
import { browser, embedContext, pages, resetAllData, settings } from '../runtime';
import { useStore } from '../hooks';
import { closeRoute } from '../router';
import { allowEmbedding, openUrl, openUrlInNewTab, removeEmbedding } from '../actions';
import { runCommand } from '../commands';
import { toast } from '../toast';
import { NEWTAB_URL } from '@nexus/shared';

function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && closeRoute()}>
      <header className="panel-head">
        <h2>{title}</h2>
        <div className="cluster">{actions}<IconButton icon="close" label="Close" onClick={closeRoute} /></div>
      </header>
      <div className="scroll panel-body">{children}</div>
    </section>
  );
}

function ConfirmButton({ label, confirmLabel, onConfirm, disabled }: { label: string; confirmLabel: string; onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  return (
    <button className="btn danger" disabled={disabled} onBlur={() => setArmed(false)}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      <Icon name="trash" size={18} />{armed ? confirmLabel : label}
    </button>
  );
}

const hue = (host: string) => { let h = 0; for (const c of host) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

function statusLabel(tabUrl: string, decision: ReturnType<typeof decideEmbed> | null, status: string): string {
  if (tabUrl === NEWTAB_URL) return 'New tab';
  if (decision && !decision.embed) return 'Not shown in NEXUS';
  return status === 'verified' ? 'Loaded' : status === 'loaded' ? 'Loaded (unconfirmed)' : status === 'error' ? 'Failed to load' : 'Not opened yet';
}

/** Full-screen tab switcher. Cross-origin pages cannot be screenshotted by a web app, so cards show the site identity, not a fake thumbnail. */
export function TabsPanel() {
  const state = useStore(browser);
  const ps = useStore(pages);
  const s = useStore(settings);
  const full = state.tabs.length >= MAX_TABS;
  const ctx = embedContext(s.embedAllow);
  return (
    <Panel title={`Tabs (${state.tabs.length})`} actions={<IconButton icon="plus" label="New tab" disabled={full} title={full ? `Tab limit (${MAX_TABS}) reached` : 'New tab'}
      onClick={() => runCommand({ type: 'newTab' })} />}>
      <ul className="tab-grid">
        {state.tabs.map((t) => {
          const e = currentEntry(t);
          const isNew = e.url === NEWTAB_URL;
          const host = hostOf(e.url);
          const dec = isNew ? null : decideEmbed(e.url, ctx);
          const st = frameFor(ps, t.id, pageKey(t, ps.reloads)).status;
          return (
            <li key={t.id} className={`tab-card${t.id === state.activeTabId ? ' active' : ''}`} data-testid="tab-card">
              <button className="tab-card-main" onClick={() => runCommand({ type: 'selectTab', id: t.id })} aria-label={`Switch to ${e.title}`}
                aria-current={t.id === state.activeTabId ? 'true' : undefined}>
                <span className="tab-preview" style={{ ['--h' as string]: isNew ? 195 : hue(host) }} aria-hidden="true">
                  <span className="tab-preview-letter">{isNew ? 'N' : (host[0] ?? '?').toUpperCase()}</span>
                </span>
                <b>{e.title}</b>
                <small>{isNew ? 'New tab page' : displayUrl(e.url)}</small>
                <small className="tab-status">{statusLabel(e.url, dec, st)}</small>
              </button>
              <IconButton icon="close" label={`Close ${e.title}`} className="tab-card-close" onClick={() => runCommand({ type: 'closeTab', id: t.id })} />
            </li>
          );
        })}
      </ul>
      {full && <p className="note">You have reached the limit of {MAX_TABS} tabs. Close one to open another.</p>}
    </Panel>
  );
}

export function BookmarksPanel() {
  const { bookmarks } = useStore(browser);
  return (
    <Panel title="Bookmarks">
      {bookmarks.length === 0 ? (
        <EmptyState icon="bookmark" title="No bookmarks yet" text="Open a page and tap the star in the address bar to save it." />
      ) : (
        <ul className="list">
          {bookmarks.map((b) => (
            <li key={b.id} className="row-wrap">
              <button className="row" onClick={() => openUrl(b.url)}>
                <Icon name="star" size={18} filled /><span className="row-main"><b>{b.title}</b><small>{displayUrl(b.url)}</small></span>
              </button>
              <IconButton icon="newtab" label={`Open ${b.title} in a new tab`} onClick={() => openUrlInNewTab(b.url, b.title)} />
              <IconButton icon="trash" label={`Remove bookmark ${b.title}`} onClick={() => browser.removeBookmark(b.id)} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function HistoryPanel() {
  const { history } = useStore(browser);
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? history.filter((v) => v.title.toLowerCase().includes(n) || v.url.toLowerCase().includes(n)) : history;
  }, [history, q]);
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <Panel title="History" actions={<ConfirmButton label="Clear" confirmLabel="Tap to confirm" disabled={history.length === 0}
      onConfirm={() => { browser.clearHistory(); toast('History cleared', 'success', 1800); }} />}>
      {history.length === 0 ? (
        <EmptyState icon="history" title="No history" text="Pages you visit are listed here. History is stored only on this device." />
      ) : (
        <>
          <div className="field"><span className="field-icon"><Icon name="search" size={18} /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search history" aria-label="Search history" /></div>
          {shown.length === 0 ? <EmptyState icon="search" title="No matches" text="Try a different search." /> : (
            <ul className="list">
              {shown.map((v) => (
                <li key={v.id} className="row-wrap">
                  <button className="row" onClick={() => openUrl(v.url)}>
                    <Icon name="globe" size={18} /><span className="row-main"><b>{v.title}</b><small>{displayUrl(v.url)} · {fmt.format(v.visitedAt)}</small></span>
                  </button>
                  <IconButton icon="newtab" label={`Open ${v.title} in a new tab`} onClick={() => openUrlInNewTab(v.url, v.title)} />
                  <IconButton icon="trash" label={`Remove ${v.title} from history`} onClick={() => browser.removeVisit(v.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

export function SettingsPanel() {
  const s = useStore(settings);
  const [home, setHome] = useState(s.homeUrl);
  const [homeErr, setHomeErr] = useState<string | null>(null);
  const saveHome = () => {
    if (!home.trim()) { settings.dispatch({ homeUrl: '' }); setHomeErr(null); return; }
    const r = resolveInput(home);
    if (!r.ok || r.kind !== 'url') { setHomeErr(r.ok ? 'Enter a web address, not a search.' : r.error); return; }
    settings.dispatch({ homeUrl: r.url }); setHome(r.url); setHomeErr(null); toast('Home page saved', 'success', 1800);
  };
  return (
    <Panel title="Settings">
      <h3 className="section-title">Search engine</h3>
      <div className="seg" role="radiogroup" aria-label="Search engine">
        {(Object.keys(SEARCH_ENGINES) as SearchEngineId[]).map((id) => (
          <button key={id} role="radio" aria-checked={s.searchEngine === id} className={s.searchEngine === id ? 'on' : ''}
            onClick={() => settings.dispatch({ searchEngine: id })}>{SEARCH_ENGINES[id].label}</button>
        ))}
      </div>

      <h3 className="section-title">Home page</h3>
      <form className="home-form" onSubmit={(e) => { e.preventDefault(); saveHome(); }}>
        <div className={`field${homeErr ? ' has-error' : ''}`}>
          <input value={home} onChange={(e) => { setHome(e.target.value); setHomeErr(null); }} placeholder="Leave empty for the NEXUS start page"
            aria-label="Home page address" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </div>
        <button className="btn" type="submit">Save</button>
      </form>
      {homeErr && <div className="field-error" role="alert">{homeErr}</div>}

      <EmbedSettings />

      <h3 className="section-title">Gesture control</h3>
      <div className="row static disabled" aria-disabled="true">
        <Icon name="eye" size={18} /><span className="row-main"><b>Eye, blink and hand control</b>
          <small>Not available yet. It arrives in a later release and will always ask before using your camera.</small></span>
      </div>

      <h3 className="section-title">Your data</h3>
      <p className="note">Tabs, history, bookmarks and settings are stored only on this device. Nothing is sent to a server.</p>
      <div className="actions">
        <ConfirmButton label="Reset all data" confirmLabel="Tap again to erase everything" onConfirm={() => void resetAllData()} />
      </div>
      <p className="note small">NEXUS Browser 0.2.0 · web browsing release</p>
    </Panel>
  );
}

function EmbedSettings() {
  const { embedAllow } = useStore(settings);
  const [site, setSite] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <h3 className="section-title">Sites shown inside NEXUS</h3>
      <p className="note">
        NEXUS only shows pages from sites on this list. Many sites refuse to be shown inside other apps and NEXUS does not work around that;
        for those it offers “Open in your browser”. NEXUS cannot check in advance whether a site allows embedding, so adding a site is a try, not a promise.
      </p>
      <form className="home-form" onSubmit={(e) => { e.preventDefault(); const r = allowEmbedding(site); setErr(r); if (!r) setSite(''); }}>
        <div className={`field${err ? ' has-error' : ''}`}>
          <input value={site} onChange={(e) => { setSite(e.target.value); setErr(null); }} placeholder="example.com"
            aria-label="Site to allow" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </div>
        <button className="btn" type="submit">Add</button>
      </form>
      {err && <div className="field-error" role="alert">{err}</div>}
      {embedAllow.length === 0 ? (
        <p className="note">No sites allowed yet.</p>
      ) : (
        <ul className="list" aria-label="Allowed sites">
          {embedAllow.map((e) => (
            <li key={e} className="row-wrap">
              <div className="row static"><Icon name="globe" size={18} /><span className="row-main"><b>{e}</b><small>and its subdomains</small></span></div>
              <IconButton icon="trash" label={`Remove ${e}`} onClick={() => removeEmbedding(e)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
