// Phase 2 browser tests. Run: npm run build && node tests/e2e/phase2.mjs   (CHROMIUM_PATH=/path/to/chrome optional)
// The app is served from apps/web/dist; "websites" are local fixture servers on other ports (cross-origin frames).
// These tests prove NEXUS behaves correctly with deterministic pages. They say nothing about real external sites.
import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { serveDist } from './serve.mjs';
import { startFixtures } from './fixtures/server.mjs';

const APP = 4173, SITE = 4400, SITE2 = 4401;
const root = fileURLToPath(new URL('../../apps/web/dist', import.meta.url));
const app = await serveDist(root, APP);
const { server: s1, hits } = await startFixtures(SITE);
const { server: s2 } = await startFixtures(SITE2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

const base = `http://localhost:${APP}/`;
const site = (p, port = SITE) => `http://localhost:${port}${p}`;
const SETTINGS = { searchEngine: 'duckduckgo', homeUrl: '', embedAllow: [`localhost:${SITE}`, `localhost:${SITE2}`] };

const DESKTOP = { viewport: { width: 1280, height: 800 } };
const IPHONE = devices['iPhone 14'];
const PIXEL = devices['Pixel 7'];

const results = [];
const errors = [];
async function test(name, ctxOpts, fn, { allow = true } = {}) {
  const ctx = await browser.newContext(ctxOpts);
  if (allow) await ctx.addInitScript((s) => { try { if (top === window && !localStorage.getItem('nexus.settings.v1')) localStorage.setItem('nexus.settings.v1', JSON.stringify(s)); } catch { /* error pages / opaque frames have no storage */ } }, SETTINGS);
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_|net::|Refused to|frame-ancestors|X-Frame|sandbox/i.test(m.text()) && pageErrors.push(m.text()));
  try {
    await page.goto(base);
    await page.getByLabel('Address or search').waitFor();
    await fn(page, ctx);
    assert.deepEqual(pageErrors, [], 'unexpected page errors: ' + pageErrors.join(' | '));
    results.push([name, true]);
    console.log(`  ok   ${name}`);
  } catch (e) {
    results.push([name, false]);
    console.log(`  FAIL ${name}\n       ${String(e.message).split('\n').slice(0, 4).join('\n       ')}`);
    await page.screenshot({ path: `/tmp/fail-${results.length}.png` }).catch(() => {});
  } finally { await ctx.close(); }
}

const addr = (page) => page.getByLabel('Address or search');
const go = async (page, input) => { await addr(page).fill(input); await addr(page).press('Enter'); };
const frame = (page) => page.frameLocator('.frame-host:not([hidden]) iframe');
const status = (page) => page.locator('.frame-host:not([hidden])').first().getAttribute('data-frame-status');
const visibleBtn = (page, name) => page.getByRole('button', { name, exact: true }).locator('visible=true').first();
const waitVerified = (page) => page.locator('.frame-host:not([hidden])[data-frame-status="verified"]').waitFor();

// ---------------------------------------------------------------- navigation
console.log('\nNavigation, reload, history');
await test('navigates to an allowlisted site and renders it inside the app', DESKTOP, async (page) => {
  await go(page, site('/a'));
  await frame(page).getByRole('heading', { name: 'Page A' }).waitFor();
  await waitVerified(page);
  assert.equal(await addr(page).inputValue(), `http://localhost:${SITE}/a`); // http:// stays visible as a warning
  assert.equal(await page.getByTestId('blank-hint').count(), 0, 'verified page needs no "may be blank" hint');
  assert.equal(await page.locator('.tab.active .tab-main').innerText(), 'Page A (reported)');
});

await test('loading indicator shows while a page loads, then clears', DESKTOP, async (page) => {
  await go(page, site('/slow'));
  await page.locator('.progress.on').waitFor();
  await page.getByRole('status', { name: 'Loading page' }).waitFor();
  await frame(page).getByRole('heading', { name: 'Slow' }).waitFor();
  await page.locator('.progress.on').waitFor({ state: 'detached' });
});

