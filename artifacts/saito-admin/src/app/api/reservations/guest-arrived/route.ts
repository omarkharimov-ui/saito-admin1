import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
  if (!auth.authenticated) {
    return auth;
  }

  try {
    const body = await request.json();
    const { reservation_id, performed_by } = body;

    if (!reservation_id) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('confirm_and_checkin_atomic', {
      p_reservation_id: reservation_id,
      p_table_ids: [],
      p_user_id: performed_by || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data || { success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
