import { useEffect, useState } from 'react';
import { EmptyState, Spinner } from '@nexus/ui';
import { boot } from './runtime';
import { toast } from './toast';
import { Shell } from './components/Shell';

type Boot = { status: 'loading' } | { status: 'ready' } | { status: 'failed' };

export function App() {
  const [state, setState] = useState<Boot>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    boot().then(
      (r) => {
        if (!live) return;
        setState({ status: 'ready' });
        if (r.recovered) toast('Saved data could not be read and was reset.', 'error', 6000);
        if (r.error) toast(r.error, 'error', 6000);
      },
      () => live && setState({ status: 'failed' }),
    );
    return () => { live = false; };
  }, []);

  if (state.status === 'loading') {
    return <div className="boot"><div className="wordmark">NEXUS</div><Spinner label="Starting NEXUS" /></div>;
  }
  if (state.status === 'failed') {
    return (
      <div className="boot">
        <EmptyState icon="warn" title="NEXUS could not start" text="Starting failed unexpectedly. Reloading usually fixes this.">
          <button className="btn primary" onClick={() => location.reload()}>Reload</button>
        </EmptyState>
      </div>
    );
  }
  return <Shell />;
}
