const PATHS = {
  back: 'M15 5l-7 7 7 7', forward: 'M9 5l7 7-7 7', home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  tabs: 'M4 6h16v12H4zM4 10h16', menu: 'M4 7h16M4 12h16M4 17h16', plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18', star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z',
  bookmark: 'M7 4h10v16l-5-4-5 4z', history: 'M12 7v5l3 2M4 12a8 8 0 108-8 8 8 0 00-5.7 2.3L4 8M4 4v4h4',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M13 5v4M7 15v4', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM16 16l4 4',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5', copy: 'M9 9h10v11H9zM5 15V4h10',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', install: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z', warn: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13', check: 'M5 13l4 4 10-10',
  eye: 'M12 5C6 5 2.5 12 2.5 12S6 19 12 19s9.5-7 9.5-7S18 5 12 5zM12 9a3 3 0 100 6 3 3 0 000-6z',
  reload: 'M20 12a8 8 0 11-2.4-5.7M20 4v5h-5', info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5v.5', newtab: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, filled = false }: { name: IconName; size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
