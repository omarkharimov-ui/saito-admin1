#!/usr/bin/env node
// Saito LAN print agent (pr v1) — zero dependencies (Node >= 18).
//
// Runs on a machine on the restaurant LAN that can reach the ESC/POS
// network printer (USB→LAN bridge / printer direct). It polls the Saito
// backend with the DEVICE's one-time agent key, claims that device's
// queued jobs, prints raw ESC/POS bytes over TCP, and reports the result.
//
// Setup:
//   1. Settings → Print Devices → create a device with type
//      "Network (ESC/POS)" (IP = printer address, port = 9100).
//   2. Copy the one-time agent key shown after creation.
//   3. On the kitchen PC / LAN box:
//        export SAITO_BASE_URL="http://<admin-server>:3000"
//        export SAITO_DEVICE_KEY="<the 48-hex agent key>"
//        node print-agent.mjs
//   4. Settings → Test print on that device → the printer should spool.
//
// Behavior: heartbeat keeps the device "online"; disabled device → idle
// poll (no jobs); print failure → job marked failed + device last_error.

import net from 'node:net';

const BASE = (process.env.SAITO_BASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SAITO_DEVICE_KEY || '';
const POLL_MS = Math.max(1500, parseInt(process.env.POLL_INTERVAL_MS || '4000', 10));
const IDLE_POLL_MS = 15000;
const TCP_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;

if (!BASE || !KEY) {
  console.error('Missing SAITO_BASE_URL and/or SAITO_DEVICE_KEY env vars.');
  console.error('  export SAITO_BASE_URL="http://localhost:3000"');
  console.error('  export SAITO_DEVICE_KEY="<agent key from Settings → Print Devices>"');
  process.exit(1);
}

const log = (m) => console.log(new Date().toISOString(), m);

async function api(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function utf8(s) {
  return Buffer.from(String(s ?? ''), 'utf-8');
}

function fitWidth(text, width) {
  const s = String(text ?? '');
  return s.length <= width ? s : s.slice(0, Math.max(0, width - 1)) + '…';
}

function line(width, ch = '-') {
  return utf8(ch.repeat(width));
}

// ── minimal ESC/POS builders (80/58mm, monospace) ──────────────────────────

function escPosKitchen(p, width) {
  const out = [];
  out.push(Buffer.from([0x1b, 0x40])); // init
  out.push(Buffer.from([0x1b, 0x45, 1])); // bold on
  out.push(Buffer.from([0x1b, 0x21, 0x10])); // double width
  out.push(utf8(fitWidth('MASA XIDMETI', width)));
  out.push(Buffer.from([0x1b, 0x21, 0x00])); // normal
  out.push(Buffer.from([0x1b, 0x45, 0])); // bold off
  out.push(utf8('\n'));
  out.push(utf8(fitWidth(p.table != null ? 'Masa: ' + p.table : '', width)));
  out.push(utf8('\n'));
  if (p.orderNumber) out.push(utf8(fitWidth('#' + p.orderNumber, width)));
  out.push(utf8('\n'));
  out.push(line(width, '='));
  for (const it of p.items || []) {
    out.push(utf8('\n' + fitWidth(`${it.quantity}x ${it.name}`, width)));
    if (it.course) out.push(utf8('\n  ' + fitWidth(String(it.course).toUpperCase(), width)));
    if (it.note) out.push(utf8('\n  ! ' + fitWidth(it.note, width)));
  }
  out.push(utf8('\n'));
  out.push(line(width, '='));
  if (p.note) {
    out.push(utf8('\nQeyd: ' + fitWidth(p.note, width)));
  }
  out.push(utf8('\n\n\n\n')); // feed for tear
  return Buffer.concat(out);
}

function escPosReceipt(p, width) {
  const out = [];
  const cur = p.currency || '₼';
  const money = (n) => (Number(n) || 0).toFixed(2) + ' ' + cur;
  out.push(Buffer.from([0x1b, 0x40]));
  out.push(Buffer.from([0x1b, 0x45, 1]));
  out.push(Buffer.from([0x1b, 0x21, 0x10]));
  out.push(utf8(fitWidth(p.restaurantName || 'RESTORAN', width)));
  out.push(Buffer.from([0x1b, 0x21, 0x00]));
  out.push(Buffer.from([0x1b, 0x45, 0]));
  if (p.receiptTitle) { out.push(utf8('\n')); out.push(utf8(fitWidth(String(p.receiptTitle).toUpperCase(), width))); }
  out.push(utf8('\n'));
  if (p.tableNumber != null) out.push(utf8(fitWidth('Masa: ' + p.tableNumber, width)));
  if (p.orderId) out.push(utf8('\n' + fitWidth(String(p.orderId).slice(0, 12), width)));
  out.push(utf8('\n'));
  out.push(line(width, '-'));
  for (const it of p.items || []) {
    out.push(utf8('\n' + fitWidth(`${it.quantity}x ${it.name}`, width)));
    out.push(utf8('\n' + fitWidth('   ' + money(it.price ?? it.unit_price ?? 0).padStart(width - 3), width)));
  }
  out.push(utf8('\n'));
  out.push(line(width, '-'));
  const row = (l, r) => utf8(fitWidth(l, Math.floor(width / 2)) + fitWidth(String(r), Math.ceil(width / 2)));
  out.push(row('Cəm:', money(p.subtotal)));
  if (p.discount) out.push(row('Endirimm:', '-' + money(p.discount)));
  if (p.tip) out.push(row('Boşaq:', money(p.tip)));
  out.push(Buffer.from([0x1b, 0x45, 1]));
  out.push(row('CƏMI:', money(p.total)));
  out.push(Buffer.from([0x1b, 0x45, 0]));
  if (p.paymentMethod) {
    out.push(utf8('\n' + fitWidth(String(p.paymentMethod), width)));
  }
  if (p.footerText) {
    out.push(utf8('\n' + fitWidth(p.footerText, width)));
  }
  if (p.test) {
    out.push(utf8('\n' + fitWidth(p.note || 'TEST PRINT OK', width)));
  }
  out.push(utf8('\n\n\n\n'));
  return Buffer.concat(out);
}

function buildJobBytes(job, width) {
  if (job.doc_type === 'receipt') return escPosReceipt(job.payload || {}, width);
  return escPosKitchen(job.payload || {}, width); // kitchen / label
}

function tcpSend(host, port, data) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let sent = 0;
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('TCP timeout')); }, TCP_TIMEOUT_MS);
    sock.on('error', (e) => { clearTimeout(timer); sock.destroy(); reject(e); });
    sock.connect({ host, port }, () => {
      const push = () => {
        const chunk = data.subarray(sent, sent + 2048);
        sent += chunk.length;
        const ok = sock.write(chunk, () => {
          if (sent < data.length) setImmediate(push);
          else {
            clearTimeout(timer);
            sock.end(() => resolve());
            setTimeout(() => sock.destroy(), 500);
          }
        });
        if (!ok) sock.once('drain', () => {});
      };
      push();
    });
  });
}

