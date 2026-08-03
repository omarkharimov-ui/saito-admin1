import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET() {
  try {
    const auth = await requireAuth(['admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/settings?select=*&key=in.(printer_*,device_*)`, { headers: s.headers });
    const data = await res.json();

    return NextResponse.json({ settings: Array.isArray(data) ? data : [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const body = await req.json();
    const { key, value } = body;

    if (!key) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 });
    }

    const s = svc();
    const upsertRes = await fetch(`${s.url}/rest/v1/settings`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({ key, value: typeof value === 'object' ? JSON.stringify(value) : String(value), updated_at: new Date().toISOString() }),
    });

    if (!upsertRes.ok) {
      return NextResponse.json({ error: 'Failed to save setting' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
