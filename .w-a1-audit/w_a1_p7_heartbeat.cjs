// W-A1 Class-C harness aid (2026-09-19): keep-warm heartbeat for P-7 half-2.
// Root cause evidence (dev server log, UND_ERR_SOCKET "other side closed", ~2.2MB
// long-lived pooled socket): LB reaps the dev server's idle keep-alive sockets after
// half-1's burst; half-2 starts seconds later and chronically races dead-socket reuse
// (direct REST curl = 200/115ms healthy throughout; h1 retry guards absorb the wave,
// h2's window outlasts per-leg retries).
// Fix = harness-only: one zero-side-effect authed GET (/api/orders?limit=1 — the gate's
// own warmup probe) every 6s during half-2 keeps the pool warm. No production change.
const { spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const APP = 'http://localhost:3000';
const TOKS = JSON.parse(fs.readFileSync(__dirname + '/../.p7-fixture.json', 'utf8'));
const toks = TOKS.toks || TOKS.TOKS || [];
if (!toks.length) throw new Error('no tokens in .p7-fixture.json');
let n = 0;
const beat = () => new Promise(res => {
  const r = http.request({ hostname: 'localhost', port: 3000, path: '/api/orders?limit=1', method: 'GET',
    headers: { Cookie: `saito_token=${toks[n % toks.length]}; saito_csrf=p7gate_csrf`, 'x-csrf-token': 'p7gate_csrf' }, timeout: 8000 },
    sp => { sp.on('data', () => {}); sp.on('end', () => res(sp.statusCode)); });
  r.on('timeout', () => res(0)); r.on('error', () => res(0)); r.end();
});
(async () => {
  console.log('heartbeat: on (' + toks.length + ' tokens, 6s cadence)');
  while (true) {
    const s = await beat(); n++;
    if (s !== 200) console.log('beat flake:', s, 'n=' + n);
    await new Promise(r => setTimeout(r, 6000));
  }
})();
