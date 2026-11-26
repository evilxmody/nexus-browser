import { useRef, useState, type FormEvent } from 'react';
import { MAX_TABS, activeTab, currentEntry, isBookmarked } from '@nexus/browser';
import { NEWTAB_URL, displayUrl, isSecureUrl } from '@nexus/shared';
import { Icon, IconButton } from '@nexus/ui';
import { browser } from '../runtime';
import { useStore } from '../hooks';
import { runCommand } from '../commands';
import { toast } from '../toast';
import { useActiveStatus } from './PageView';

export function AddressBar() {
  const state = useStore(browser);
  const status = useActiveStatus();
  const entry = currentEntry(activeTab(state));
  const isNew = entry.url === NEWTAB_URL;
  const shown = displayUrl(entry.url);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const justFocused = useRef(false);
  const bookmarked = !isNew && isBookmarked(state, entry.url);
  const editing = draft !== null;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const r = runCommand({ type: 'navigate', input: draft ?? shown });
    setError(r.ok ? null : r.message ?? 'That address is not valid.');
    if (r.ok) { setDraft(null); (document.activeElement as HTMLElement | null)?.blur(); }
  };

  const icon = isNew ? 'search' : status === 'blocked' || !isSecureUrl(entry.url) ? 'warn' : 'lock';
  const iconTitle = isNew ? '' : !isSecureUrl(entry.url) ? 'Not secure (HTTP)' : status === 'blocked' ? 'Not shown in NEXUS' : 'Secure connection (HTTPS)';

  return (
    <form className="addressbar" onSubmit={submit} role="search">
      <div className={`field${error ? ' has-error' : ''}`} data-loading={status === 'loading' ? 'true' : undefined}>
        <span className="field-icon" title={iconTitle}>
          {status === 'loading' ? <span className="mini-spinner" aria-label="Loading" role="status" /> : <Icon name={icon} size={18} />}
        </span>
        <input
          value={draft ?? shown}
          placeholder="Search or enter address"
          aria-label="Address or search" aria-invalid={!!error} aria-describedby={error ? 'addr-error' : undefined}
          inputMode="url" enterKeyHint="search" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          onFocus={(e) => {
            const el = e.currentTarget;
            justFocused.current = true;
            setTimeout(() => el.setSelectionRange(0, el.value.length), 0); // iOS ignores select() inside the focus event
          }}
          onMouseUp={(e) => { if (justFocused.current) { e.preventDefault(); justFocused.current = false; } }}
          onTouchEnd={() => { justFocused.current = false; }}
          onChange={(e) => { setDraft(e.target.value); setError(null); }}
          onBlur={() => { setDraft(null); setError(null); justFocused.current = false; }}
        />
        {editing ? (
          <IconButton icon="search" label="Go" className="field-btn" onClick={() => undefined} submit keepFocus />
        ) : (
          <IconButton icon="star" label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'} filled={bookmarked} active={bookmarked}
            disabled={isNew} className="field-btn"
            onClick={() => { runCommand({ type: 'toggleBookmark' }); toast(bookmarked ? 'Bookmark removed' : 'Bookmarked', 'success', 1800); }} />
        )}
      </div>
      {error && <div id="addr-error" className="field-error" role="alert">{error}</div>}
    </form>
  );
}

export function TabStrip() {
  const state = useStore(browser);
  return (
    <div className="tabstrip desktop-only" role="tablist" aria-label="Open tabs">
      {state.tabs.map((t) => {
        const e = currentEntry(t);
        const active = t.id === state.activeTabId;
        return (
          <div key={t.id} className={`tab${active ? ' active' : ''}`}>
            <button role="tab" aria-selected={active} className="tab-main" onClick={() => runCommand({ type: 'selectTab', id: t.id })} title={`${e.title} · ${displayUrl(e.url)}`}>
              {e.title}
            </button>
            <button className="tab-close" aria-label={`Close ${e.title}`} onClick={() => runCommand({ type: 'closeTab', id: t.id })}><Icon name="close" size={14} /></button>
          </div>
        );
      })}
      <IconButton icon="plus" label="New tab" disabled={state.tabs.length >= MAX_TABS}
        title={state.tabs.length >= MAX_TABS ? `Tab limit (${MAX_TABS}) reached` : 'New tab'} onClick={() => runCommand({ type: 'newTab' })} />
    </div>
  );
}
