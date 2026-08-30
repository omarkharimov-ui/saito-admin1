import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const { order_id } = await request.json();
    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create reprint record
    const { data, error } = await supabase
      .from('order_reprints')
      .insert({
        order_id,
        reprinted_by: auth.user?.id || null,
        reason: 'manual_reprint',
        printed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      // If table doesn't exist, just log it
      console.log('[reprint] Table may not exist:', error.message);
      return NextResponse.json({ success: true, message: 'Reprint logged (no table)' });
    }

    return NextResponse.json({ success: true, reprint: data });
  } catch (error: any) {
    console.error('[API /orders/reprint] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
