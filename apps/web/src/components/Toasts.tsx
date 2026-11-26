import { toasts } from '../toast';
import { useStore } from '../hooks';

export function Toasts() {
  const list = useStore(toasts);
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>{t.msg}</div>)}
    </div>
  );
}
