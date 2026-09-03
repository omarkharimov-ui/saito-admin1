import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

// GET /api/staff/announcements -> visible, non-expired announcements
export async function GET() {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const s = svc();

    const res = await fetch(
      `${s.url}/rest/v1/staff_announcements?select=*&is_visible=eq.true&order=created_at.desc&limit=20`,
      { headers: s.headers }
    );
    const rows = await res.json();
    const list = Array.isArray(rows) ? rows : [];
    const now = new Date().toISOString();
    const visible = list.filter((a: any) => {
      if (a.expires_at && new Date(a.expires_at).getTime() < Date.now()) return false;
      return (
        a.audience === 'all' ||
        (a.audience === 'role' && Array.isArray(a.role_ids) && a.role_ids.includes(a.staff_role?.id)) ||
        (a.audience === 'staff' && Array.isArray(a.staff_ids) && a.staff_ids.includes(auth.user!.id))
      );
    });

    return NextResponse.json({
      announcements: visible.map((a: any) => ({
        id: a.id,
        title: a.title,
        body: a.body || null,
        is_sticky: a.is_sticky || false,
        created_at: a.created_at,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
