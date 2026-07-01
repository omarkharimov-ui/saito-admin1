import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase.rpc('process_due_kitchen_schedules');

    if (error) {
      console.error('[cron/process-due-kitchen-schedules] RPC failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[cron/process-due-kitchen-schedules] Processed ${data?.length || 0} due kitchen schedules`);
    return NextResponse.json({ processed: data?.length || 0, schedules: data });
  } catch (err) {
    console.error('[cron/process-due-kitchen-schedules] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