await test('back and forward move through this tab\'s history, with disabled states', DESKTOP, async (page) => {
  const back = visibleBtn(page, 'Back'), fwd = visibleBtn(page, 'Forward');
  assert.equal(await back.isDisabled(), true);
  await go(page, site('/a')); await frame(page).getByRole('heading', { name: 'Page A' }).waitFor();
  await go(page, site('/b')); await frame(page).getByRole('heading', { name: 'Page B' }).waitFor();
  assert.equal(await fwd.isDisabled(), true);
  await back.click();
  await frame(page).getByRole('heading', { name: 'Page A' }).waitFor();
  assert.equal(await fwd.isEnabled(), true);
  await fwd.click();
  await frame(page).getByRole('heading', { name: 'Page B' }).waitFor();
  await back.click(); await back.click();
  await page.getByText('Bookmarks').first().waitFor(); // back at the new tab page
  assert.equal(await back.isDisabled(), true);
});

await test('reload requests the page again from the server', DESKTOP, async (page) => {
  const reload = visibleBtn(page, 'Reload');
  assert.equal(await reload.isDisabled(), true, 'nothing to reload on the new tab page');
  await go(page, site('/a')); await waitVerified(page);
  const before = hits['/a'];
  await reload.click();
  await frame(page).getByText(`hits:${before + 1}`).waitFor();
  assert.equal(hits['/a'], before + 1);
  // typing the current address again also reloads
  await go(page, site('/a'));
  await frame(page).getByText(`hits:${before + 2}`).waitFor();
});

await test('home returns to the start page and is disabled there', DESKTOP, async (page) => {
  const home = visibleBtn(page, 'Home');
  assert.equal(await home.isDisabled(), true);
  await go(page, site('/a')); await waitVerified(page);
  await home.click();
  await page.getByRole('heading', { name: 'Bookmarks', exact: true }).waitFor();
  assert.equal(await page.locator('iframe').locator('visible=true').count(), 0);
});

// ---------------------------------------------------------------- tabs
console.log('\nTabs');
await test('new tab, tab switching and per-tab independent history', DESKTOP, async (page) => {
  await go(page, site('/a')); await frame(page).getByRole('heading', { name: 'Page A' }).waitFor();
  await go(page, site('/b')); await frame(page).getByRole('heading', { name: 'Page B' }).waitFor();
  await page.getByRole('button', { name: 'New tab', exact: true }).first().click();
  assert.equal(await page.locator('.tab').count(), 2);
  await go(page, site('/c', SITE2)); await frame(page).getByRole('heading', { name: 'Page C' }).waitFor();
  assert.equal(await visibleBtn(page, 'Back').isEnabled(), true);
  // tab 1 still shows B and its own history
  await page.locator('.tab-main').first().click();
  await frame(page).getByRole('heading', { name: 'Page B' }).waitFor();
  await visibleBtn(page, 'Back').click();
  await frame(page).getByRole('heading', { name: 'Page A' }).waitFor();
  // tab 2 is untouched by that
  await page.locator('.tab-main').nth(1).click();
  await frame(page).getByRole('heading', { name: 'Page C' }).waitFor();
  assert.ok((await addr(page).inputValue()).includes(`:${SITE2}/c`));
  // active tab is clearly marked
  assert.equal(await page.locator('.tab.active').count(), 1);
  assert.equal(await page.locator('.tab-main[aria-selected="true"]').count(), 1);
});

await test('recently used tabs keep their page alive when switching', DESKTOP, async (page) => {
  await go(page, site('/a')); await waitVerified(page);
  const before = hits['/a'];
  await page.getByRole('button', { name: 'New tab', exact: true }).first().click();
  await go(page, site('/b')); await waitVerified(page);
  await page.locator('.tab-main').first().click();
  await frame(page).getByRole('heading', { name: 'Page A' }).waitFor();
  assert.equal(hits['/a'], before, 'switching back must not re-request the page');
});

await test('closing tabs, last tab is replaced, tab limit of 20 is respected', DESKTOP, async (page) => {
  await page.getByRole('button', { name: /^Close New Tab$/ }).click();
  assert.equal(await page.locator('.tab').count(), 1, 'the last tab is replaced, never zero');
  for (let i = 0; i < 25; i++) { const b = page.getByRole('button', { name: 'New tab', exact: true }).first(); if (await b.isDisabled()) break; await b.click(); }
  assert.equal(await page.locator('.tab').count(), 20);
  assert.equal(await page.getByRole('button', { name: 'New tab', exact: true }).first().isDisabled(), true);
});

