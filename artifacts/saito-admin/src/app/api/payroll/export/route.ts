import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

interface PayrollEntry {
  staff_id: string;
  staff_name: string;
  role_name: string;
  period_start: string;
  period_end: string;
  hours_worked: number;
  hourly_rate: number;
  overtime_hours: number;
  overtime_rate: number;
  tips_earned: number;
  tip_shortfall: number;
  gross_pay: number;
  deductions: number;
  net_pay: number;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Resolve (create-or-update) the payroll period row for a date range and
 * return its id. Keeps payroll_periods.total_gross_pay/total_hours current
 * so the history view shows real totals per period.
 */
async function upsertPeriod(s: { url: string; headers: Record<string, string> }, start: string, end: string, entries: PayrollEntry[]): Promise<string | null> {
  const totalGross = r2(entries.reduce((a, e) => a + Number(e.gross_pay || 0), 0));
  const totalHours = r2(entries.reduce((a, e) => a + Number(e.hours_worked || 0), 0));

  const foundRes = await fetch(
    `${s.url}/rest/v1/payroll_periods?period_start=eq.${start}&period_end=eq.${end}&select=id&limit=1`,
    { headers: s.headers }
  );
  const found = await foundRes.json();
  if (Array.isArray(found) && found.length > 0) {
    await fetch(`${s.url}/rest/v1/payroll_periods?id=eq.${found[0].id}`, {
      method: 'PATCH',
      headers: { ...s.headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ total_gross_pay: totalGross, total_hours: totalHours }),
    }).catch(() => {});
    return found[0].id;
  }

  const createdRes = await fetch(`${s.url}/rest/v1/payroll_periods`, {
    method: 'POST',
    headers: { ...s.headers, 'Prefer': 'return=representation' },
    body: JSON.stringify({ period_start: start, period_end: end, status: 'open', total_gross_pay: totalGross, total_hours: totalHours }),
  });
  // PostgREST return=representation responds with an ARRAY for a single INSERT.
  const created = await createdRes.json().catch(() => null);
  const row = Array.isArray(created) ? created[0] : created;
  return row?.id || null;
}

/** Record one export row in payroll_exports (real schema: period_id/export_format/file_path/exported_by/exported_at). */
async function recordExport(s: { url: string; headers: Record<string, string> }, periodId: string, exportFormat: string, filePath: string, exportedBy: string) {
  await fetch(`${s.url}/rest/v1/payroll_exports`, {
    method: 'POST',
    headers: { ...s.headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ period_id: periodId, export_format: exportFormat, file_path: filePath, exported_by: exportedBy }),
  }).catch(() => {});
}

const CSV_HEADER = ['staff_id', 'staff_name', 'role_name', 'period_start', 'period_end', 'hours_worked', 'hourly_rate', 'overtime_hours', 'overtime_rate', 'tips_earned', 'tip_shortfall', 'gross_pay', 'deductions', 'net_pay'];

