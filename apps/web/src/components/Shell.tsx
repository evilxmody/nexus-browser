import { useEffect, useState } from 'react';
import { MAX_TABS, activeTab, canGoBack, canGoForward, currentEntry } from '@nexus/browser';
import { NEWTAB_URL } from '@nexus/shared';
import { IconButton } from '@nexus/ui';
import { browser } from '../runtime';
import { useStore, useVisualViewport } from '../hooks';
import { closeRoute, useRoute } from '../router';
import { isAtHome } from '../actions';
import { runCommand } from '../commands';
import { settings } from '../runtime';
import { AddressBar, TabStrip } from './Chrome';
import { MenuSheet } from './MenuSheet';
import { Viewport, useActiveStatus } from './PageView';
import { BookmarksPanel, HistoryPanel, SettingsPanel, TabsPanel } from './Panels';
import { Toasts } from './Toasts';
import { GesturePreview } from './GesturePreview';

function NavButtons({ withMenu, onMenu }: { withMenu?: boolean; onMenu: () => void }) {
  const state = useStore(browser);
  useStore(settings); // home availability depends on the home page setting
  const tab = activeTab(state);
  const isNew = currentEntry(tab).url === NEWTAB_URL;
  return (
    <>
      <IconButton icon="back" label="Back" onClick={() => runCommand({ type: 'back' })} disabled={!canGoBack(tab)} />
      <IconButton icon="forward" label="Forward" onClick={() => runCommand({ type: 'forward' })} disabled={!canGoForward(tab)} />
      <IconButton icon="reload" label="Reload" onClick={() => runCommand({ type: 'reload' })} disabled={isNew} />
      <IconButton icon="home" label="Home" onClick={() => runCommand({ type: 'home' })} disabled={isAtHome()} />
      {withMenu && (
        <>
          <IconButton icon="plus" label="New tab" disabled={state.tabs.length >= MAX_TABS} onClick={() => runCommand({ type: 'newTab' })} />
          <IconButton icon="tabs" label={`Tabs (${state.tabs.length})`} badge={state.tabs.length} onClick={() => runCommand({ type: 'showTabs' })} />
          <IconButton icon="menu" label="Menu" onClick={onMenu} />
        </>
      )}
    </>
  );
}

export function Shell() {
  const state = useStore(browser);
  const route = useRoute();
  const [menu, setMenu] = useState(false);
  const status = useActiveStatus();
  useVisualViewport();
  const tab = activeTab(state);
  const entry = currentEntry(tab);

  useEffect(() => {
    document.title = entry.url === NEWTAB_URL ? 'NEXUS Browser' : `${entry.title} – NEXUS`;
  }, [entry.url, entry.title]);

  return (
    <div className="app">
      <TabStrip />
      <header className="topbar">
        <div className="cluster desktop-only"><NavButtons onMenu={() => setMenu(true)} /></div>
        <AddressBar />
        <div className="cluster desktop-only">
          <IconButton icon="tabs" label={`Tabs (${state.tabs.length})`} badge={state.tabs.length} onClick={() => runCommand({ type: 'showTabs' })} />
          <IconButton icon="menu" label="Menu" onClick={() => setMenu(true)} />
        </div>
      </header>
      <div className={`progress${status === 'loading' ? ' on' : ''}`} role="progressbar" aria-hidden={status !== 'loading'} aria-label="Page loading" />
      <main className="viewport" aria-hidden={route !== 'browse'}>
        <Viewport />
      </main>
      {route !== 'browse' && (
        <div className="panel-layer" onMouseDown={(e) => e.target === e.currentTarget && closeRoute()}>
          {route === 'tabs' && <TabsPanel />}
          {route === 'bookmarks' && <BookmarksPanel />}
          {route === 'history' && <HistoryPanel />}
          {route === 'settings' && <SettingsPanel />}
        </div>
      )}
      <nav className="bottombar mobile-only" aria-label="Browser controls">
        <NavButtons withMenu onMenu={() => setMenu(true)} />
      </nav>
      {menu && <MenuSheet onClose={() => setMenu(false)} />}
      <Toasts />
      <GesturePreview />
    </div>
  );
}
