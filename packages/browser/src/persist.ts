import type { Store, StorageAdapter } from '@nexus/core';
import { cleanTitle, generateId, hostOf, isNavigableUrl, isRecord, NEWTAB_URL } from '@nexus/shared';
import {
  MAX_BOOKMARKS, MAX_ENTRIES_PER_TAB, MAX_HISTORY, MAX_TABS,
  type Action, type BrowserState, type Bookmark, type HistoryEntry, type Tab, type Visit,
} from './types';
import { createInitialState, newTabEntry } from './reducer';

export const BROWSER_KEY = 'nexus.browser.v1';
const VERSION = 1;

export function serializeState(s: BrowserState): string {
  return JSON.stringify({ v: VERSION, tabs: s.tabs, activeTabId: s.activeTabId, history: s.history, bookmarks: s.bookmarks });
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function sanitizeEntries(raw: unknown): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const e of arr(raw)) {
    if (!isRecord(e) || !isNavigableUrl(e.url)) continue;
    out.push({ url: e.url, title: e.url === NEWTAB_URL ? 'New Tab' : cleanTitle(e.title, hostOf(e.url) || e.url) });
  }
  return out.slice(-MAX_ENTRIES_PER_TAB);
}

/** Never trusts stored data: every URL is re-validated and structure is repaired. */
export function deserializeState(raw: string, now = Date.now()): { state: BrowserState; recovered: boolean } {
  const fresh = () => ({ state: createInitialState(generateId(), now), recovered: true });
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return fresh();
  }
  if (!isRecord(data) || data.v !== VERSION) return fresh();

  const seen = new Set<string>();
  const tabs: Tab[] = [];
  for (const t of arr(data.tabs)) {
    if (!isRecord(t) || typeof t.id !== 'string' || !t.id || seen.has(t.id) || tabs.length >= MAX_TABS) continue;
    seen.add(t.id);
    let entries = sanitizeEntries(t.entries);
    if (entries.length === 0) entries = [newTabEntry()];
    const idx = Math.trunc(num(t.index, entries.length - 1));
    tabs.push({ id: t.id, entries, index: Math.min(Math.max(idx, 0), entries.length - 1), createdAt: num(t.createdAt, now) });
  }
  if (tabs.length === 0) return fresh();

  const history: Visit[] = [];
  for (const v of arr(data.history)) {
    if (!isRecord(v) || typeof v.id !== 'string' || !isNavigableUrl(v.url) || v.url === NEWTAB_URL) continue;
    history.push({ id: v.id, url: v.url, title: cleanTitle(v.title, hostOf(v.url)), visitedAt: num(v.visitedAt, now) });
  }
  const bookmarks: Bookmark[] = [];
  for (const b of arr(data.bookmarks)) {
    if (!isRecord(b) || typeof b.id !== 'string' || !isNavigableUrl(b.url) || b.url === NEWTAB_URL) continue;
    if (bookmarks.some((x) => x.url === b.url)) continue;
    bookmarks.push({ id: b.id, url: b.url, title: cleanTitle(b.title, hostOf(b.url)), createdAt: num(b.createdAt, now) });
  }
  const activeTabId = typeof data.activeTabId === 'string' && seen.has(data.activeTabId) ? data.activeTabId : tabs[0]!.id;
  return {
    state: { tabs, activeTabId, history: history.slice(0, MAX_HISTORY), bookmarks: bookmarks.slice(0, MAX_BOOKMARKS) },
    recovered: false,
  };
}

export interface LoadResult { state: BrowserState; recovered: boolean; error?: string }

export async function loadBrowserState(adapter: StorageAdapter, key = BROWSER_KEY): Promise<LoadResult> {
  try {
    const raw = await adapter.get(key);
    if (raw === null) return { state: createInitialState(generateId(), Date.now()), recovered: false };
    return deserializeState(raw);
  } catch {
    return {
      state: createInitialState(generateId(), Date.now()),
      recovered: false,
      error: 'Storage is unavailable; tabs, history and bookmarks will not be saved.',
    };
  }
}

/** Debounced write-behind persistence. Returns flush (call on pagehide) and dispose. */
export function connectPersistence(
  store: Store<BrowserState, Action>,
  adapter: StorageAdapter,
  opts: { debounceMs?: number; key?: string; onError?: (m: string) => void } = {},
) {
  const { debounceMs = 300, key = BROWSER_KEY, onError } = opts;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  const write = async () => {
    timer = undefined;
    if (!dirty) return;
    dirty = false;
    try {
      await adapter.set(key, serializeState(store.getState()));
    } catch {
      onError?.('Could not save your browsing data on this device.');
    }
  };
  const unsubscribe = store.subscribe(() => {
    dirty = true;
    if (timer === undefined) timer = setTimeout(write, debounceMs);
  });
  return {
    flush: () => {
      if (timer !== undefined) clearTimeout(timer);
      return write();
    },
    dispose: () => {
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
