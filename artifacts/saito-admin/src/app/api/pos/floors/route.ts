import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

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

// Resolve the caller's ACTIVE location (server-trusted, F-02 pattern).
async function sessionLocation(SUPABASE_URL: string, headers: Record<string, string>, token: string): Promise<{ id: string; org: string } | null> {
  try {
    const sres = await fetch(`${SUPABASE_URL}/rest/v1/sessions?select=active_location_id,organization_id&token=eq.${encodeURIComponent(token)}&limit=1`, { headers });
    const s = await sres.json();
    const row = Array.isArray(s) ? s[0] : s;
    if (!row?.active_location_id) return row?.organization_id ? { id: '', org: row.organization_id } : null;
    return { id: row.active_location_id, org: row.organization_id || '' };
  } catch {
    return null;
  }
}

export async function GET() {
  const auth = await requirePermission('floor.manage');
  if (!auth.authenticated) return auth;

  const { SUPABASE_URL, headers } = getHeaders();
  try {
    const sess = await sessionLocation(SUPABASE_URL, headers, auth.token || '');
    // F-03: plan is per-location. Session location filters; fallback = all.
    const locFilter = sess?.id ? `&location_id=eq.${encodeURIComponent(sess.id)}` : '';
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/table_floors?select=*&order=sort_order.asc${locFilter}`,
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
  const auth = await requirePermission('floor.manage');
  if (!auth.authenticated) return auth;

  const { SUPABASE_URL, headers } = getHeaders();
  try {
    const { floors, location_id } = await request.json();
    if (!Array.isArray(floors)) {
      return NextResponse.json({ error: 'floors array required' }, { status: 400 });
    }

    // F-03: plan is per-location. Client value is only accepted if it matches
    // the session's active location (never the sole source of authorization).
    const sess = await sessionLocation(SUPABASE_URL, headers, auth.token || '');
    const locId = location_id || sess?.id || '';
    if (!locId) {
      return NextResponse.json({ error: 'location required (session has no active location)' }, { status: 400 });
    }
    if (location_id && sess?.id && location_id !== sess.id) {
      return NextResponse.json({ error: 'FORBIDDEN_LOCATION' }, { status: 403 });
    }
    const orgId = sess?.org || '';

    const currentNames = floors.map((f: any) => f.name);

    const allRes = await fetch(
      `${SUPABASE_URL}/rest/v1/table_floors?select=id,floor_name,table_number,is_archived&location_id=eq.${encodeURIComponent(locId)}`,
      { headers }
    );
    const allRows = await allRes.json();

    if (Array.isArray(allRows)) {
      // F-04 (frozen): NO hard delete. Rows absent from the new plan are
      // ARCHIVED (soft) — history + order references are preserved and the
      // (location_id, table_number) identity stays occupied, so numbers can
      // never be silently reused.
      const toArchive = allRows
        .filter((r: any) => !currentNames.includes(r.floor_name) && r.table_number !== 0)
        .map((r: any) => r.id);
      if (toArchive.length > 0) {
        const idOr = toArchive.map((id) => `id.eq.${id}`).join(',');
        await fetch(`${SUPABASE_URL}/rest/v1/table_floors?or=(${idOr})`, {
          headers: { ...headers, 'Prefer': 'return=minimal' },
          method: 'PATCH',
          body: JSON.stringify({ is_archived: true, archived_at: new Date().toISOString() }),
        });
      }
    }

    // Per-floor: UPSERT (match location_id+floor_name+table_number) instead of
    // delete+insert — preserves row identity (id, history pointers).
    for (const floor of floors) {
      const desired = floor.tables?.length
        ? floor.tables.map((n: number) => ({ table_number: n }))
        : [{ table_number: 0 }];

      for (const d of desired) {
        const match = await fetch(
          `${SUPABASE_URL}/rest/v1/table_floors?select=id,is_archived&location_id=eq.${encodeURIComponent(locId)}&floor_name=eq.${encodeURIComponent(floor.name)}&table_number=eq.${d.table_number}`,
          { headers }
        );
        const matched = (await match.json()) as any[];
        if (Array.isArray(matched) && matched.length > 0) {
          if (matched.some((m) => m.is_archived)) {
            // re-added to plan → un-archive (row identity preserved)
            await fetch(
              `${SUPABASE_URL}/rest/v1/table_floors?id=in.(${matched.map((m) => m.id).join(',')})`,
              {
                headers: { ...headers, 'Prefer': 'return=minimal' },
                method: 'PATCH',
                body: JSON.stringify({ is_archived: false, archived_at: null, sort_order: floor.sort_order }),
              }
            );
          }
        } else {
          await fetch(`${SUPABASE_URL}/rest/v1/table_floors`, {
            headers: { ...headers, 'Prefer': 'return=minimal' },
            method: 'POST',
            body: JSON.stringify({
              table_number: d.table_number,
              floor_name: floor.name,
              sort_order: floor.sort_order,
              location_id: locId,
              organization_id: orgId || null,
            }),
          });
        }
      }
    }

    return NextResponse.json({ success: true, archived: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
