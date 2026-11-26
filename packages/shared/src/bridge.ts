import { cleanTitle, isRecord } from './text';
import { NEWTAB_URL, isNavigableUrl } from './url';

/**
 * The only messages an embedded page may send to NEXUS (and only if the page chooses to cooperate).
 * It is one-way and tiny on purpose: no navigation of NEXUS, no storage, no permissions, no native calls.
 * The caller must still check `event.source` and `event.origin` against the frame before trusting a message.
 */
export type BridgeMessage =
  | { type: 'ready' }
  | { type: 'title'; title: string }
  | { type: 'open-link'; url: string };

export function parseBridgeMessage(data: unknown): BridgeMessage | null {
  if (!isRecord(data) || data.nexus !== 1) return null;
  switch (data.type) {
    case 'ready':
      return { type: 'ready' };
    case 'title': {
      const title = cleanTitle(data.title, '', 120);
      return title ? { type: 'title', title } : null;
    }
    case 'open-link':
      return typeof data.url === 'string' && data.url.length <= 2048 && data.url !== NEWTAB_URL && isNavigableUrl(data.url)
        ? { type: 'open-link', url: new URL(data.url).href }
        : null;
    default:
      return null;
  }
}
