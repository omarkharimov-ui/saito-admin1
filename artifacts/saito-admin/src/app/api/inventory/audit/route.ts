import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// POST /api/inventory/audit — perform stock audit
// body: { ingredientId: string, actualQty: number }
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['admin', 'superadmin', 'manager']);
  if (!auth.authenticated) return auth;

  try {
    const supabase = svc();
    const { ingredientId, actualQty } = await req.json();

    if (!ingredientId || actualQty === undefined || actualQty === null) {
      return NextResponse.json(
        { error: 'ingredientId and actualQty are required' },
        { status: 400 }
      );
    }
    if (actualQty < 0) {
      return NextResponse.json(
        { error: 'actualQty cannot be negative' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc('perform_stock_audit', {
      p_ingredient_id: ingredientId,
      p_actual_qty: actualQty,
      p_performed_by: auth.user?.id || null,
    });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
