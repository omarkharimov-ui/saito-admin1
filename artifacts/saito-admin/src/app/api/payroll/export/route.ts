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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const { searchParams } = new URL(request.url);
    const periodStart = searchParams.get('period_start');
    const periodEnd = searchParams.get('period_end');
    const staffId = searchParams.get('staff_id');

    if (!periodStart || !periodEnd) {
      return NextResponse.json({ error: 'period_start and period_end are required' }, { status: 400 });
    }

    const s = svc();
    let query = `${s.url}/rest/v1/staff?select=id,name,role:role_id(name),hourly_rate,overtime_rate&is_active=eq.true`;
    if (staffId) query += `&id=eq.${staffId}`;

    const staffRes = await fetch(query, { headers: s.headers });
    const staffList = await staffRes.json();

    const entries: PayrollEntry[] = [];

    for (const staff of Array.isArray(staffList) ? staffList : []) {
      const timeRes = await fetch(`${s.url}/rest/v1/time_clock_entries?staff_id=eq.${staff.id}&clock_in=gte.${periodStart}&clock_out=lte.${periodEnd}&select=clock_in,clock_out`, { headers: s.headers });
      const timeEntries = await timeRes.json();

      let totalHours = 0;
      let overtimeHours = 0;

      for (const entry of Array.isArray(timeEntries) ? timeEntries : []) {
        if (entry.clock_in && entry.clock_out) {
          const hours = (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / (1000 * 60 * 60);
          totalHours += hours;
          if (hours > 8) overtimeHours += hours - 8;
        }
      }

      const tipsRes = await fetch(`${s.url}/rest/v1/shift_reviews?staff_id=eq.${staff.id}&select=declared_cash_tips,shifts!inner(opened_at)&shifts.opened_at=gte.${periodStart}&shifts.opened_at=lte.${periodEnd}`, { headers: s.headers });
      const tipsData = await tipsRes.json();
      const tipsEarned = Array.isArray(tipsData) ? tipsData.reduce((sum: number, r: any) => sum + (r.declared_cash_tips || 0), 0) : 0;

      const shortfallRes = await fetch(`${s.url}/rest/v1/tip_shortfalls?staff_id=eq.${staff.id}&period_start=gte.${periodStart}&period_end=lte.${periodEnd}&select=shortfall_amount`, { headers: s.headers });
      const shortfallData = await shortfallRes.json();
      const tipShortfall = Array.isArray(shortfallData) && shortfallData.length > 0 ? shortfallData[0].shortfall_amount : 0;

      const hourlyRate = Number(staff.hourly_rate) || 0;
      const overtimeRate = Number(staff.overtime_rate) || (hourlyRate * 1.5);
      const grossPay = (totalHours * hourlyRate) + (overtimeHours * overtimeRate) + tipsEarned;
      const netPay = grossPay - tipShortfall;

      entries.push({
        staff_id: staff.id,
        staff_name: staff.name,
        role_name: staff.role?.name || '—',
        period_start: periodStart,
        period_end: periodEnd,
        hours_worked: totalHours,
        hourly_rate: hourlyRate,
        overtime_hours: overtimeHours,
        overtime_rate: overtimeRate,
        tips_earned: tipsEarned,
        tip_shortfall: tipShortfall,
        gross_pay: grossPay,
        deductions: tipShortfall,
        net_pay: netPay,
      });
    }

    return NextResponse.json({ entries, period_start: periodStart, period_end: periodEnd });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { webhook_url, webhook_secret, provider, period_start, period_end } = body;

    if (!webhook_url || !period_start || !period_end) {
      return NextResponse.json({ error: 'webhook_url, period_start, and period_end are required' }, { status: 400 });
    }

    const s = svc();

    const exportRes = await fetch(`${s.url}/rest/v1/rpc/get_payroll_export?p_period_start=${period_start}&p_period_end=${period_end}`);
    const exportData = await exportRes.json();

    if (!exportData || !Array.isArray(exportData.entries)) {
      return NextResponse.json({ error: 'Failed to generate payroll export' }, { status: 400 });
    }

    const payload = {
      provider: provider || 'custom',
      period_start: period_start,
      period_end: period_end,
      exported_at: new Date().toISOString(),
      entries: exportData.entries,
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

      await fetch(`${s.url}/rest/v1/payroll_exports`, {
        method: 'POST',
        headers: { ...s.headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          provider,
          period_start: period_start,
          period_end: period_end,
          webhook_url,
          status: 'sent',
          sent_at: new Date().toISOString(),
          entries_count: exportData.entries.length,
        }),
      }).catch(() => {});

      return NextResponse.json({ success: true, entries: exportData.entries.length });
    } catch (webhookError: any) {
      return NextResponse.json({ error: `Webhook error: ${webhookError.message}` }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
