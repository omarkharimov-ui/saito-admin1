import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

export async function GET() {
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
  try {
    const { floors } = await request.json();
    if (!Array.isArray(floors)) {
      return NextResponse.json({ error: 'floors array required' }, { status: 400 });
    }

    const currentNames = floors.map((f: any) => f.name);

    // Fetch all existing rows
    const allRes = await fetch(`${SUPABASE_URL}/rest/v1/table_floors?select=id,floor_name`, { headers });
    const allRows = await allRes.json();

    if (Array.isArray(allRows) && allRows.length > 0) {
      // Delete rows whose floor_name is NOT in the current list
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
      // Delete existing rows for this floor
      await fetch(`${SUPABASE_URL}/rest/v1/table_floors?floor_name=eq.${encodeURIComponent(floor.name)}`, {
        headers: { ...headers, 'Prefer': 'return=minimal' },
        method: 'DELETE',
      });

      // Insert current rows
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
