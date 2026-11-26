import { useEffect, useRef, useState, type ReactNode } from 'react';
import { activeTab, currentEntry, frameFor, pageKey, type Tab } from '@nexus/browser';
import {
  EMBED_PERMISSIONS_POLICY, EMBED_REASON_COPY, EMBED_REFERRER_POLICY, EMBED_SANDBOX, NEWTAB_URL, decideEmbed,
  displayUrl, hostOf, isLoopbackHost, parseBridgeMessage, upgradeToHttps, type EmbedDecision,
} from '@nexus/shared';
import { EmptyState, Icon, Spinner } from '@nexus/ui';
import { browser, embedContext, pages, settings } from '../runtime';
import { useOnline, useStore } from '../hooks';
import { allowEmbedding, openUrlInNewTab, reloadActive } from '../actions';
import { runCommand } from '../commands';
import { toast } from '../toast';
import { NewTabPage } from './Pages';
import { SearchResults, parseSearchUrl } from './SearchResults';

export const LOAD_TIMEOUT_MS = 20_000;
const MAX_LIVE_FRAMES = 3;

async function copyUrl(url: string) {
  try { await navigator.clipboard.writeText(url); toast('Link copied', 'success', 1800); }
  catch { toast('Could not copy. Select the address and copy it manually.', 'error'); }
}

function Actions({ url, children }: { url: string; children?: ReactNode }) {
  return (
    <div className="actions">
      <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={18} />Open in your browser</a>
      {children}
      <button className="btn" onClick={() => void copyUrl(url)}><Icon name="copy" size={18} />Copy URL</button>
    </div>
  );
}

/** Explains why a page is not shown in the app and what the person can do. Used for every non-rendered state. */
export function StatusCard(p: { icon: 'warn' | 'globe' | 'lock' | 'info'; title: string; text: string; url?: string; host?: string; tone?: 'warn'; children?: ReactNode; state: string }) {
  return (
    <div className="scroll status-wrap" data-state={p.state}>
      <div className="status-card" role="status">
        <EmptyState icon={p.icon} title={p.title} text={p.text}>
          {p.host && <p className="mono">{p.host}</p>}
        </EmptyState>
        {p.url ? <Actions url={p.url}>{p.children}</Actions> : <div className="actions">{p.children}</div>}
      </div>
    </div>
  );
}

function Blocked({ url, d }: { url: string; d: Extract<EmbedDecision, { embed: false }> }) {
  const copy = EMBED_REASON_COPY[d.reason];
  const title = d.reason === 'known-blocked' && d.label ? `${d.label} does not allow embedding` : copy.title;
  const https = d.reason === 'mixed-content' ? upgradeToHttps(url) : null;
  return (
    <StatusCard state={d.reason === 'invalid-url' ? 'invalid' : 'blocked'} icon={d.reason === 'invalid-url' ? 'warn' : 'lock'}
      title={title} text={copy.text} url={d.reason === 'invalid-url' ? undefined : url} host={d.host || displayUrl(url)}>
      {d.reason === 'not-allowlisted' && (
        <button className="btn" onClick={() => { const e = allowEmbedding(d.host); if (e) toast(e, 'error'); else reloadActive(); }}>
          <Icon name="check" size={18} />Allow {d.host}
        </button>
      )}
      {https && <button className="btn" onClick={() => runCommand({ type: 'navigate', input: https })}><Icon name="lock" size={18} />Try https</button>}
      {d.reason === 'known-blocked' && (
        <button className="btn" onClick={() => { const e = allowEmbedding(d.host); if (e) toast(e, 'error'); else reloadActive(); }}>Try anyway</button>
      )}
    </StatusCard>
  );
}

