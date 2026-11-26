export const MAX_TABS = 20;
export const MAX_HISTORY = 1000;
export const MAX_ENTRIES_PER_TAB = 100;
export const MAX_BOOKMARKS = 500;

export interface HistoryEntry { url: string; title: string }
/** A tab owns a back/forward stack. `index` points at the current entry. */
export interface Tab { id: string; entries: HistoryEntry[]; index: number; createdAt: number }
export interface Visit { id: string; url: string; title: string; visitedAt: number }
export interface Bookmark { id: string; url: string; title: string; createdAt: number }

export interface BrowserState {
  tabs: Tab[];
  activeTabId: string;
  history: Visit[];
  bookmarks: Bookmark[];
}

export type Action =
  | { type: 'tab/new'; id: string; now: number; url?: string; title?: string; background?: boolean }
  | { type: 'tab/close'; id: string; replacementId: string; now: number }
  | { type: 'tab/select'; id: string }
  | { type: 'nav/go'; tabId: string; url: string; title?: string; visitId: string; now: number }
  | { type: 'nav/back'; tabId: string }
  | { type: 'nav/forward'; tabId: string }
  | { type: 'nav/setTitle'; tabId: string; title: string }
  | { type: 'bookmark/toggle'; id: string; url: string; title: string; now: number }
  | { type: 'bookmark/remove'; id: string }
  | { type: 'history/remove'; id: string }
  | { type: 'history/clear' };
