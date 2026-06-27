import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function getHeaders() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {
    SUPABASE_URL,
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  };
}

export async function GET() {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { SUPABASE_URL, headers } = getHeaders();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/table_floors?select=*&order=sort_order.asc`,
      { headers }
    );
    const data = await res.json();
    return NextResponse.json({ floors: Array.isArray(data) ? data : [] }, {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { SUPABASE_URL, headers } = getHeaders();
  try {
    const { floors } = await request.json();
    if (!Array.isArray(floors)) {
      return NextResponse.json({ error: 'floors array required' }, { status: 400 });
    }

    const currentNames = floors.map((f: any) => f.name);

    const allRes = await fetch(`${SUPABASE_URL}/rest/v1/table_floors?select=id,floor_name`, { headers });
    const allRows = await allRes.json();

    if (Array.isArray(allRows) && allRows.length > 0) {
      const toDelete = allRows.filter((r: any) => !currentNames.includes(r.floor_name)).map((r: any) => r.id);
      if (toDelete.length > 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/table_floors?id=in.(${toDelete.map((id: string) => `"${id}"`).join(',')})`, {
          headers: { ...headers, 'Prefer': 'return=minimal' },
          method: 'DELETE',
        });
      }
    }

    // Per-floor: delete old, insert current
    for (const floor of floors) {
      await fetch(`${SUPABASE_URL}/rest/v1/table_floors?floor_name=eq.${encodeURIComponent(floor.name)}`, {
        headers: { ...headers, 'Prefer': 'return=minimal' },
        method: 'DELETE',
      });

      if (floor.tables.length === 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/table_floors`, {
          headers: { ...headers, 'Prefer': 'return=minimal' },
          method: 'POST',
          body: JSON.stringify({
            table_number: 0,
            floor_name: floor.name,
            sort_order: floor.sort_order,
          }),
        });
      } else {
        for (const tableNum of floor.tables) {
          await fetch(`${SUPABASE_URL}/rest/v1/table_floors`, {
            headers: { ...headers, 'Prefer': 'return=minimal' },
            method: 'POST',
            body: JSON.stringify({
              table_number: tableNum,
              floor_name: floor.name,
              sort_order: floor.sort_order,
            }),
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
