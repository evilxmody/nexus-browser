import { MAX_TABS, activeTab, canGoBack, canGoForward, currentEntry } from '@nexus/browser';
import { NEWTAB_URL } from '@nexus/shared';
import { browser } from './runtime';
import { goHome, openUrlInNewTab, reloadActive, submitInput } from './actions';
import { closeRoute, openRoute } from './router';
import { toast } from './toast';

/**
 * Every browser action the person can trigger goes through this one vocabulary.
 * Buttons use it today. Later input sources (eye tracking, hand gestures, voice) will emit the same commands, so
 * they can never do anything a button cannot, and no input source needs to know how tabs or history work.
 * Nothing in this file reads a camera or sensor.
 */
export type BrowserCommand =
  | { type: 'back' } | { type: 'forward' } | { type: 'reload' } | { type: 'home' }
  | { type: 'newTab' } | { type: 'closeTab'; id?: string } | { type: 'selectTab'; id: string }
  | { type: 'nextTab' } | { type: 'previousTab' } | { type: 'showTabs' } | { type: 'closePanel' }
  | { type: 'toggleBookmark' } | { type: 'navigate'; input: string } | { type: 'openInNewTab'; url: string };

export interface CommandResult { ok: boolean; message?: string }
const ok: CommandResult = { ok: true };
const no = (message: string): CommandResult => ({ ok: false, message });

export function runCommand(cmd: BrowserCommand): CommandResult {
  const s = browser.getState();
  const tab = activeTab(s);
  switch (cmd.type) {
    case 'back': return canGoBack(tab) ? (browser.back(), ok) : no('Nothing to go back to.');
    case 'forward': return canGoForward(tab) ? (browser.forward(), ok) : no('Nothing to go forward to.');
    case 'reload': return reloadActive() ? ok : no('There is no page to reload.');
    case 'home': goHome(); return ok;
    case 'newTab': {
      if (browser.newTab() === null) { toast(`Tab limit (${MAX_TABS}) reached. Close a tab first.`, 'error'); return no('Tab limit reached.'); }
      closeRoute();
      return ok;
    }
    case 'closeTab': browser.closeTab(cmd.id ?? tab.id); return ok;
    case 'selectTab': browser.selectTab(cmd.id); closeRoute(); return ok;
    case 'nextTab':
    case 'previousTab': {
      const i = s.tabs.findIndex((t) => t.id === s.activeTabId);
      const n = s.tabs.length;
      browser.selectTab(s.tabs[(i + (cmd.type === 'nextTab' ? 1 : n - 1)) % n]!.id);
      return ok;
    }
    case 'showTabs': openRoute('tabs'); return ok;
    case 'closePanel': closeRoute(); return ok;
    case 'toggleBookmark': {
      const e = currentEntry(tab);
      if (e.url === NEWTAB_URL) return no('The new tab page cannot be bookmarked.');
      browser.toggleBookmark(e.url, e.title);
      return ok;
    }
    case 'navigate': { const err = submitInput(cmd.input); return err ? no(err) : ok; }
    case 'openInNewTab': return openUrlInNewTab(cmd.url) ? ok : no('Could not open a new tab.');
  }
}

/** Contract for a future input source. It may only produce BrowserCommands; it is handed no other capability. */
export interface CommandSource {
  readonly id: string;
  start(run: (cmd: BrowserCommand) => CommandResult): () => void;
}
const running = new Map<string, () => void>();
export function registerCommandSource(src: CommandSource): () => void {
  running.get(src.id)?.();
  const stop = src.start(runCommand);
  running.set(src.id, stop);
  return () => { if (running.get(src.id) === stop) { running.delete(src.id); stop(); } };
}