function EmbedFrame({ tab, visible, key_ }: { tab: Tab; visible: boolean; key_: string }) {
  const entry = currentEntry(tab);
  const ps = useStore(pages);
  const f = frameFor(ps, tab.id, key_);
  const ref = useRef<HTMLIFrameElement>(null);
  const online = useOnline();
  const origin = new URL(entry.url).origin;

  useEffect(() => { pages.dispatch({ type: 'frame/begin', tabId: tab.id, key: key_ }); }, [tab.id, key_]);

  useEffect(() => {
    if (f.status !== 'loading') return;
    const t = setTimeout(() => pages.dispatch({ type: 'frame/error', tabId: tab.id, key: key_, error: 'timeout' }), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [f.status, tab.id, key_]);

  useEffect(() => {
    if (!online && f.status === 'loading') pages.dispatch({ type: 'frame/error', tabId: tab.id, key: key_, error: 'offline' });
  }, [online, f.status, tab.id, key_]);

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || e.origin !== origin) return; // only this frame, only its origin
      const m = parseBridgeMessage(e.data);
      if (!m) return;
      if (m.type === 'ready') pages.dispatch({ type: 'frame/verified', tabId: tab.id, key: key_ });
      else if (m.type === 'title') browser.setTitle(m.title, tab.id);
      else if (m.type === 'open-link') {
        const now = Date.now();
        if (now - lastOpen.current < 500) return; // a page cannot spam tabs
        lastOpen.current = now;
        openUrlInNewTab(m.url);
      }
    };
    addEventListener('message', on);
    return () => removeEventListener('message', on);
  }, [origin, tab.id, key_]);
  const lastOpen = useRef(0);

  const failed = f.status === 'error';
  return (
    <div className="frame-host" hidden={!visible} data-frame-status={f.status}>
      {failed ? (
        <StatusCard state={f.error === 'offline' ? 'offline' : 'error'} icon="warn"
          title={f.error === 'offline' ? 'You are offline' : f.error === 'timeout' ? 'The page took too long' : 'Could not load this page'}
          text={f.error === 'offline' ? 'Check your connection, then try again.' : 'The site did not respond in time. It may be down, slow, or refusing to be shown here.'}
          url={entry.url} host={displayUrl(entry.url)}>
          <button className="btn" onClick={() => reloadActive()}><Icon name="reload" size={18} />Try again</button>
        </StatusCard>
      ) : (
        <>
          <iframe
            ref={ref} key={key_} title={`Page: ${entry.title}`} src={entry.url}
            sandbox={EMBED_SANDBOX} allow={EMBED_PERMISSIONS_POLICY} referrerPolicy={EMBED_REFERRER_POLICY}
            onLoad={() => pages.dispatch({ type: 'frame/load', tabId: tab.id, key: key_ })}
            onError={() => pages.dispatch({ type: 'frame/error', tabId: tab.id, key: key_, error: 'load-error' })}
          />
          {f.status === 'loading' && <div className="frame-loading"><Spinner label="Loading page" /></div>}
          {f.status === 'loaded' && !ps.hintsDismissed[hostOf(entry.url)] && (
            <div className="hint" role="note" data-testid="blank-hint">
              <Icon name="info" size={16} />
              <span>If this page looks blank, the site may block embedding. NEXUS cannot tell.</span>
              <a href={entry.url} target="_blank" rel="noopener noreferrer">Open in browser</a>
              <button aria-label="Dismiss" onClick={() => pages.dispatch({ type: 'hint/dismiss', host: hostOf(entry.url) })}><Icon name="close" size={14} /></button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Keeps the few most recently used tabs' frames alive so switching tabs does not reload them. */
function useLiveTabs(activeId: string, existing: string[]): string[] {
  const [live, setLive] = useState<string[]>([activeId]);
  const key = existing.join(',');
  useEffect(() => {
    setLive((l) => [activeId, ...l.filter((id) => id !== activeId)].filter((id) => existing.includes(id)).slice(0, MAX_LIVE_FRAMES));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, key]);
  return live;
}

export function Viewport() {
  const state = useStore(browser);
  const ps = useStore(pages);
  const s = useStore(settings);
  const online = useOnline();
  const tab = activeTab(state);
  const entry = currentEntry(tab);
  const live = useLiveTabs(tab.id, state.tabs.map((t) => t.id));

  useEffect(() => { pages.dispatch({ type: 'frame/prune', tabIds: state.tabs.map((t) => t.id) }); }, [state.tabs]);

  const ctx = embedContext(s.embedAllow);
  const decide = (t: Tab) => decideEmbed(currentEntry(t).url, ctx);

  const embeddable = state.tabs.filter((t) => live.includes(t.id) && currentEntry(t).url !== NEWTAB_URL && !parseSearchUrl(currentEntry(t).url) && decide(t).embed);
  const search = parseSearchUrl(entry.url);
  // A search page is always shown by NEXUS itself, even if the person once pressed "Try anyway" for a search engine.
  const d = entry.url === NEWTAB_URL ? null : search ? { embed: false as const, reason: 'known-blocked' as const, host: '' } : decide(tab);
  const offlineBlock = d?.embed && !online && !isLoopbackHost(hostOf(entry.url)) && frameFor(ps, tab.id, pageKey(tab, ps.reloads)).status !== 'verified';

  return (
    <>
      {entry.url === NEWTAB_URL && <NewTabPage />}
      {d && !d.embed && (search ? <SearchResults engine={search.engine} query={search.query} /> : <Blocked url={entry.url} d={d} />)}
      {offlineBlock && (
        <StatusCard state="offline" icon="warn" title="You are offline" text="Check your connection, then try again." url={entry.url} host={displayUrl(entry.url)}>
          <button className="btn" onClick={() => reloadActive()}><Icon name="reload" size={18} />Try again</button>
        </StatusCard>
      )}
      {embeddable.map((t) => {
        const visible = t.id === tab.id && !!d?.embed && !offlineBlock;
        return <EmbedFrame key={t.id} tab={t} visible={visible} key_={pageKey(t, ps.reloads)} />;
      })}
    </>
  );
}

/** Status of the active tab for the toolbar's progress bar and address bar icon. */
export function useActiveStatus(): 'idle' | 'loading' | 'loaded' | 'verified' | 'error' | 'blocked' {
  const state = useStore(browser);
  const ps = useStore(pages);
  const s = useStore(settings);
  const tab = activeTab(state);
  const url = currentEntry(tab).url;
  if (url === NEWTAB_URL) return 'idle';
  if (parseSearchUrl(url) || !decideEmbed(url, embedContext(s.embedAllow)).embed) return 'blocked';
  return frameFor(ps, tab.id, pageKey(tab, ps.reloads)).status;
}
