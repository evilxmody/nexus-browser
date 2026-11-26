import { describe, expect, it } from 'vitest';
import { NEWTAB_URL } from '@nexus/shared';
import {
  MAX_ENTRIES_PER_TAB, MAX_TABS, activeTab, canGoBack, canGoForward, createBrowser, currentEntry, isBookmarked,
} from '@nexus/browser';

const A = 'https://a.example/';
const B = 'https://b.example/';
const C = 'https://c.example/';

describe('tabs', () => {
  it('starts with one active new tab', () => {
    const s = createBrowser().getState();
    expect(s.tabs).toHaveLength(1);
    expect(currentEntry(activeTab(s)).url).toBe(NEWTAB_URL);
    expect(s.history).toHaveLength(0);
  });
  it('opens, selects and closes tabs, picking a neighbour', () => {
    const b = createBrowser();
    const t1 = b.getState().activeTabId;
    const t2 = b.newTab()!;
    const t3 = b.newTab()!;
    expect(b.getState().activeTabId).toBe(t3);
    b.selectTab(t2);
    b.closeTab(t2);
    expect(b.getState().tabs.map((t) => t.id)).toEqual([t1, t3]);
    expect(b.getState().activeTabId).toBe(t3);
    b.closeTab(t1);
    expect(b.getState().activeTabId).toBe(t3);
  });
  it('closing the last tab leaves a fresh new tab', () => {
    const b = createBrowser();
    const only = b.getState().activeTabId;
    b.navigate(A);
    b.closeTab(only);
    const s = b.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]!.id).not.toBe(only);
    expect(currentEntry(activeTab(s)).url).toBe(NEWTAB_URL);
  });
  it('enforces the tab limit and ignores unsafe URLs', () => {
    const b = createBrowser();
    for (let i = 1; i < MAX_TABS; i++) expect(b.newTab()).not.toBeNull();
    expect(b.newTab()).toBeNull();
    expect(b.getState().tabs).toHaveLength(MAX_TABS);
    expect(createBrowser().newTab({ url: 'javascript:alert(1)' })).toBeNull();
  });
  it('opens background tabs without switching', () => {
    const b = createBrowser();
    const first = b.getState().activeTabId;
    b.newTab({ url: A, background: true });
    expect(b.getState().activeTabId).toBe(first);
    expect(b.getState().tabs).toHaveLength(2);
  });
});

describe('navigation', () => {
  it('pushes entries, titles default to host, and records history', () => {
    const b = createBrowser();
    expect(b.navigate('https://www.a.example/x')).toBe(true);
    const s = b.getState();
    expect(currentEntry(activeTab(s)).title).toBe('a.example');
    expect(s.history[0]!.url).toBe('https://www.a.example/x');
  });
  it('back / forward and truncating forward history on new navigation', () => {
    const b = createBrowser();
    b.navigate(A); b.navigate(B); b.navigate(C);
    b.back(); b.back();
    expect(currentEntry(activeTab(b.getState())).url).toBe(A);
    expect(canGoForward(activeTab(b.getState()))).toBe(true);
    b.forward();
    expect(currentEntry(activeTab(b.getState())).url).toBe(B);
    b.navigate('https://d.example/');
    const t = activeTab(b.getState());
    expect(canGoForward(t)).toBe(false);
    expect(t.entries.map((e) => e.url)).toEqual([NEWTAB_URL, A, B, 'https://d.example/']);
    b.back(); b.back(); b.back();
    expect(canGoBack(activeTab(b.getState()))).toBe(false);
    b.back();
    expect(activeTab(b.getState()).index).toBe(0);
  });
  it('does not duplicate consecutive visits or re-push the same URL', () => {
    const b = createBrowser();
    b.navigate(A); b.navigate(A);
    expect(b.getState().history).toHaveLength(1);
    expect(activeTab(b.getState()).entries).toHaveLength(2);
  });
  it('back/forward do not add history entries', () => {
    const b = createBrowser();
    b.navigate(A); b.navigate(B); b.back(); b.forward();
    expect(b.getState().history).toHaveLength(2);
  });
  it('rejects unsafe URLs without changing state', () => {
    const b = createBrowser();
    const before = b.getState();
    expect(b.navigate('javascript:alert(1)')).toBe(false);
    expect(b.navigate('file:///etc/passwd')).toBe(false);
    expect(b.navigate('https://u:p@x.example')).toBe(false);
    expect(b.getState()).toBe(before);
  });
  it('navigating to the new tab page is allowed and not recorded in history', () => {
    const b = createBrowser();
    b.navigate(A); b.navigate(NEWTAB_URL);
    expect(currentEntry(activeTab(b.getState())).url).toBe(NEWTAB_URL);
    expect(b.getState().history.every((v) => v.url !== NEWTAB_URL)).toBe(true);
  });
  it('caps per-tab entries', () => {
    const b = createBrowser();
    for (let i = 0; i < MAX_ENTRIES_PER_TAB + 20; i++) b.navigate(`https://x.example/${i}`);
    const t = activeTab(b.getState());
    expect(t.entries).toHaveLength(MAX_ENTRIES_PER_TAB);
    expect(t.index).toBe(MAX_ENTRIES_PER_TAB - 1);
  });
  it('setTitle updates entry and latest visit, ignores blanks', () => {
    const b = createBrowser();
    b.navigate(A);
    b.setTitle('  Hello   World ');
    expect(currentEntry(activeTab(b.getState())).title).toBe('Hello World');
    expect(b.getState().history[0]!.title).toBe('Hello World');
    const before = b.getState();
    b.setTitle('   ');
    expect(b.getState()).toBe(before);
  });
});

describe('bookmarks and history', () => {
  it('toggles bookmarks and refuses the new tab page', () => {
    const b = createBrowser();
    b.toggleBookmark(A, 'A');
    expect(isBookmarked(b.getState(), A)).toBe(true);
    b.toggleBookmark(A, 'A');
    expect(b.getState().bookmarks).toHaveLength(0);
    b.toggleBookmark(NEWTAB_URL, 'x');
    b.toggleBookmark('javascript:alert(1)', 'x');
    expect(b.getState().bookmarks).toHaveLength(0);
  });
  it('removes a bookmark by id', () => {
    const b = createBrowser();
    b.toggleBookmark(A, 'A'); b.toggleBookmark(B, 'B');
    b.removeBookmark(b.getState().bookmarks[0]!.id);
    expect(b.getState().bookmarks.map((x) => x.url)).toEqual([A]);
  });
  it('removes and clears history', () => {
    const b = createBrowser();
    b.navigate(A); b.navigate(B);
    b.removeVisit(b.getState().history[0]!.id);
    expect(b.getState().history.map((v) => v.url)).toEqual([A]);
    b.clearHistory();
    expect(b.getState().history).toHaveLength(0);
    const s = b.getState();
    b.clearHistory();
    expect(b.getState()).toBe(s);
  });
});