// ---------------------------------------------------------------- address bar
console.log('\nAddress bar');
await test('select-all on focus, invalid input errors, search uses the chosen engine', DESKTOP, async (page) => {
  await go(page, site('/a')); await waitVerified(page);
  await addr(page).click();
  const sel = await addr(page).evaluate((el) => [el.selectionStart, el.selectionEnd, el.value.length]);
  assert.deepEqual(sel.slice(0, 2), [0, sel[2]], 'whole address is selected on focus');
  await go(page, 'javascript:alert(1)');
  await page.getByRole('alert').first().waitFor();
  await go(page, 'https://user:pw@example.com');
  await page.getByRole('alert').first().waitFor();
  await page.getByRole('button', { name: 'Menu' }).first().click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Brave Search' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await go(page, 'hello world');
  await page.getByRole('heading', { name: /Brave Search does not allow embedding/ }).waitFor();
  assert.ok((await page.getByRole('link', { name: /Open in your browser/ }).getAttribute('href')).startsWith('https://search.brave.com/search?q=hello%20world'));
});

await test('the Go button submits what was typed (mobile keyboards)', IPHONE, async (page) => {
  await addr(page).fill(site('/b'));
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await frame(page).getByRole('heading', { name: 'Page B' }).waitFor();
});

// ---------------------------------------------------------------- unsupported embedding
console.log('\nUnsupported embedding / fallback');
await test('site not on the list: explained, external fallback, copy URL, allow', DESKTOP, async (page, ctx) => {
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await go(page, 'https://example.com/some/page');
  await page.getByRole('heading', { name: 'Not on your embedding list' }).waitFor();
  assert.equal(await page.locator('iframe').count(), 0, 'nothing is embedded without permission');
  const link = page.getByRole('link', { name: /Open in your browser/ });
  assert.equal(await link.getAttribute('href'), 'https://example.com/some/page');
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.match(await link.getAttribute('rel'), /noopener/);
  await page.getByRole('button', { name: 'Copy URL' }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'https://example.com/some/page');
  await page.getByRole('button', { name: 'Allow example.com' }).click();
  await page.locator('.frame-host:not([hidden]) iframe').waitFor();
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('nexus.settings.v1'))).embedAllow.includes('example.com'), true);
});

await test('known-blocking site (a search engine) shows the unsupported state', DESKTOP, async (page) => {
  await go(page, 'https://www.google.com/search?q=cats');
  await page.getByRole('heading', { name: 'Google does not allow embedding' }).waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
});

await test('X-Frame-Options / frame-ancestors: load event fires but NEXUS does not claim success', DESKTOP, async (page) => {
  for (const p of ['/deny', '/csp']) {
    await go(page, site(p));
    await page.locator('.frame-host:not([hidden]) iframe').waitFor();
    await page.locator('.frame-host:not([hidden])[data-frame-status="loaded"]').waitFor(); // the browser DID fire onLoad
    await page.getByTestId('blank-hint').waitFor();                                         // ...and NEXUS still says it cannot tell
    assert.notEqual(await status(page), 'verified');
    const fr = page.frames().find((f) => f.url().includes(p) || f.url().startsWith('chrome-error'));
    assert.ok(fr, 'frame exists');
    assert.ok(fr.url().startsWith('chrome-error') || fr.url() === 'about:blank', `blocked frame should not hold the page, got ${fr.url()}`);
    assert.ok(await page.getByRole('link', { name: 'Open in browser' }).isVisible());
  }
});

await test('a page that does not cooperate is "loaded", never "verified"', DESKTOP, async (page) => {
  await go(page, site('/silent'));
  await frame(page).getByRole('heading', { name: 'Silent page' }).waitFor();
  await page.getByTestId('blank-hint').waitFor();
  assert.equal(await status(page), 'loaded');
  await page.getByRole('button', { name: 'Dismiss' }).click();
  assert.equal(await page.getByTestId('blank-hint').count(), 0);
});

