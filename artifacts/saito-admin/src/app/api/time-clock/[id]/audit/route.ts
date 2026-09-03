import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

// GET /api/time-clock/[id]/audit?limit=50
// Returns recent time_clock_entries (the audit source of truth) for a staff member.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('timeclock.override');
    if (auth instanceof NextResponse) return auth;

    const s = svc();
    const { id } = await params;
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);

    const res = await fetch(
      `${s.url}/rest/v1/time_clock_entries?staff_id=eq.${id}&order=timestamp.desc&limit=${limit}&select=id,entry_type,timestamp,pin_verified,notes,approved_by,is_manual_entry,source,created_at`,
      { headers: s.headers }
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to load audit trail' }, { status: res.status });
    }

    const entries = await res.json();
    return NextResponse.json({ entries });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
