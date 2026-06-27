import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(['superadmin']);
  if (!auth.authenticated) return auth;

  const supabase = svc();
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    const { email, role } = await req.json();

    if (!email || !email.includes('@') || !role) {
      return NextResponse.json({ error: 'Email and role required' }, { status: 400 });
    }

    const validRoles = ['admin', 'kitchen', 'cashier'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Check existing
    const { data: existing } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 400 });
    }

    // Generate unique PIN
    let pin = generatePin();
    let exists = await supabase.from('admin_users').select('id').eq('pin', pin).maybeSingle();
    while (exists?.data) {
      pin = generatePin();
      exists = await supabase.from('admin_users').select('id').eq('pin', pin).maybeSingle();
    }

    const { error: insertError } = await supabase
      .from('admin_users')
      .insert({ email, role, is_active: true, pin });

    if (insertError) throw insertError;

    return NextResponse.json({ success: true, pin });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to create user' }, { status: 500 });
  }
}
