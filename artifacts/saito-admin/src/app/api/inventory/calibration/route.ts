import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = svc();

    const { data: items, error } = await supabase
      .from('inventory_status')
      .select('id, name, current_stock, theoretical_stock, unit');

    if (error) throw error;

    const suggestions = (items ?? [])
      .filter((item: any) => {
        const theoretical = Number(item.theoretical_stock) || 0;
        const actual = Number(item.current_stock) || 0;
        if (theoretical === 0) return false;
        const variancePct = Math.abs((actual - theoretical) / theoretical) * 100;
        return variancePct >= 10;
      })
      .map((item: any) => {
        const theoretical = Number(item.theoretical_stock) || 0;
        const actual = Number(item.current_stock) || 0;
        const variance = actual - theoretical;
        const variancePct = theoretical > 0 ? (variance / theoretical) * 100 : 0;
        const severity = Math.abs(variancePct) >= 25 ? 'critical' : 'warning';
        return {
          ingredient_id: item.id,
          ingredient_name: item.name,
          unit: item.unit,
          suggested_adjustment_pct: Math.abs(Math.round(variancePct * 10) / 10),
          confidence: Math.min(0.95, Math.max(0.35, Math.abs(variancePct) / 100)),
          reason: severity === 'critical' ? 'Critical stock variance detected' : 'Stock variance needs review',
          actual_stock: actual,
          theoretical_stock: theoretical,
        };
      });

    return NextResponse.json(suggestions);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
