import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission, sanitizeStaff, sanitizeStaffArray } from '@/lib/api-auth';
import { createAuthClient } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('staff.view', ['admin', 'superadmin']);
    if (!auth.authenticated) return auth as any;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const roleFilter = searchParams.get('role') || '';
    const statusFilter = searchParams.get('status') || '';

    const s = svc();

    let query = `${s.url}/rest/v1/staff?select=*&order=name.asc`;

    const filters: string[] = [];
    if (roleFilter) filters.push(`role=eq.${roleFilter}`);
    if (statusFilter === 'active') filters.push('is_active=eq.true');
    if (statusFilter === 'inactive') filters.push('is_active=eq.false');

    if (filters.length > 0) {
      query += '&' + filters.join('&');
    }

    const res = await fetch(query, { headers: s.headers });
    const staffList = await res.json();

    if (!Array.isArray(staffList)) {
      return NextResponse.json([]);
    }

    let filtered = sanitizeStaffArray(staffList);

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((s: any) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.role || '').toLowerCase().includes(q) ||
        (s.phone || '').includes(q)
      );
    }

    const staffIds = filtered.map((s: any) => s.id);

    let shifts: any[] = [];
    let activeShifts: any[] = [];
    let orderStats: any[] = [];

    if (staffIds.length > 0) {
      const ids = staffIds.join(',');

      const shiftsRes = await fetch(`${s.url}/rest/v1/shifts?staff_id=in.(${ids})&order=opened_at.desc&limit=100`, { headers: s.headers });
      shifts = await shiftsRes.json();

      activeShifts = (shifts || []).filter((sh: any) => !sh.closed_at);

      const statsRes = await fetch(`${s.url}/rest/v1/operation_logs?performed_by=in.(${ids})&select=performed_by,action,created_at&order=created_at.desc&limit=500`, { headers: s.headers });
      orderStats = await statsRes.json();
    }

    const staffWithMeta = filtered.map((member: any) => {
      const memberShifts = (shifts || []).filter((sh: any) => sh.staff_id === member.id);
      const activeShift = memberShifts.find((sh: any) => !sh.closed_at);
      const memberActions = (orderStats || []).filter((a: any) => a.performed_by === member.id);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();

      const todayActions = memberActions.filter((a: any) => a.created_at >= todayStr);
      const todayOrders = todayActions.filter((a: any) => ['place_order', 'send_to_kitchen', 'complete_payment'].includes(a.action)).length;

      const totalShifts = memberShifts.length;
      const totalHours = memberShifts.reduce((sum: number, sh: any) => {
        if (!sh.opened_at || !sh.closed_at) return sum;
        const diff = new Date(sh.closed_at).getTime() - new Date(sh.opened_at).getTime();
        return sum + diff / (1000 * 60 * 60);
      }, 0);

      return {
        ...member,
        activeShift,
        todayOrders,
        totalShifts,
        totalHours: Math.round(totalHours * 10) / 10,
        lastAction: memberActions[0]?.created_at || null,
      };
    });

    return NextResponse.json(staffWithMeta);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('staff.manage', ['admin', 'superadmin']);
    if (!auth.authenticated) return auth as any;

    const body = await request.json();
    const { name, role, role_id, shift, phone, pin, is_active } = body;

    if (!name || (!role_id && !role)) {
      return NextResponse.json({ error: 'Ad və rol tələb olunur' }, { status: 400 });
    }

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

    const insertData: any = {
      name: name.trim(),
      role: role?.trim() || '',
      role_id: finalRoleId || null,
      shift: shift?.trim() || null,
      phone: phone?.trim() || null,
      is_active: is_active ?? true,
    };

    if (pin && pin.length === 4) {
      const hash = await import('@/lib/crypto').then(m => m.hashPin(pin));
      insertData.pin_hash = hash;
    }

    const res = await fetch(`${s.url}/rest/v1/staff`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(insertData),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Xəta baş verdi' }, { status: 400 });
    }

    const created = Array.isArray(data) ? data[0] : data;

    await fetch(`${s.url}/rest/v1/operation_logs`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        action: 'create_staff',
        new_values: { id: created.id, name: created.name, role_id: created.role_id },
        performed_by: auth.user?.id,
      }),
    });

    return NextResponse.json({ success: true, data: sanitizeStaff(created) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
