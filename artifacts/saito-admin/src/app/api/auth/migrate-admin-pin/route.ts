import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { hashPin } from '@/lib/crypto';

export async function POST(req: NextRequest) {
  try {
    const { data: users, error } = await supabase
      .from('admin_users')
      .select('id, pin, pin_hash')
      .not('pin', 'is', null)
      .limit(1000);

    if (error) throw error;

    let migrated = 0;
    for (const u of users || []) {
      if (u.pin_hash) continue;
      if (!u.pin || u.pin.length !== 4) continue;
      const hash = hashPin(u.pin);
      await supabase.from('admin_users').update({ pin_hash: hash }).eq('id', u.id);
      migrated++;
    }

    return NextResponse.json({ success: true, migrated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
