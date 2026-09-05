import { NextResponse } from 'next/server';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

async function rpc(s: { url: string; headers: Record<string, string> }, fn: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${s.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: s.headers,
    body: JSON.stringify(body),
  });
  return res.ok ? res.json() : null;
}

export async function GET() {
  try {
    const s = svc();

    // Pull LIVE data straight from the fixed RPCs (SSOT).
    const [kpisRes, dirRes, splhRes] = await Promise.all([
      rpc(s, 'get_staff_kpis'),
      rpc(s, 'get_staff_directory_v3'),
      rpc(s, 'get_splh_metrics'),
    ]);

    const shiftsRes = await fetch(
      `${s.url}/rest/v1/shifts?select=*,staff:staff_id(name,role:role_id(name))&closed_at=is.null&order=opened_at.desc`,
      { headers: s.headers },
    );

    // Dedupe by staff id (RPC can return one row per open shift; keep first).
    const seen = new Set<string>();
    const staff = (Array.isArray(dirRes) ? dirRes : []).filter((m: any) => {
      if (m.id == null || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    const splh = splhRes && typeof splhRes === 'object' ? (splhRes as any).splh || 0 : 0;
    const kpis = { ...(kpisRes || {}), splh };
    const liveShifts = shiftsRes.ok ? await shiftsRes.json() : [];

    return NextResponse.json({ kpis, staff, liveShifts: Array.isArray(liveShifts) ? liveShifts : [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}