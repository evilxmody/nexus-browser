import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryAdapter, createSettingsStore, createStore, loadSettings, persistSettings, sanitizeSettings } from '@nexus/core';
import {
  BROWSER_KEY, activeTab, connectPersistence, createBrowser, deserializeState, loadBrowserState, serializeState,
} from '@nexus/browser';

afterEach(() => vi.useRealTimers());

describe('browser persistence', () => {
  it('round-trips state', () => {
    const b = createBrowser();
    b.navigate('https://a.example/'); b.newTab({ url: 'https://b.example/' }); b.toggleBookmark('https://a.example/', 'A');
    const { state, recovered } = deserializeState(serializeState(b.getState()));
    expect(recovered).toBe(false);
    expect(state).toEqual(b.getState());
  });
  it('recovers from corrupt JSON and wrong versions', () => {
    expect(deserializeState('{nope').recovered).toBe(true);
    expect(deserializeState(JSON.stringify({ v: 99 })).recovered).toBe(true);
    expect(deserializeState('"str"').state.tabs).toHaveLength(1);
  });
  it('strips unsafe URLs and repairs structure from stored data', () => {
    const raw = JSON.stringify({
      v: 1, activeTabId: 'ghost',
      tabs: [
        { id: 't1', index: 99, entries: [{ url: 'javascript:alert(1)', title: 'x' }, { url: 'https://ok.example/', title: 5 }] },
        { id: 't1', entries: [] },
        { id: 't2', entries: [{ url: 'file:///etc/passwd' }] },
      ],
      history: [{ id: 'h', url: 'data:text/html,x', title: 'x', visitedAt: 1 }, { id: 'h2', url: 'https://ok.example/', title: 'ok', visitedAt: 2 }],
      bookmarks: [{ id: 'b', url: 'https://ok.example/', title: 'ok' }, { id: 'b2', url: 'https://ok.example/', title: 'dup' }, { id: 'b3', url: 'javascript:1' }],
    });
    const { state, recovered } = deserializeState(raw);
    expect(recovered).toBe(false);
    expect(state.tabs.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(state.tabs[0]!.entries.map((e) => e.url)).toEqual(['https://ok.example/']);
    expect(state.tabs[0]!.index).toBe(0);
    expect(state.tabs[1]!.entries[0]!.url).toBe('nexus://newtab');
    expect(state.activeTabId).toBe('t1');
    expect(state.history.map((v) => v.id)).toEqual(['h2']);
    expect(state.bookmarks.map((b) => b.id)).toEqual(['b']);
  });
  it('loads from an adapter, and survives a failing adapter', async () => {
    const b = createBrowser(); b.navigate('https://a.example/');
    const adapter = createMemoryAdapter({ [BROWSER_KEY]: serializeState(b.getState()) });
    const loaded = await loadBrowserState(adapter);
    expect(activeTab(loaded.state).entries.at(-1)!.url).toBe('https://a.example/');
    const broken = { get: async () => { throw new Error('denied'); }, set: async () => {}, remove: async () => {} };
    const r = await loadBrowserState(broken);
    expect(r.error).toBeTruthy();
    expect(r.state.tabs).toHaveLength(1);
  });
  it('debounces writes, flushes on demand and reports save errors', async () => {
    vi.useFakeTimers();
    const adapter = createMemoryAdapter();
    let writes = 0;
    const counting = { ...adapter, set: async (k: string, v: string) => { writes++; await adapter.set(k, v); } };
    const b = createBrowser();
    const p = connectPersistence(b.store, counting, { debounceMs: 100 });
    b.navigate('https://a.example/'); b.navigate('https://b.example/');
    expect(writes).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(writes).toBe(1);
    b.navigate('https://c.example/');
    await p.flush();
    expect(writes).toBe(2);
    expect(await adapter.get(BROWSER_KEY)).toContain('c.example');
    p.dispose();

    const errors: string[] = [];
    const failing = { get: async () => null, remove: async () => {}, set: async () => { throw new Error('quota'); } };
    const b2 = createBrowser();
    connectPersistence(b2.store, failing, { debounceMs: 10, onError: (m) => errors.push(m) });
    b2.navigate('https://a.example/');
    await vi.advanceTimersByTimeAsync(20);
    expect(errors).toHaveLength(1);
  });
});

describe('settings', () => {
  it('sanitizes input', () => {
    expect(sanitizeSettings(null)).toEqual({ searchEngine: 'duckduckgo', homeUrl: '', embedAllow: [], handGestures: false });
    expect(sanitizeSettings({ searchEngine: 'evil', homeUrl: 'javascript:alert(1)' })).toEqual({ searchEngine: 'duckduckgo', homeUrl: '', embedAllow: [], handGestures: false });
    expect(sanitizeSettings({ searchEngine: 'google', homeUrl: 'https://example.com/' })).toEqual({ searchEngine: 'google', homeUrl: 'https://example.com/', embedAllow: [], handGestures: false });
    expect(sanitizeSettings({ embedAllow: ['Example.com', 'example.com', 'javascript:1', 7, '*'] }).embedAllow).toEqual(['example.com']);
  });
  it('store applies patches, ignores invalid ones and persists', async () => {
    const adapter = createMemoryAdapter();
    const store = createSettingsStore();
    persistSettings(store, adapter);
    store.dispatch({ searchEngine: 'brave' });
    store.dispatch({ homeUrl: 'file:///x' });
    expect(store.getState()).toEqual({ searchEngine: 'brave', homeUrl: '', embedAllow: [], handGestures: false });
    store.dispatch({ embedAllow: ['example.com'] });
    const same = store.getState();
    store.dispatch({ embedAllow: ['example.com'] });
    expect(store.getState()).toBe(same);
    await Promise.resolve();
    expect((await loadSettings(adapter)).settings.searchEngine).toBe('brave');
  });
  it('recovers from corrupt settings', async () => {
    const r = await loadSettings(createMemoryAdapter({ 'nexus.settings.v1': '{bad' }));
    expect(r.recovered).toBe(true);
  });
});

describe('createStore', () => {
  it('notifies only on change and supports unsubscribe', () => {
    const s = createStore(0, (n: number, d: number) => (d === 0 ? n : n + d));
    let calls = 0;
    const off = s.subscribe(() => calls++);
    s.dispatch(0); s.dispatch(1);
    expect(calls).toBe(1);
    off(); s.dispatch(1);
    expect(calls).toBe(1);
  });
});