await test('offline shows the offline state and recovers with Try again', DESKTOP, async (page, ctx) => {
  await page.evaluate(() => localStorage.setItem('nexus.settings.v1', JSON.stringify({ embedAllow: ['example.com'] })));
  await page.reload(); await addr(page).waitFor();
  await ctx.setOffline(true);
  await go(page, 'https://example.com/');
  await page.getByRole('heading', { name: 'You are offline' }).waitFor();
  assert.ok(await page.getByRole('link', { name: /Open in your browser/ }).isVisible());
  await ctx.setOffline(false);
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.locator('.frame-host:not([hidden]) iframe').waitFor();
});

await test('a page that never answers becomes a navigation error with retry', DESKTOP, async (page) => {
  await page.clock.install();
  await go(page, site('/a'));
  await page.route(`http://localhost:${SITE}/**`, () => { /* never fulfilled */ });
  await go(page, site('/b'));
  await page.clock.fastForward(21_000);
  await page.getByRole('heading', { name: 'The page took too long' }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Try again' }).isVisible());
});

// ---------------------------------------------------------------- security
console.log('\nSecurity');
await test('iframe is sandboxed with minimal permissions and no device access', DESKTOP, async (page) => {
  await go(page, site('/a')); await waitVerified(page);
  const attrs = await page.locator('.frame-host:not([hidden]) iframe').evaluate((f) => ({ sandbox: f.getAttribute('sandbox'), allow: f.getAttribute('allow'), referrer: f.referrerPolicy }));
  const flags = attrs.sandbox.split(/\s+/);
  for (const bad of ['allow-top-navigation', 'allow-top-navigation-by-user-activation', 'allow-modals', 'allow-downloads', 'allow-popups-to-escape-sandbox', 'allow-pointer-lock', 'allow-presentation']) assert.ok(!flags.includes(bad), bad);
  assert.equal(attrs.allow, '');
  assert.equal(attrs.referrer, 'strict-origin-when-cross-origin');
});

await test('embedded page cannot navigate the NEXUS window', DESKTOP, async (page) => {
  await go(page, site('/escape'));
  await frame(page).getByRole('heading', { name: 'Escape attempt' }).waitFor();
  await page.waitForTimeout(300);
  assert.equal(page.url().startsWith(base), true);
  assert.equal(hits['/pwned'] ?? 0, 0);
});

await test('NEXUS refuses to embed itself, even if its own origin is allowlisted', DESKTOP, async (page) => {
  await page.evaluate(() => localStorage.setItem('nexus.settings.v1', JSON.stringify({ embedAllow: ['localhost'] })));
  await page.reload(); await addr(page).waitFor();
  await go(page, base);
  await page.getByRole('heading', { name: 'Cannot open NEXUS inside itself' }).waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
});

await test('dangerous schemes, credentials and bad input never reach the frame', DESKTOP, async (page) => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'blob:http://x/1', 'http://localhost@evil.example/', 'ftp://x.com']) {
    await go(page, bad);
    await page.getByRole('alert').first().waitFor();
    assert.equal(await page.locator('iframe').count(), 0, bad);
  }
});

await test('bridge: only the frame itself may open tabs, and only valid http(s) links', DESKTOP, async (page) => {
  await go(page, site('/a')); await waitVerified(page);
  await page.evaluate((u) => postMessage({ nexus: 1, type: 'open-link', url: u }, '*'), site('/b')); // from NEXUS itself: not the frame
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.tab').count(), 1, 'message from a non-frame source is ignored');
  await frame(page).getByRole('button', { name: 'Bad link' }).click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.tab').count(), 1, 'javascript: link is ignored');
  await frame(page).getByRole('button', { name: 'Open B in new tab' }).click();
  await page.locator('.tab').nth(1).waitFor();
  await frame(page).getByRole('heading', { name: 'Page B' }).waitFor();
  assert.equal(await page.locator('.tab.active .tab-main').innerText(), 'Page B (reported)');
});

