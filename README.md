# NEXUS Browser: Phase 2 (web browsing)

A mobile-first, installable (PWA) browser interface with real tab, history, bookmark and navigation state.
Pages from sites you allow are shown in a sandboxed iframe. Gesture, eye and hand control are **not** implemented yet (Phases 3 and 4). Native apps are **not** built yet (Phase 5).

## Run
    npm install
    npm run dev          # http://localhost:5173
    npm run check        # typecheck + unit tests + production build
    npm run build && CHROMIUM_PATH=/path/to/chrome node tests/e2e/smoke.mjs     # app-shell smoke test
    npm run build && CHROMIUM_PATH=/path/to/chrome node tests/e2e/phase2.mjs    # web-view tests against local fixture sites
    # (npm run test:e2e runs both)

## Layout
    apps/web        Vite + React + PWA shell (UI composition only)
    apps/mobile     Capacitor config (native projects arrive in Phase 5)
    packages/shared URL resolution/validation, ids, text helpers (no dependencies)
    packages/core   store, storage adapters, settings
    packages/browser tab / navigation / history / bookmark reducer, facade, validated persistence
    packages/ui     icons, buttons, empty state, spinner, design tokens
    native/         reserved for Phase 5
    tests/          unit (Vitest) and e2e (Playwright smoke)

## How page viewing works
- `packages/shared/src/embed.ts` decides, per URL, whether a page may be shown in-app: allowlist (your sites, Settings), a list of sites known to
  refuse framing (used only for explanations), never NEXUS itself, no plain http from a secure app (except loopback), only http(s) without credentials.
- The iframe is sandboxed (`allow-scripts allow-same-origin allow-forms allow-popups` only), has an empty `allow` (no camera/mic/location) and cannot navigate NEXUS.
- NEXUS ships with **no** pre-approved external site. No proxy is used; X-Frame-Options / CSP frame-ancestors are respected, never bypassed.
- Frame status is `loading` -> `loaded` (the load event fired; NOT proof anything rendered) -> `verified` (the page itself confirmed via the tiny bridge in `bridge.ts`).
  Unverified pages show a dismissible "may be blank" hint with an open-in-browser link.
- Every button and (future) input source goes through `apps/web/src/commands.ts`. This is where eye/hand tracking will plug in (Phase 3/4); no camera code exists yet.

## Honest limitations
- Whether a real website can be embedded is decided by that website. It cannot be read or detected from here, and local tests prove nothing about external sites.
  Search engines (Google, Bing, DuckDuckGo, Brave) and many large sites block framing; for them NEXUS offers open-in-browser and copy-URL.
- Links clicked *inside* a cross-origin page are not visible to NEXUS: the address bar shows the page NEXUS loaded, and such links cannot be opened in a NEXUS tab
  (target=_blank opens your real browser). Pages that opt in to the bridge can ask for a new tab.
- Tab cards show a site identity tile, not a screenshot (cross-origin pages cannot be captured by a web app). Up to 3 recent tabs keep their page alive; others reload when selected.
- No downloads, page titles for non-cooperating sites (hostname is shown), or reading of page content. Real WebView/WKWebView is Phase 5.
- Offline: the service worker caches the app shell only, not websites.
- Tested in Chromium with iPhone/Pixel/desktop emulation, not on real devices or Safari/WebKit.
