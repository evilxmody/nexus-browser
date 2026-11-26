# apps/mobile: Capacitor wrapper (not yet built)

Phase 1 only prepares this. **No Android or iOS project exists yet and nothing here has been run on a device.**

- `capacitor.config.json` points Capacitor at the web build in `apps/web/dist`.
- Phase 5 will add `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`, run `npx cap add android|ios`, and create a
  custom plugin under `native/` that hosts real `WebView` / `WKWebView` tabs behind a validated, origin-restricted bridge.
- Storage is already behind `StorageAdapter` (`@nexus/core`), so a native-backed adapter can replace `localStorage` without touching the browser logic.
