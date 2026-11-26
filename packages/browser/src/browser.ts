import { createStore, type Store } from '@nexus/core';
import { generateId, isNavigableUrl } from '@nexus/shared';
import { MAX_TABS, type Action, type BrowserState } from './types';
import { createInitialState, reducer } from './reducer';

export interface Browser {
  store: Store<BrowserState, Action>;
  getState(): BrowserState;
  subscribe(l: () => void): () => void;
  /** Returns the new tab id, or null if the tab limit is reached / url is unsafe. */
  newTab(opts?: { url?: string; title?: string; background?: boolean }): string | null;
  closeTab(id: string): void;
  selectTab(id: string): void;
  /** Navigates a tab (default: active). Returns false if the URL is not allowed. */
  navigate(url: string, title?: string, tabId?: string): boolean;
  back(tabId?: string): void;
  forward(tabId?: string): void;
  setTitle(title: string, tabId?: string): void;
  toggleBookmark(url: string, title: string): void;
  removeBookmark(id: string): void;
  removeVisit(id: string): void;
  clearHistory(): void;
}

/** Imperative facade over the reducer: supplies ids and timestamps so the reducer stays pure. */
export function createBrowser(initial?: BrowserState): Browser {
  const store = createStore(initial ?? createInitialState(generateId(), Date.now()), reducer);
  const act = () => store.getState().activeTabId;
  return {
    store,
    getState: store.getState,
    subscribe: store.subscribe,
    newTab(opts = {}) {
      if (store.getState().tabs.length >= MAX_TABS) return null;
      if (opts.url !== undefined && !isNavigableUrl(opts.url)) return null;
      const id = generateId();
      store.dispatch({ type: 'tab/new', id, now: Date.now(), ...opts });
      return id;
    },
    closeTab: (id) => store.dispatch({ type: 'tab/close', id, replacementId: generateId(), now: Date.now() }),
    selectTab: (id) => store.dispatch({ type: 'tab/select', id }),
    navigate(url, title, tabId = act()) {
      if (!isNavigableUrl(url)) return false;
      store.dispatch({ type: 'nav/go', tabId, url, title, visitId: generateId(), now: Date.now() });
      return true;
    },
    back: (tabId = act()) => store.dispatch({ type: 'nav/back', tabId }),
    forward: (tabId = act()) => store.dispatch({ type: 'nav/forward', tabId }),
    setTitle: (title, tabId = act()) => store.dispatch({ type: 'nav/setTitle', tabId, title }),
    toggleBookmark: (url, title) =>
      store.dispatch({ type: 'bookmark/toggle', id: generateId(), url, title, now: Date.now() }),
    removeBookmark: (id) => store.dispatch({ type: 'bookmark/remove', id }),
    removeVisit: (id) => store.dispatch({ type: 'history/remove', id }),
    clearHistory: () => store.dispatch({ type: 'history/clear' }),
  };
}
