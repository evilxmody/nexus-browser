import { useEffect } from 'react';
import { Icon, type IconName } from '@nexus/ui';
import { runCommand } from '../commands';
import { useInstallPrompt } from '../hooks';
import { openRoute } from '../router';
import { toast } from '../toast';

export function MenuSheet({ onClose }: { onClose: () => void }) {
  const install = useInstallPrompt();
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled === true;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);

  const item = (icon: IconName, label: string, fn: () => void, disabled = false) => (
    <button className="menu-item" disabled={disabled} onClick={() => { onClose(); fn(); }}><Icon name={icon} size={20} />{label}</button>
  );
  const toggleFs = async () => {
    try { document.fullscreenElement ? await document.exitFullscreen() : await document.documentElement.requestFullscreen(); }
    catch { toast('Fullscreen was blocked by your browser.', 'error'); }
  };
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="menu" role="menu" aria-label="Browser menu">
        {item('plus', 'New tab', () => runCommand({ type: 'newTab' }))}
        {item('bookmark', 'Bookmarks', () => openRoute('bookmarks'))}
        {item('history', 'History', () => openRoute('history'))}
        {item('settings', 'Settings', () => openRoute('settings'))}
        {canFullscreen && item('fullscreen', 'Toggle fullscreen', toggleFs)}
        {install && item('install', 'Install app', () => void install())}
      </div>
    </div>
  );
}
