import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);
    const orderId = searchParams.get('orderId');

    // Single order detail with full receipt data
    if (orderId) {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('*, order_items(*, products(id, name, name_az, name_en, name_ru, image_url)), order_payments(*)')
        .eq('id', orderId)
        .eq('status', 'paid')
        .single();

      if (orderError) {
        return NextResponse.json({ error: orderError.message }, { status: 500 });
      }

      // Fetch campaign usage if any
      const { data: campaignUsage } = await supabase
        .from('campaign_usage')
        .select('*, campaigns(title)')
        .eq('order_id', orderId)
        .maybeSingle();

      return NextResponse.json({ order, campaignUsage });
    }

    // List recent paid orders
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, table_number, total_amount, paid_amount, tip_amount, status, updated_at, paid_at, payment_method')
      .eq('status', 'paid')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ orders });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
