import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/payroll_webhook_configs?select=*&order=created_at.desc`, {
      headers: s.headers,
    });

    const data = await res.json();
    return NextResponse.json({ configs: Array.isArray(data) ? data : [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { provider, webhook_url, webhook_secret } = body;

    if (!provider || !webhook_url) {
      return NextResponse.json({ error: 'provider and webhook_url are required' }, { status: 400 });
    }

    const s = svc();

    await fetch(`${s.url}/rest/v1/payroll_webhook_configs`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        provider,
        webhook_url,
        webhook_secret: webhook_secret || null,
        is_active: true,
      }),
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
