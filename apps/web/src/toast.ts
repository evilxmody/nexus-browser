import { createStore } from '@nexus/core';

export interface Toast { id: number; msg: string; kind: 'info' | 'error' | 'success' }
type A = { t: 'add'; toast: Toast } | { t: 'rm'; id: number };
export const toasts = createStore<Toast[], A>([], (s, a) =>
  a.t === 'add' ? [...s.slice(-2), a.toast] : s.filter((x) => x.id !== a.id));
let n = 0;
export function toast(msg: string, kind: Toast['kind'] = 'info', ms = 3500) {
  const id = ++n;
  toasts.dispatch({ t: 'add', toast: { id, msg, kind } });
  setTimeout(() => toasts.dispatch({ t: 'rm', id }), ms);
}
