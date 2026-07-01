import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase.rpc('check_stock_thresholds');

    if (error) {
      console.error('[cron/check-stock-thresholds] RPC failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[cron/check-stock-thresholds] Found ${data?.length || 0} ingredients below threshold`);
    return NextResponse.json({ low_stock_count: data?.length || 0, items: data });
  } catch (err) {
    console.error('[cron/check-stock-thresholds] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
