import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const svc = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const token = cookieStore.get('saito_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'No session' }, { status: 401 });
    }

    const s = svc();
    const { data: session } = await s
      .from('sessions')
      .select('user_id')
      .eq('token', token)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body; // 'in' | 'out'

    if (!action || !['in', 'out'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (action === 'in') {
      // Clock in: create new shift
      const { error } = await s.from('shifts').insert({
        staff_id: session.user_id,
        opened_at: now,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'clocked_in' });
    } else {
      // Clock out: find open shift and close it
      const { data: openShift } = await s
        .from('shifts')
        .select('id')
        .eq('staff_id', session.user_id)
        .is('closed_at', null)
        .maybeSingle();

      if (!openShift) {
        return NextResponse.json({ error: 'No open shift found' }, { status: 404 });
      }

      const { error } = await s
        .from('shifts')
        .update({ closed_at: now })
        .eq('id', openShift.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'clocked_out' });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