// ---------------------------------------------------------------- bookmarks, settings
console.log('\nBookmarks and settings');
await test('bookmark a page, see it on the start page and in the panel, open it in a new tab', DESKTOP, async (page) => {
  await go(page, site('/a')); await waitVerified(page);
  await page.getByRole('button', { name: 'Bookmark this page' }).click();
  await page.getByRole('button', { name: 'Remove bookmark', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Menu' }).first().click();
  await page.getByRole('button', { name: 'Bookmarks' }).click();
  const dlg = page.getByRole('dialog', { name: 'Bookmarks' });
  await dlg.getByText(`localhost:${SITE}/a`).first().waitFor();
  await dlg.getByRole('button', { name: /in a new tab/ }).click();
  await page.locator('.tab').nth(1).waitFor();
  await frame(page).getByRole('heading', { name: 'Page A' }).waitFor();
  await page.reload();
  await page.locator('.tab').first().waitFor();
  await page.locator('.tab-main').first().click();
  await page.getByRole('button', { name: 'Remove bookmark', exact: true }).waitFor(); // persisted
});

await test('allowlist can be edited in settings and rejects bad entries', DESKTOP, async (page) => {
  await page.getByRole('button', { name: 'Menu' }).first().click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const input = page.getByLabel('Site to allow');
  await input.fill('javascript:alert(1)'); await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('alert').first().waitFor();
  await input.fill('*'); await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('alert').first().waitFor();
  await input.fill('https://Docs.Example.org/path'); await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('list', { name: 'Allowed sites' }).getByText('docs.example.org').waitFor();
  await page.getByRole('button', { name: 'Remove docs.example.org' }).click();
  assert.equal(await page.getByText('docs.example.org').count(), 0);
});

// ---------------------------------------------------------------- mobile
console.log('\nMobile');
for (const [label, dev] of [['iPhone 14', IPHONE], ['Pixel 7', PIXEL]]) {
  await test(`${label}: layout, touch targets, safe overflow, tab switcher`, dev, async (page) => {
    await go(page, site('/a')); await waitVerified(page);
    const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth);
    assert.ok(await noOverflow(), 'no horizontal overflow');
    const bar = page.getByRole('navigation', { name: 'Browser controls' });
    await bar.waitFor();
    for (const b of await bar.getByRole('button').all()) {
      const box = await b.boundingBox();
      assert.ok(box.width >= 40 && box.height >= 40, `touch target too small: ${JSON.stringify(box)}`);
    }
    const iframeBox = await page.locator('.frame-host:not([hidden]) iframe').boundingBox();
    const barBox = await bar.boundingBox();
    assert.ok(iframeBox.width <= dev.viewport.width + 1 && iframeBox.y + iframeBox.height <= barBox.y + 2, 'frame fits between address bar and toolbar');
    // keyboard: bottom bar gets out of the way while editing the address
    await addr(page).tap();
    assert.equal(await bar.isVisible(), false);
    await addr(page).evaluate((el) => el.blur());
    assert.equal(await bar.isVisible(), true);
    // new tab + full-screen switcher with preview cards
    await bar.getByRole('button', { name: 'New tab' }).tap();
    await go(page, site('/b')); await waitVerified(page);
    await bar.getByRole('button', { name: /^Tabs/ }).tap();
    const dlg = page.getByRole('dialog', { name: /Tabs/ });
    await dlg.waitFor();
    assert.equal(await dlg.getByTestId('tab-card').count(), 2);
    const box = await dlg.boundingBox();
    assert.ok(box.width >= dev.viewport.width - 1, 'switcher is full-screen width');
    assert.ok(await noOverflow());
    await dlg.getByRole('button', { name: /Switch to Page A/ }).tap();
    await frame(page).getByRole('heading', { name: 'Page A' }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
  });

  await test(`${label}: orientation change keeps layout intact`, dev, async (page) => {
    await go(page, site('/a')); await waitVerified(page);
    const { width, height } = dev.viewport;
    await page.setViewportSize({ width: height, height: width });
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no overflow in landscape');
    await frame(page).getByRole('heading', { name: 'Page A' }).waitFor();
    assert.ok((await page.locator('.frame-host:not([hidden]) iframe').boundingBox()).height > 150, 'page still has room in landscape');
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  });
}

await test('mobile: unsupported-site card fits the screen', IPHONE, async (page) => {
  await go(page, 'https://example.com/a/very/long/path/that/keeps/going/and/going/and/going/and/going/index.html?with=query&and=more');
  await page.getByRole('heading', { name: 'Not on your embedding list' }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await page.getByRole('link', { name: /Open in your browser/ }).isVisible());
}, { allow: false });

// ---------------------------------------------------------------- done
await browser.close(); app.close(); s1.close(); s2.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} browser tests passed`);
process.exit(failed.length ? 1 : 0);
