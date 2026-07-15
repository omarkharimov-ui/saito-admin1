import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createAuthClient();
    const { data, error } = await supabase.rpc('process_expired_reservations', {
      p_minutes_past: 30,
    });

    if (error) {
      console.error('[cron/process-expired-reservations] RPC failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ processed: data?.length || 0, reservations: data });
  } catch (err) {
    console.error('[cron/process-expired-reservations] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
