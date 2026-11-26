import { describe, expect, it } from 'vitest';
import {
  activeTab, createBrowser, createPageRuntime, frameFor, initialPages, pageKey, pagesReducer, currentEntry, type PagesState,
} from '@nexus/browser';

const A = 'https://a.example/';
const B = 'https://b.example/';

describe('page key (what makes a navigation "new")', () => {
  it('changes on navigate, back, forward and reload, and is stable otherwise', () => {
    const b = createBrowser();
    const rt = createPageRuntime();
    const key = () => pageKey(activeTab(b.getState()), rt.getState().reloads);
    const k0 = key();
    expect(key()).toBe(k0);
    b.navigate(A); const k1 = key();
    b.navigate(B); const k2 = key();
    b.back(); const k3 = key();
    b.forward(); const k4 = key();
    rt.dispatch({ type: 'frame/reload', tabId: activeTab(b.getState()).id }); const k5 = key();
    expect(k1).not.toBe(k0);
    expect(k2).not.toBe(k1);
    expect(k3).toBe(k1); // back returns to the first page's entry
    expect(k4).toBe(k2);
    expect(k5).not.toBe(k4); // reload is a new navigation of the same entry
  });
});

describe('frame status', () => {
  const key = 't|1|https://a.example/|0';
  const start = (): PagesState => pagesReducer(initialPages(), { type: 'frame/begin', tabId: 't', key });
  it('starts as loading, and load only means "loaded", never "verified"', () => {
    let s = start();
    expect(frameFor(s, 't', key).status).toBe('loading');
    s = pagesReducer(s, { type: 'frame/load', tabId: 't', key });
    expect(frameFor(s, 't', key).status).toBe('loaded');
    s = pagesReducer(s, { type: 'frame/verified', tabId: 't', key });
    expect(frameFor(s, 't', key).status).toBe('verified');
  });
  it('a late load recovers a timeout; errors never overwrite a loaded page', () => {
    let s = pagesReducer(start(), { type: 'frame/error', tabId: 't', key, error: 'timeout' });
    expect(frameFor(s, 't', key)).toMatchObject({ status: 'error', error: 'timeout' });
    s = pagesReducer(s, { type: 'frame/load', tabId: 't', key });
    expect(frameFor(s, 't', key).status).toBe('loaded');
    const after = pagesReducer(s, { type: 'frame/error', tabId: 't', key, error: 'offline' });
    expect(after).toBe(s);
  });
  it('ignores events from a stale navigation', () => {
    const s = start();
    const stale = 't|0|https://old.example/|0';
    expect(pagesReducer(s, { type: 'frame/load', tabId: 't', key: stale })).toBe(s);
    expect(pagesReducer(s, { type: 'frame/error', tabId: 't', key: stale, error: 'timeout' })).toBe(s);
    expect(frameFor(s, 't', stale).status).toBe('loading');
  });
  it('reload clears the frame and bumps only that tab', () => {
    let s = pagesReducer(start(), { type: 'frame/load', tabId: 't', key });
    s = pagesReducer(s, { type: 'frame/reload', tabId: 't' });
    expect(s.frames['t']).toBeUndefined();
    expect(s.reloads).toEqual({ t: 1 });
  });
  it('prunes closed tabs and dismisses hints once per host', () => {
    let s = pagesReducer(start(), { type: 'frame/reload', tabId: 'gone' });
    s = pagesReducer(s, { type: 'frame/prune', tabIds: ['t'] });
    expect(Object.keys(s.reloads)).toEqual([]);
    expect(Object.keys(s.frames)).toEqual(['t']);
    expect(pagesReducer(s, { type: 'frame/prune', tabIds: ['t'] })).toBe(s);
    const d = pagesReducer(s, { type: 'hint/dismiss', host: 'a.example' });
    expect(pagesReducer(d, { type: 'hint/dismiss', host: 'a.example' })).toBe(d);
  });
});

describe('tab isolation', () => {
  it('each tab keeps its own URL, history and reload counter', () => {
    const b = createBrowser();
    const rt = createPageRuntime();
    const t1 = b.getState().activeTabId;
    b.navigate(A); b.navigate(B);
    const t2 = b.newTab({ url: 'https://c.example/' })!;
    b.navigate('https://d.example/');
    rt.dispatch({ type: 'frame/reload', tabId: t2 });
    const s = b.getState();
    const tab1 = s.tabs.find((t) => t.id === t1)!;
    const tab2 = s.tabs.find((t) => t.id === t2)!;
    expect(tab1.entries.map((e) => e.url)).toEqual(['nexus://newtab', A, B]);
    expect(tab2.entries.map((e) => e.url)).toEqual(['https://c.example/', 'https://d.example/']);
    expect(rt.getState().reloads).toEqual({ [t2]: 1 });
    b.back(t2);
    expect(currentEntry(b.getState().tabs.find((t) => t.id === t2)!).url).toBe('https://c.example/');
    expect(currentEntry(b.getState().tabs.find((t) => t.id === t1)!).url).toBe(B);
    b.closeTab(t2);
    expect(b.getState().tabs.find((t) => t.id === t1)!.entries).toHaveLength(3);
  });
});
