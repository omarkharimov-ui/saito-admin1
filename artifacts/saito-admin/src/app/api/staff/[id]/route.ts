import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, sanitizeStaff } from '@/lib/api-auth';
import { createAuthClient } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

function dateRange(period: string) {
  const now = new Date();
  const start = new Date();
  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    const day = now.getDay() || 7;
    start.setDate(now.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setFullYear(now.getFullYear() - 10);
  }
  return { start: start.toISOString(), end: now.toISOString() };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('staff.view', ['admin', 'superadmin']);
    if (!auth.authenticated) return auth as any;

    const { id: staffId } = await params;
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'today';

    const s = svc();

    const staffRes = await fetch(`${s.url}/rest/v1/staff?id=eq.${staffId}&select=*`, { headers: s.headers });
    const staffList = await staffRes.json();
    const staff = Array.isArray(staffList) ? sanitizeStaff(staffList[0]) : null;
    console.log('DEBUG staff:', staff ? staff.name : 'NULL');

    if (!staff) {
      return NextResponse.json({ error: 'İşçi tapılmadı' }, { status: 404 });
    }

    const shiftsRes = await fetch(`${s.url}/rest/v1/shifts?staff_id=eq.${staffId}&order=opened_at.desc&limit=50`, { headers: s.headers });
    const shifts = await shiftsRes.json();

    const { start, end } = dateRange(period);

    const logsRes = await fetch(
      `${s.url}/rest/v1/operation_logs?performed_by=eq.${staffId}&created_at=gte.${start}&created_at=lte.${end}&order=created_at.desc&limit=200`,
      { headers: s.headers }
    );
    const logs = await logsRes.json();

    const orderActions = (logs || []).filter((l: any) =>
      ['place_order', 'send_to_kitchen', 'complete_payment', 'create_order'].includes(l.action)
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const allActions = (logs || []).filter((l: any) => l.created_at >= todayStr);

    const todayOrders = allActions.filter((l: any) =>
      ['place_order', 'send_to_kitchen', 'complete_payment', 'create_order'].includes(l.action)
    ).length;

    const todayVoids = allActions.filter((l: any) => l.action === 'void_order').length;
    const todayWaste = allActions.filter((l: any) => l.action === 'waste').length;
    const todayRefunds = allActions.filter((l: any) => l.action === 'refund').length;
    const todayDiscounts = allActions.filter((l: any) => l.action === 'discount').length;

    const totalRevenue = orderActions.reduce((sum: number, l: any) => {
      const amount = l.new_values?.total_amount || l.new_values?.amount || 0;
      return sum + Number(amount);
    }, 0);

    const avgCheck = orderActions.length > 0 ? totalRevenue / orderActions.length : 0;

    const totalShifts = Array.isArray(shifts) ? shifts.length : 0;
    const totalHours = (shifts || []).reduce((sum: number, sh: any) => {
      if (!sh.opened_at || !sh.closed_at) return sum;
      const diff = new Date(sh.closed_at).getTime() - new Date(sh.opened_at).getTime();
      return sum + diff / (1000 * 60 * 60);
    }, 0);

    const activeShift = (shifts || []).find((sh: any) => !sh.closed_at);

    const recentActions = (logs || []).slice(0, 20);

    const lastAction = (logs || [])[0] || null;

    return NextResponse.json({
      staff,
      stats: {
        period,
        totalOrders: orderActions.length,
        totalRevenue,
        avgCheck,
        todayOrders,
        todayVoids,
        todayWaste,
        todayRefunds,
        todayDiscounts,
        totalShifts,
        totalHours: Math.round(totalHours * 10) / 10,
      },
      activeShift,
      recentActions,
      lastAction,
      shifts: (shifts || []).slice(0, 10),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('staff.manage', ['admin', 'superadmin']);
    if (!auth.authenticated) return auth as any;

    const { id: staffId } = await params;
    const body = await request.json();
    const { name, role, role_id, shift, phone, pin, is_active } = body;

    const s = svc();
    const supabase = await createAuthClient();

    let finalRoleId = role_id;
    if (finalRoleId) {
      const { data: roleCheck } = await supabase
        .from('roles')
        .select('id')
        .eq('id', finalRoleId)
        .maybeSingle();

      if (!roleCheck) {
        return NextResponse.json({ error: 'Yanlış role_id' }, { status: 400 });
      }
    } else if (role) {
      const { data: matchedRole } = await supabase
        .from('roles')
        .select('id')
        .ilike('name', role.trim())
        .maybeSingle();

      if (matchedRole) {
        finalRoleId = matchedRole.id;
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name.trim();
    if (role !== undefined) updateData.role = role?.trim() || '';
    if (shift !== undefined) updateData.shift = shift?.trim() || null;
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (finalRoleId) updateData.role_id = finalRoleId;

    if (pin && pin.length === 4) {
      const hash = await import('@/lib/crypto').then(m => m.hashPin(pin));
      updateData.pin_hash = hash;
    }

    const res = await fetch(`${s.url}/rest/v1/staff?id=eq.${staffId}`, {
      method: 'PATCH',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(updateData),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Xəta baş verdi' }, { status: 400 });
    }

    const updated = Array.isArray(data) ? data[0] : data;

    await fetch(`${s.url}/rest/v1/operation_logs`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        action: 'update_staff',
        old_values: { id: staffId },
        new_values: updateData,
        performed_by: auth.user?.id,
      }),
    });

    return NextResponse.json({ success: true, data: sanitizeStaff(updated) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
