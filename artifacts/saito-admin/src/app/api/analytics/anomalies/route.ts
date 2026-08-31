import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

type Anomaly = {
  staff_id: string;
  staff_name: string;
  risk_score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  anomalies: Array<{
    type: string;
    label: string;
    value: number;
    baseline: number;
    severity: 'info' | 'warning' | 'danger';
    description: string;
  }>;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function scoreToLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 80) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('staff.view');
    if (!auth.authenticated) return auth as any;

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'week';
    const staffId = searchParams.get('staff_id');

    const s = svc();
    const now = new Date();
    const start = new Date();

    if (period === 'today') start.setHours(0, 0, 0, 0);
    else if (period === 'week') start.setDate(now.getDate() - 7);
    else if (period === 'month') start.setDate(now.getDate() - 30);
    else start.setDate(now.getDate() - 90);

    const startIso = start.toISOString();
    const baselineStart = new Date(start.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

    let staffQuery = `${s.url}/rest/v1/staff?select=id,name,role_id&is_active=eq.true&order=name.asc`;
    if (staffId) staffQuery += `&id=eq.${staffId}`;
    const staffRes = await fetch(staffQuery, { headers: s.headers });
    const staffList = await staffRes.json();

    if (!Array.isArray(staffList) || staffList.length === 0) {
      return NextResponse.json({ anomalies: [], period, generated_at: new Date().toISOString() });
    }

    const staffIds = staffList.map((s: any) => s.id).join(',');

    const [logsRes, shiftsRes, rolesRes] = await Promise.all([
      fetch(`${s.url}/rest/v1/operation_logs?performed_by=in.(${staffIds})&created_at=gte.${baselineStart}&select=performed_by,action,created_at,old_values,new_values&order=created_at.desc&limit=5000`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/shifts?staff_id=in.(${staffIds})&opened_at=gte.${baselineStart}&select=staff_id,expected_cash,actual_cash,difference,opened_at,closed_at&order=opened_at.desc`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/roles?select=id,name`, { headers: s.headers }),
    ]);

    const logs = await logsRes.json();
    const shifts = await shiftsRes.json();
    const roles = await rolesRes.json();
    const roleMap = new Map((roles || []).map((r: any) => [r.id, r.name]));

    const logsMap = new Map<string, any[]>();
    for (const log of (logs || [])) {
      const pid = log.performed_by;
      if (!logsMap.has(pid)) logsMap.set(pid, []);
      logsMap.get(pid)!.push(log);
    }

    const shiftsMap = new Map<string, any[]>();
    for (const sh of (shifts || [])) {
      const sid = sh.staff_id;
      if (!shiftsMap.has(sid)) shiftsMap.set(sid, []);
      shiftsMap.get(sid)!.push(sh);
    }

    const anomalies: Anomaly[] = [];

    for (const member of staffList) {
      const allLogs = logsMap.get(member.id) || [];
      const allShifts = shiftsMap.get(member.id) || [];

      const periodLogs = allLogs.filter(l => l.created_at >= startIso);
      const baselineLogs = allLogs.filter(l => l.created_at >= baselineStart && l.created_at < startIso);

      const periodShifts = allShifts.filter(sh => sh.opened_at >= startIso);
      const baselineShifts = allShifts.filter(sh => sh.opened_at >= baselineStart && sh.opened_at < startIso);

      const periodVoids = periodLogs.filter(l => l.action === 'void_order').length;
      const periodRefunds = periodLogs.filter(l => l.action === 'refund').length;
      const periodDiscounts = periodLogs.filter(l => l.action === 'discount').length;
      const periodOverrides = periodLogs.filter(l => l.action === 'price_override').length;

      const baselineVoids = baselineLogs.filter(l => l.action === 'void_order').length;
      const baselineRefunds = baselineLogs.filter(l => l.action === 'refund').length;
      const baselineDiscounts = baselineLogs.filter(l => l.action === 'discount').length;
      const baselineOverrides = baselineLogs.filter(l => l.action === 'price_override').length;

      const baselineDays = Math.max(1, (new Date(baselineStart).getTime() - new Date(baselineStart).getTime()) / (1000 * 60 * 60 * 24));
      const baselineShiftCount = Math.max(1, baselineShifts.length);
      const periodShiftCount = Math.max(1, periodShifts.length);

      const avgVoidsPerShift = baselineVoids / baselineShiftCount;
      const avgRefundsPerShift = baselineRefunds / baselineShiftCount;
      const avgDiscountsPerShift = baselineDiscounts / baselineShiftCount;
      const avgOverridesPerShift = baselineOverrides / baselineShiftCount;

      const currentVoidsPerShift = periodVoids / periodShiftCount;
      const currentRefundsPerShift = periodRefunds / periodShiftCount;
      const currentDiscountsPerShift = periodDiscounts / periodShiftCount;
      const currentOverridesPerShift = periodOverrides / periodShiftCount;

      const cashVariances = periodShifts.filter(sh => sh.difference !== null && sh.difference !== undefined).map(sh => Number(sh.difference) || 0);
      const totalCashVariance = cashVariances.reduce((a, b) => a + b, 0);
      const avgCashVariance = cashVariances.length > 0 ? totalCashVariance / cashVariances.length : 0;

      const staffAnomalies: Anomaly['anomalies'] = [];
      let riskScore = 0;

      const voidRatio = avgVoidsPerShift > 0 ? currentVoidsPerShift / avgVoidsPerShift : (currentVoidsPerShift > 3 ? 5 : 0);
      if (voidRatio >= 3 || currentVoidsPerShift >= 5) {
        staffAnomalies.push({ type: 'voids', label: 'Voids', value: periodVoids, baseline: Math.round(avgVoidsPerShift * periodShiftCount), severity: 'danger', description: `${periodVoids} voids this period (avg: ${avgVoidsPerShift.toFixed(1)}/shift)` });
        riskScore += clamp((voidRatio - 1) * 20, 0, 35);
      } else if (voidRatio >= 2) {
        staffAnomalies.push({ type: 'voids', label: 'Voids', value: periodVoids, baseline: Math.round(avgVoidsPerShift * periodShiftCount), severity: 'warning', description: `${periodVoids} voids this period (avg: ${avgVoidsPerShift.toFixed(1)}/shift)` });
        riskScore += clamp((voidRatio - 1) * 15, 0, 20);
      }

      const refundRatio = avgRefundsPerShift > 0 ? currentRefundsPerShift / avgRefundsPerShift : (currentRefundsPerShift >= 3 ? 5 : 0);
      if (refundRatio >= 3 || currentRefundsPerShift >= 4) {
        staffAnomalies.push({ type: 'refunds', label: 'Refunds', value: periodRefunds, baseline: Math.round(avgRefundsPerShift * periodShiftCount), severity: 'danger', description: `${periodRefunds} refunds this period (avg: ${avgRefundsPerShift.toFixed(1)}/shift)` });
        riskScore += clamp((refundRatio - 1) * 20, 0, 30);
      } else if (refundRatio >= 2) {
        staffAnomalies.push({ type: 'refunds', label: 'Refunds', value: periodRefunds, baseline: Math.round(avgRefundsPerShift * periodShiftCount), severity: 'warning', description: `${periodRefunds} refunds this period (avg: ${avgRefundsPerShift.toFixed(1)}/shift)` });
        riskScore += clamp((refundRatio - 1) * 15, 0, 15);
      }

      const discountRatio = avgDiscountsPerShift > 0 ? currentDiscountsPerShift / avgDiscountsPerShift : (currentDiscountsPerShift >= 5 ? 5 : 0);
      if (discountRatio >= 3 || currentDiscountsPerShift >= 6) {
        staffAnomalies.push({ type: 'discounts', label: 'Discounts', value: periodDiscounts, baseline: Math.round(avgDiscountsPerShift * periodShiftCount), severity: 'danger', description: `${periodDiscounts} discounts this period (avg: ${avgDiscountsPerShift.toFixed(1)}/shift)` });
        riskScore += clamp((discountRatio - 1) * 15, 0, 25);
      } else if (discountRatio >= 2) {
        staffAnomalies.push({ type: 'discounts', label: 'Discounts', value: periodDiscounts, baseline: Math.round(avgDiscountsPerShift * periodShiftCount), severity: 'warning', description: `${periodDiscounts} discounts this period (avg: ${avgDiscountsPerShift.toFixed(1)}/shift)` });
        riskScore += clamp((discountRatio - 1) * 10, 0, 12);
      }

      const overrideRatio = avgOverridesPerShift > 0 ? currentOverridesPerShift / avgOverridesPerShift : (currentOverridesPerShift >= 3 ? 5 : 0);
      if (overrideRatio >= 3 || currentOverridesPerShift >= 4) {
        staffAnomalies.push({ type: 'overrides', label: 'Price Overrides', value: periodOverrides, baseline: Math.round(avgOverridesPerShift * periodShiftCount), severity: 'danger', description: `${periodOverrides} price overrides this period` });
        riskScore += clamp((overrideRatio - 1) * 20, 0, 25);
      } else if (overrideRatio >= 2) {
        staffAnomalies.push({ type: 'overrides', label: 'Price Overrides', value: periodOverrides, baseline: Math.round(avgOverridesPerShift * periodShiftCount), severity: 'warning', description: `${periodOverrides} price overrides this period` });
        riskScore += clamp((overrideRatio - 1) * 15, 0, 12);
      }

      if (cashVariances.length >= 2) {
        if (avgCashVariance < -50) {
          staffAnomalies.push({ type: 'cash_shortage', label: 'Cash Shortage', value: Math.round(avgCashVariance), baseline: 0, severity: 'danger', description: `Avg cash shortage: ${Math.round(avgCashVariance)} over ${cashVariances.length} shifts` });
          riskScore += clamp(Math.abs(avgCashVariance) / 10, 0, 30);
        } else if (avgCashVariance < -20) {
          staffAnomalies.push({ type: 'cash_shortage', label: 'Cash Shortage', value: Math.round(avgCashVariance), baseline: 0, severity: 'warning', description: `Avg cash variance: ${Math.round(avgCashVariance)} over ${cashVariances.length} shifts` });
          riskScore += clamp(Math.abs(avgCashVariance) / 10, 0, 15);
        }
      }

      if (periodShiftCount === 0 && baselineShiftCount > 0) {
        staffAnomalies.push({ type: 'no_shift', label: 'No Activity', value: 0, baseline: Math.round(baselineShifts.length / 7), severity: 'info', description: 'No shifts this period despite historical activity' });
      }

      riskScore = clamp(riskScore, 0, 100);

      if (staffAnomalies.length > 0) {
        anomalies.push({
          staff_id: member.id,
          staff_name: member.name,
          risk_score: Math.round(riskScore),
          level: scoreToLevel(riskScore),
          anomalies: staffAnomalies,
        });
      }
    }

    anomalies.sort((a, b) => b.risk_score - a.risk_score);

    return NextResponse.json({ anomalies, period, generated_at: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