function toCsv(entries: PayrollEntry[]): string {
  const esc = (v: unknown) => {
    const str = String(v ?? '');
    return /[",\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [CSV_HEADER.join(',')];
  for (const e of entries) {
    lines.push(CSV_HEADER.map(h => esc((e as unknown as Record<string, unknown>)[h])).join(','));
  }
  const total: Record<string, unknown> = {
    staff_name: 'TOTAL',
    hours_worked: r2(entries.reduce((a, e) => a + Number(e.hours_worked || 0), 0)),
    overtime_hours: r2(entries.reduce((a, e) => a + Number(e.overtime_hours || 0), 0)),
    tips_earned: r2(entries.reduce((a, e) => a + Number(e.tips_earned || 0), 0)),
    gross_pay: r2(entries.reduce((a, e) => a + Number(e.gross_pay || 0), 0)),
    net_pay: r2(entries.reduce((a, e) => a + Number(e.net_pay || 0), 0)),
  };
  lines.push(CSV_HEADER.map(h => esc(total[h])).join(','));
  return lines.join('\r\n');
}

async function fetchPayrollEntries(s: { url: string; headers: Record<string, string> }, periodStart: string, periodEnd: string) {
  // RPC computes from LIVE data: time_clock_entries pairing (clock_in→clock_out),
  // approved overtime_records, tip_distributions, staff.hourly_rate/overtime_rate.
  const rpcRes = await fetch(`${s.url}/rest/v1/rpc/get_payroll_export`, {
    method: 'POST',
    headers: s.headers,
    body: JSON.stringify({ p_period_start: periodStart, p_period_end: periodEnd }),
  });
  const rpcData = await rpcRes.json().catch(() => null);
  if (!rpcRes.ok || !rpcData || !Array.isArray(rpcData.entries)) {
    const msg = (rpcData as any)?.error || (rpcData as any)?.message || `get_payroll_export failed (${rpcRes.status})`;
    throw new Error(msg);
  }
  return rpcData.entries as PayrollEntry[];
}

// GET /api/payroll/export?period_start=YYYY-MM-DD&period_end=YYYY-MM-DD&format=json|csv&staff_id=<optional>
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const { searchParams } = new URL(request.url);
    const periodStart = searchParams.get('period_start');
    const periodEnd = searchParams.get('period_end');
    const format = (searchParams.get('format') || 'json').toLowerCase();
    const staffId = searchParams.get('staff_id');

    if (!periodStart || !periodEnd) {
      return NextResponse.json({ error: 'period_start and period_end are required' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
      return NextResponse.json({ error: 'period_start/period_end must be YYYY-MM-DD' }, { status: 400 });
    }
    if (periodStart > periodEnd) {
      return NextResponse.json({ error: 'period_start must be before period_end' }, { status: 400 });
    }

    const s = svc();
    let entries = await fetchPayrollEntries(s, periodStart, periodEnd);
    if (staffId) entries = entries.filter(e => e.staff_id === staffId);

    if (format === 'csv') {
      const filename = `payroll-${periodStart}_${periodEnd}${staffId ? '_staff' : ''}.csv`;
      // Record the export (never block the download on bookkeeping failure).
      try {
        const periodId = await upsertPeriod(s, periodStart, periodEnd, entries);
        if (periodId) await recordExport(s, periodId, 'csv', filename, auth.user!.id);
      } catch { /* bookkeeping must not block the download */ }

      return new NextResponse('\uFEFF' + toCsv(entries), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ entries, period_start: periodStart, period_end: periodEnd });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/payroll/export — push the period export to an external payroll provider webhook.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { webhook_url, webhook_secret, provider, period_start, period_end } = body;

    if (!webhook_url || !period_start || !period_end) {
      return NextResponse.json({ error: 'webhook_url, period_start, and period_end are required' }, { status: 400 });
    }

    // 11g (freeze audit): GET validates the dates but POST did not — the
    // values were interpolated raw into PostgREST query strings. Same
    // calendar-strict gate as GET.
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (!DATE_RE.test(String(period_start)) || !DATE_RE.test(String(period_end))) {
      return NextResponse.json({ error: 'period_start/period_end must be YYYY-MM-DD' }, { status: 400 });
    }

    // 11g (freeze audit, SSRF): the webhook target is client-supplied.
    // Allow public http(s) only — block loopback/private/link-local/internal
    // names so this endpoint cannot be used to probe the host network.
    const isUnsafeHost = (host: string): boolean => {
      const h = host.toLowerCase().replace(/^\[|\]$/g, '');
      if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
      if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
      const m172 = h.match(/^172\.(\d{1,3})\./);
      if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return true;
      if (h === '::1' || h === '0:0:0:0' || h.startsWith('fe80')) return true;
      return false;
    };
    let wh: URL;
    try { wh = new URL(String(webhook_url)); } catch {
      return NextResponse.json({ error: 'webhook_url is not a valid URL' }, { status: 400 });
    }
    if (!/^https?:$/.test(wh.protocol) || isUnsafeHost(wh.hostname)) {
      return NextResponse.json({ error: 'webhook_url must be a public http(s) URL' }, { status: 400 });
    }

    const s = svc();
    const entries = await fetchPayrollEntries(s, period_start, period_end);

    const payload = {
      provider: provider || 'custom',
      period_start,
      period_end,
      exported_at: new Date().toISOString(),
      entries,
    };

    try {
      const webhookRes = await fetch(webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(webhook_secret && { 'X-Webhook-Secret': webhook_secret }),
        },
        body: JSON.stringify(payload),
      });

      if (!webhookRes.ok) {
        return NextResponse.json({ error: `Webhook failed: ${webhookRes.status}` }, { status: 400 });
      }

      // Record the export with the REAL payroll_exports schema (period_id/export_format/file_path/exported_by).
      try {
        const periodId = await upsertPeriod(s, period_start, period_end, entries);
        if (periodId) await recordExport(s, periodId, 'webhook', webhook_url, auth.user!.id);
      } catch { /* bookkeeping must not fail the send */ }

      return NextResponse.json({ success: true, entries: entries.length });
    } catch (webhookError: any) {
      return NextResponse.json({ error: `Webhook error: ${webhookError.message}` }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
