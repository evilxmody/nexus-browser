import { activeTab, currentEntry } from '@nexus/browser';
import { NEWTAB_URL, isNavigableUrl, normalizeAllowEntry, resolveInput } from '@nexus/shared';
import { browser, pages, settings } from './runtime';
import { closeRoute } from './router';
import { toast } from './toast';
import { MAX_TABS } from '@nexus/browser';

const searchTitle = (raw: string) => `Search: ${raw.trim().slice(0, 150)}`;

/** Re-requests the active tab's page. On a blocked/unsupported page this re-evaluates the embed decision. */
export function reloadActive(): boolean {
  const tab = activeTab(browser.getState());
  if (currentEntry(tab).url === NEWTAB_URL) return false;
  pages.dispatch({ type: 'frame/reload', tabId: tab.id });
  return true;
}

/** Resolves typed input and navigates the active tab. Returns an error message or null. Re-entering the current URL reloads it. */
export function submitInput(raw: string): string | null {
  const r = resolveInput(raw, settings.getState().searchEngine);
  if (!r.ok) return r.error;
  const cur = currentEntry(activeTab(browser.getState())).url;
  if (r.url === cur) {
    reloadActive();
    closeRoute();
    return null;
  }
  if (!browser.navigate(r.url, r.kind === 'search' ? searchTitle(raw) : undefined)) return 'That address is not allowed.';
  closeRoute();
  return null;
}

export function openUrl(url: string) {
  if (browser.navigate(url)) closeRoute();
}

/** Opens a validated URL in a new foreground tab. Returns false (and says why) when it cannot. */
export function openUrlInNewTab(url: string, title?: string): boolean {
  if (!isNavigableUrl(url) || url === NEWTAB_URL) { toast('That address is not allowed.', 'error'); return false; }
  const id = browser.newTab({ url, title });
  if (id === null) { toast(`Tab limit (${MAX_TABS}) reached. Close a tab first.`, 'error'); return false; }
  closeRoute();
  return true;
}

export function goHome() {
  const target = settings.getState().homeUrl || NEWTAB_URL;
  if (currentEntry(activeTab(browser.getState())).url !== target) browser.navigate(target);
  closeRoute();
}

export function isAtHome(): boolean {
  const target = settings.getState().homeUrl || NEWTAB_URL;
  return currentEntry(activeTab(browser.getState())).url === target;
}

/** Adds a site to the person's embedding list. Returns an error message or null. */
export function allowEmbedding(site: string): string | null {
  const n = normalizeAllowEntry(site);
  if (!n.ok) return n.error;
  const list = settings.getState().embedAllow;
  if (!list.includes(n.entry)) settings.dispatch({ embedAllow: [...list, n.entry] });
  return null;
}
export function removeEmbedding(entry: string) {
  settings.dispatch({ embedAllow: settings.getState().embedAllow.filter((e) => e !== entry) });
}
