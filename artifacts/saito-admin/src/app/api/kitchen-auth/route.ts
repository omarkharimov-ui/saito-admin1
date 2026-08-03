import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: settings } = await supabase
      .from('settings')
      .select('kitchen_password')
      .limit(1)
      .maybeSingle();

    if (!settings?.kitchen_password || settings.kitchen_password !== password) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[KitchenAuth] Error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
