import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

// 13a (inventory audit GAP #1): ProcurementTab's "Avto-sifariş Bildirişləri"
// feed fetched this route for months and silently failed (catch {}) — the
// table exists and the stock-threshold cron writes into it (966 rows,
// type='stock'/'supplier_auto_order'), but no API route ever did. Now the
// feed is real.
function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 50);

    const supabase = svc();
    let q = supabase
      .from('notifications')
      .select('id, type, title, body, data, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (type) q = q.eq('type', type);

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
