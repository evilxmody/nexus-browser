// App-shell smoke test against the production build (iPhone, Pixel, desktop). Run: npm run build && node tests/e2e/smoke.mjs
import { chromium, devices } from 'playwright';
import { fileURLToPath } from 'node:url';
import { serveDist } from './serve.mjs';
import assert from 'node:assert/strict';

const PORT = 4173;
const srv = await serveDist(fileURLToPath(new URL('../../apps/web/dist', import.meta.url)), PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
try {
  for (const [name, ctxOpts] of [['iphone', devices['iPhone 14']], ['pixel', devices['Pixel 7']], ['desktop', { viewport: { width: 1280, height: 800 } }]]) {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
    await page.goto(`http://localhost:${PORT}/`);
    await page.getByText('No bookmarks yet').first().waitFor();           // empty states render after boot
    const addr = page.getByLabel('Address or search');
    await addr.fill('javascript:alert(1)'); await addr.press('Enter');
    await page.getByRole('alert').first().waitFor();                        // unsafe input -> inline error
    await addr.fill('example.com'); await addr.press('Enter');
    await page.getByRole('link', { name: /Open in your browser/ }).waitFor();
    assert.equal(await page.getByRole('link', { name: /Open in your browser/ }).getAttribute('href'), 'https://example.com/');
    await page.getByRole('button', { name: 'Bookmark this page' }).click();
    await addr.fill('hello world'); await addr.press('Enter');
    await page.getByRole('heading', { name: 'DuckDuckGo does not allow embedding' }).waitFor();
    assert.ok(await page.getByRole('button', { name: 'Back' }).first().isEnabled());
    await page.getByRole('button', { name: 'Back' }).first().click();
    await page.getByRole('heading', { name: 'Not on your embedding list' }).waitFor();
    // no horizontal overflow
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`);
    // panels
    await page.getByRole('button', { name: 'Menu' }).first().click();
    await page.getByRole('menuitem').first().waitFor().catch(() => {});
    await page.getByRole('button', { name: 'Bookmarks' }).click();
    await page.getByRole('dialog', { name: 'Bookmarks' }).getByText('example.com').first().waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    // persistence across reload
    await page.waitForTimeout(500); await page.reload();
    await page.getByRole('heading', { name: 'Not on your embedding list' }).waitFor();
    // corrupt storage recovers
    await page.evaluate(() => localStorage.setItem('nexus.browser.v1', '{broken'));
    await page.reload();
    await page.getByText('Saved data could not be read').waitFor();
    await page.screenshot({ path: `${process.env.SHOT_DIR || '/tmp'}/shot-${name}.png` });
    await ctx.close();
  }
  const sw = await (await fetch(`http://localhost:${PORT}/manifest.webmanifest`)).json();
  assert.equal(sw.display, 'standalone');
  assert.deepEqual(errors, []);
  console.log('E2E OK: iPhone 14, Pixel 7, desktop');
} finally { await browser.close(); srv.close(); }
