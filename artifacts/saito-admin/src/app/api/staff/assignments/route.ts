import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

function getHeaders() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {
    SUPABASE_URL,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  };
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission('staff.view');
  if (!auth.authenticated) return auth as any;

  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role')?.toLowerCase() || '';

  if (!role) {
    return NextResponse.json({ error: 'role query param required' }, { status: 400 });
  }

  const { SUPABASE_URL, headers } = getHeaders();

  try {
    if (role === 'waiter') {
      const [floorsRes, staffRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/table_floors?select=floor_name,table_number,waiter_id&order=floor_name.asc,table_number.asc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/staff?select=id,full_name,name`, { headers }),
      ]);

      const floors = await floorsRes.json();
      const allStaff = await staffRes.json();
      const staffMap = new Map((Array.isArray(allStaff) ? allStaff : []).map((s: any) => [s.id, s.full_name || s.name]));

      const floorGroups: Record<string, { name: string; tables: any[] }> = {};

      (Array.isArray(floors) ? floors : []).forEach((t: any) => {
        const floorName = t.floor_name || 'Main';
        if (!floorGroups[floorName]) floorGroups[floorName] = { name: floorName, tables: [] };
        floorGroups[floorName].tables.push({
          id: `table-${t.table_number}`,
          label: `Masa ${t.table_number}`,
          assigned: !!t.waiter_id,
          assignedTo: t.waiter_id ? staffMap.get(t.waiter_id) : null,
        });
      });

      return NextResponse.json({
        type: 'floors',
        options: Object.values(floorGroups),
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (role === 'cashier' || role === 'bartender') {
      const registersRes = await fetch(`${SUPABASE_URL}/rest/v1/cash_registers?select=*&order=name.asc`, { headers });
      const registers = await registersRes.json();

      return NextResponse.json({
        type: 'registers',
        options: (Array.isArray(registers) ? registers : []).map((r: any) => ({
          id: r.id,
          label: r.name,
          sublabel: r.terminal_id || undefined,
          status: r.status,
        })),
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (role === 'kitchen') {
      const stationsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/stations?select=*&station_type=eq.kitchen&is_active=eq.true&order=name`,
        { headers }
      );
      const stations = await stationsRes.json();

      return NextResponse.json({
        type: 'stations',
        options: (Array.isArray(stations) ? stations : []).map((s: any) => ({
          id: s.id,
          label: s.name,
          sublabel: s.station_type,
        })),
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (role === 'manager' || role === 'host') {
      const locationsRes = await fetch(`${SUPABASE_URL}/rest/v1/locations?is_active=eq.true&select=*&order=name.asc`, { headers });
      const locations = await locationsRes.json();

      return NextResponse.json({
        type: 'locations',
        options: (Array.isArray(locations) ? locations : []).map((l: any) => ({
          id: l.id,
          label: l.name,
          sublabel: l.address || undefined,
        })),
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json({ type: 'none', options: [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
