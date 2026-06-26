import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['superadmin']);
    if (!auth.authenticated) return auth;

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { email, code, userRole } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code required' }, { status: 400 });
    }

    // Verify code from DB
    const { data: stored } = await adminClient
      .from('verification_codes')
      .select('code, expires')
      .eq('email', email)
      .maybeSingle();

    if (!stored || stored.code !== code || new Date(stored.expires).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
    }

    // Clear used code
    await adminClient.from('verification_codes').delete().eq('email', email);

    // Generate a unique 4-digit PIN
    let pin = generatePin();
    let existing = await adminClient.from('admin_users').select('id').eq('pin', pin).maybeSingle();
    while (existing?.data) {
      pin = generatePin();
      existing = await adminClient.from('admin_users').select('id').eq('pin', pin).maybeSingle();
    }

    const { error: insertError } = await adminClient
      .from('admin_users')
      .insert({
        email: email || null,
        role: userRole || 'admin',
        is_active: true,
        pin,
      });

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({ success: true, pin });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to create user' }, { status: 500 });
  }
}
