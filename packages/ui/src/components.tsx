import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function IconButton(p: {
  icon: IconName; label: string; onClick?: () => void; disabled?: boolean; title?: string;
  badge?: string | number; active?: boolean; submit?: boolean; keepFocus?: boolean; filled?: boolean; className?: string;
}) {
  return (
    <button type={p.submit ? 'submit' : 'button'} className={`icon-btn${p.active ? ' is-active' : ''} ${p.className ?? ''}`} aria-label={p.label}
      title={p.title ?? p.label} onClick={p.onClick} onMouseDown={p.keepFocus ? (e) => e.preventDefault() : undefined} disabled={p.disabled}>
      <Icon name={p.icon} filled={p.filled} />
      {p.badge !== undefined && <span className="icon-badge">{p.badge}</span>}
    </button>
  );
}

export function EmptyState(p: { icon: IconName; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={p.icon} size={28} /></div>
      <h3>{p.title}</h3>
      {p.text && <p>{p.text}</p>}
      {p.children}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <div className="spinner" role="status" aria-label={label} />;
}