async function printJob(job, device) {
  const width = device.paper_width === '58mm' ? 32 : 42;
  const bytes = buildJobBytes(job, width);
  const copies = Math.max(1, Number(device.copies) || 1);
  const full = Buffer.concat(Array.from({ length: copies }, () => bytes));
  let lastErr;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      await tcpSend(device.host, Number(device.port) || 9100, full);
      return null;
    } catch (e) {
      lastErr = e.message || String(e);
      if (i < MAX_RETRIES) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return lastErr || 'print failed';
}

// ── main loop ───────────────────────────────────────────────────────────────

let consecutiveFailures = 0;
while (true) {
  try {
    const { status, data } = await api('/api/print/agent/poll', { device_key: KEY, max: 3 });
    if (status === 401 || !data?.success) {
      log('Agent key rejected — check SAITO_DEVICE_KEY (rotated?) or exit. Stopping.');
      process.exit(1);
    }
    consecutiveFailures = 0;
    const device = data.device || {};
    if (data.enabled === false) {
      log(`Device "${device.name}" is disabled — idling.`);
      await new Promise((r) => setTimeout(r, IDLE_POLL_MS));
      continue;
    }
    for (const job of data.jobs || []) {
      log(`Claimed ${job.doc_type} job ${job.id.slice(0, 8)} → ${device.host}:${device.port}`);
      const err = await printJob(job, device);
      const res = await api('/api/print/agent/poll', {
        action: 'result', job_id: job.id, success: !err, error: err || undefined,
      });
      if (err) log(`Job ${job.id.slice(0, 8)} FAILED: ${err} (reported ${res.status})`);
      else log(`Job ${job.id.slice(0, 8)} printed OK (reported ${res.status})`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  } catch (e) {
    consecutiveFailures++;
    const backoff = Math.min(60000, POLL_MS * 2 ** consecutiveFailures);
    log(`Backend unreachable: ${e.message} — retry in ${Math.round(backoff / 1000)}s`);
    await new Promise((r) => setTimeout(r, backoff));
  }
}
