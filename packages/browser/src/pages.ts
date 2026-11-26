import { createStore, type Store } from '@nexus/core';
import { currentEntry } from './reducer';
import type { Tab } from './types';

/**
 * Runtime (never persisted) state of each tab's embedded frame.
 *
 * `loaded` means "the frame fired its load event". It is NOT proof that the site rendered: browsers also fire load for
 * their own "refused to connect" page. Only `verified` (the page itself said hello through the bridge) is proof.
 */
export type FrameStatus = 'loading' | 'loaded' | 'verified' | 'error';
export type FrameError = 'timeout' | 'offline' | 'load-error';
export interface FrameState { key: string; status: FrameStatus; error?: FrameError }

export interface PagesState {
  frames: Record<string, FrameState>;
  /** Reload counter per tab. It is part of the frame key, so bumping it remounts (reloads) the frame. */
  reloads: Record<string, number>;
  /** Hosts whose "page may be blank" hint was dismissed this session. */
  hintsDismissed: Record<string, true>;
}

export type PageAction =
  | { type: 'frame/begin'; tabId: string; key: string }
  | { type: 'frame/load'; tabId: string; key: string }
  | { type: 'frame/verified'; tabId: string; key: string }
  | { type: 'frame/error'; tabId: string; key: string; error: FrameError }
  | { type: 'frame/reload'; tabId: string }
  | { type: 'frame/prune'; tabIds: string[] }
  | { type: 'hint/dismiss'; host: string };

export const initialPages = (): PagesState => ({ frames: {}, reloads: {}, hintsDismissed: {} });

/** Identity of "this navigation of this tab". Back/forward, new URLs and reloads all produce a new key. */
export function pageKey(tab: Tab, reloads: Record<string, number> = {}): string {
  return `${tab.id}|${tab.index}|${currentEntry(tab).url}|${reloads[tab.id] ?? 0}`;
}

export function frameFor(s: PagesState, tabId: string, key: string): FrameState {
  const f = s.frames[tabId];
  return f && f.key === key ? f : { key, status: 'loading' };
}

const setFrame = (s: PagesState, tabId: string, f: FrameState): PagesState => ({ ...s, frames: { ...s.frames, [tabId]: f } });

export function pagesReducer(s: PagesState, a: PageAction): PagesState {
  switch (a.type) {
    case 'frame/begin':
      return s.frames[a.tabId]?.key === a.key ? s : setFrame(s, a.tabId, { key: a.key, status: 'loading' });
    case 'frame/load': {
      const f = s.frames[a.tabId];
      if (!f || f.key !== a.key || f.status === 'loaded' || f.status === 'verified') return s;
      return setFrame(s, a.tabId, { key: a.key, status: 'loaded' }); // a late load also recovers a timeout
    }
    case 'frame/verified': {
      const f = s.frames[a.tabId];
      if (!f || f.key !== a.key || f.status === 'verified') return s;
      return setFrame(s, a.tabId, { key: a.key, status: 'verified' });
    }
    case 'frame/error': {
      const f = s.frames[a.tabId];
      if (!f || f.key !== a.key || f.status !== 'loading') return s;
      return setFrame(s, a.tabId, { key: a.key, status: 'error', error: a.error });
    }
    case 'frame/reload': {
      const { [a.tabId]: _gone, ...frames } = s.frames;
      return { ...s, frames, reloads: { ...s.reloads, [a.tabId]: (s.reloads[a.tabId] ?? 0) + 1 } };
    }
    case 'frame/prune': {
      const keep = new Set(a.tabIds);
      const stale = Object.keys(s.frames).some((id) => !keep.has(id)) || Object.keys(s.reloads).some((id) => !keep.has(id));
      if (!stale) return s;
      const pick = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([id]) => keep.has(id)));
      return { ...s, frames: pick(s.frames), reloads: pick(s.reloads) };
    }
    case 'hint/dismiss':
      return s.hintsDismissed[a.host] ? s : { ...s, hintsDismissed: { ...s.hintsDismissed, [a.host]: true } };
    default:
      return s;
  }
}

export type PageRuntime = Store<PagesState, PageAction>;
export function createPageRuntime(): PageRuntime {
  return createStore<PagesState, PageAction>(initialPages(), pagesReducer);
}
