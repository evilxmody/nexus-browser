// Deterministic local "websites" for iframe tests. Two origins (different ports) so frames are really cross-origin.
// Nothing here says anything about how real external websites behave.
import http from 'node:http';

const page = (title, body, { ready = true, extra = '' } = {}) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head><body style="font-family:sans-serif;margin:0;padding:16px">
<h1 id="h">${title}</h1>${body}
<script>
  const send = (m) => parent.postMessage({ nexus: 1, ...m }, '*');
  ${ready ? "send({ type: 'ready' }); send({ type: 'title', title: document.title + ' (reported)' });" : ''}
  window.__send = send;
  ${extra}
</script></body></html>`;

export function startFixtures(port) {
  const hits = {};
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${port}`);
    hits[u.pathname] = (hits[u.pathname] ?? 0) + 1;
    const html = (s, headers = {}) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers }); res.end(s); };
    switch (u.pathname) {
      case '/a': return html(page('Page A', `<p id="hits">hits:${hits['/a']}</p><a href="/b" id="next">to B</a>
        <button id="open" onclick="__send({type:'open-link',url:'http://localhost:${port}/b'})">Open B in new tab</button>
        <button id="bad" onclick="__send({type:'open-link',url:'javascript:alert(1)'})">Bad link</button>`));
      case '/b': return html(page('Page B', '<p>second page</p>'));
      case '/c': return html(page('Page C', '<p>third page</p>'));
      case '/silent': return html(page('Silent page', '<p>cooperates with nothing</p>', { ready: false }));
      case '/deny': return html(page('Denied', '<p>should never be visible in a frame</p>'), { 'x-frame-options': 'DENY' });
      case '/csp': return html(page('CSP denied', '<p>nope</p>'), { 'content-security-policy': "frame-ancestors 'none'" });
      case '/escape': return html(page('Escape attempt', '<p id="r">trying</p>', { extra:
        "try { top.location.href = 'http://localhost:" + port + "/pwned'; } catch (e) { document.getElementById('r').textContent = 'blocked'; }" }));
      case '/slow': return setTimeout(() => html(page('Slow', '<p>slow</p>')), 1500);
      case '/hits': res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(hits));
      default: res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, hits })));
}
