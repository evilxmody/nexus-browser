import { NEWTAB_URL, cleanTitle, hostOf, isNavigableUrl } from '@nexus/shared';
import {
  MAX_BOOKMARKS, MAX_ENTRIES_PER_TAB, MAX_HISTORY, MAX_TABS,
  type Action, type BrowserState, type HistoryEntry, type Tab, type Visit,
} from './types';

export const newTabEntry = (): HistoryEntry => ({ url: NEWTAB_URL, title: 'New Tab' });

export function createTab(id: string, now: number, entry: HistoryEntry = newTabEntry()): Tab {
  return { id, entries: [entry], index: 0, createdAt: now };
}
export function createInitialState(id: string, now: number): BrowserState {
  return { tabs: [createTab(id, now)], activeTabId: id, history: [], bookmarks: [] };
}

export function currentEntry(tab: Tab): HistoryEntry {
  return tab.entries[tab.index] ?? newTabEntry();
}
export const canGoBack = (t: Tab) => t.index > 0;
export const canGoForward = (t: Tab) => t.index < t.entries.length - 1;
export function activeTab(s: BrowserState): Tab {
  return s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0]!;
}
export const isBookmarked = (s: BrowserState, url: string) => s.bookmarks.some((b) => b.url === url);

const entryFor = (url: string, title?: string): HistoryEntry => ({
  url,
  title: url === NEWTAB_URL ? 'New Tab' : cleanTitle(title, hostOf(url) || url),
});

function recordVisit(history: Visit[], url: string, title: string, id: string, now: number): Visit[] {
  if (url === NEWTAB_URL) return history;
  const top = history[0];
  if (top && top.url === url) return [{ ...top, title, visitedAt: now }, ...history.slice(1)];
  return [{ id, url, title, visitedAt: now }, ...history].slice(0, MAX_HISTORY);
}

function pushEntry(tab: Tab, entry: HistoryEntry): Tab {
  if (currentEntry(tab).url === entry.url) {
    const entries = tab.entries.slice();
    entries[tab.index] = entry;
    return { ...tab, entries };
  }
  const entries = [...tab.entries.slice(0, tab.index + 1), entry].slice(-MAX_ENTRIES_PER_TAB);
  return { ...tab, entries, index: entries.length - 1 };
}

const mapTab = (s: BrowserState, id: string, fn: (t: Tab) => Tab): BrowserState => {
  if (!s.tabs.some((t) => t.id === id)) return s;
  return { ...s, tabs: s.tabs.map((t) => (t.id === id ? fn(t) : t)) };
};

export function reducer(s: BrowserState, a: Action): BrowserState {
  switch (a.type) {
    case 'tab/new': {
      if (s.tabs.length >= MAX_TABS || s.tabs.some((t) => t.id === a.id)) return s;
      if (a.url !== undefined && !isNavigableUrl(a.url)) return s;
      const entry = a.url ? entryFor(a.url, a.title) : newTabEntry();
      return {
        ...s,
        tabs: [...s.tabs, createTab(a.id, a.now, entry)],
        activeTabId: a.background ? s.activeTabId : a.id,
        history: recordVisit(s.history, entry.url, entry.title, `v-${a.id}`, a.now),
      };
    }
    case 'tab/close': {
      const i = s.tabs.findIndex((t) => t.id === a.id);
      if (i < 0) return s;
      const tabs = s.tabs.filter((t) => t.id !== a.id);
      if (tabs.length === 0) {
        return { ...s, tabs: [createTab(a.replacementId, a.now)], activeTabId: a.replacementId };
      }
      const activeTabId = s.activeTabId === a.id ? tabs[Math.min(i, tabs.length - 1)]!.id : s.activeTabId;
      return { ...s, tabs, activeTabId };
    }
    case 'tab/select':
      return s.activeTabId === a.id || !s.tabs.some((t) => t.id === a.id) ? s : { ...s, activeTabId: a.id };
    case 'nav/go': {
      if (!isNavigableUrl(a.url)) return s;
      const entry = entryFor(a.url, a.title);
      const next = mapTab(s, a.tabId, (t) => pushEntry(t, entry));
      if (next === s) return s;
      return { ...next, history: recordVisit(s.history, entry.url, entry.title, a.visitId, a.now) };
    }
    case 'nav/back':
      return mapTab(s, a.tabId, (t) => (canGoBack(t) ? { ...t, index: t.index - 1 } : t));
    case 'nav/forward':
      return mapTab(s, a.tabId, (t) => (canGoForward(t) ? { ...t, index: t.index + 1 } : t));
    case 'nav/setTitle': {
      const title = cleanTitle(a.title, '');
      if (!title) return s;
      const tab = s.tabs.find((t) => t.id === a.tabId);
      if (!tab) return s;
      const cur = currentEntry(tab);
      if (cur.url === NEWTAB_URL || cur.title === title) return s;
      const next = mapTab(s, a.tabId, (t) => {
        const entries = t.entries.slice();
        entries[t.index] = { ...cur, title };
        return { ...t, entries };
      });
      return { ...next, history: s.history.map((v, i) => (i === 0 && v.url === cur.url ? { ...v, title } : v)) };
    }
    case 'bookmark/toggle': {
      if (a.url === NEWTAB_URL || !isNavigableUrl(a.url)) return s;
      if (isBookmarked(s, a.url)) return { ...s, bookmarks: s.bookmarks.filter((b) => b.url !== a.url) };
      const b = { id: a.id, url: a.url, title: cleanTitle(a.title, hostOf(a.url) || a.url), createdAt: a.now };
      return { ...s, bookmarks: [b, ...s.bookmarks].slice(0, MAX_BOOKMARKS) };
    }
    case 'bookmark/remove':
      return s.bookmarks.some((b) => b.id === a.id) ? { ...s, bookmarks: s.bookmarks.filter((b) => b.id !== a.id) } : s;
    case 'history/remove':
      return s.history.some((v) => v.id === a.id) ? { ...s, history: s.history.filter((v) => v.id !== a.id) } : s;
    case 'history/clear':
      return s.history.length ? { ...s, history: [] } : s;
    default:
      return s;
  }
}
