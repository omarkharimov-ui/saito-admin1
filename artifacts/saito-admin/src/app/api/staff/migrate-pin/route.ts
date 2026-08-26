import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { hashPin } from '@/lib/crypto';
import { requireAuth } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['superadmin']);
  if (!auth.authenticated) return auth;
  try {
    const { data: staff, error } = await supabase
      .from('staff')
      .select('id, pin, pin_hash')
      .not('pin', 'is', null)
      .limit(1000);

    if (error) throw error;

    let migrated = 0;
    for (const s of staff || []) {
      if (s.pin_hash) continue;
      if (!s.pin || s.pin.length !== 4) continue;
      const hash = hashPin(s.pin);
      await supabase.from('staff').update({ pin_hash: hash }).eq('id', s.id);
      migrated++;
    }

    return NextResponse.json({ success: true, migrated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
