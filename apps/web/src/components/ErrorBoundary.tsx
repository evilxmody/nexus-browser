import { Component, type ReactNode } from 'react';
import { EmptyState } from '@nexus/ui';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(err: unknown) { console.error('NEXUS crashed:', err); }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="boot">
        <EmptyState icon="warn" title="Something went wrong" text="NEXUS hit an unexpected error. Your saved tabs and bookmarks are not affected.">
          <button className="btn primary" onClick={() => location.reload()}>Reload</button>
        </EmptyState>
      </div>
    );
  }
}
