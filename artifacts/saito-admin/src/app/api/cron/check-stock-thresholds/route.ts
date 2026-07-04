import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

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
