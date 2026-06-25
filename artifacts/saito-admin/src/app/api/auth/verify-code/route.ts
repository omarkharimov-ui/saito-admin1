import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Same store as send-code
const verificationCodes = new Map<string, { code: string; expires: number }>();

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['superadmin']);
    if (auth instanceof NextResponse) return auth;

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    const { email, code, password, userRole, permissions } = await req.json();
    
    if (!email || !code || !password) {
      return NextResponse.json({ error: 'Email, code, and password required' }, { status: 400 });
    }
    
    // Verify code
    const stored = verificationCodes.get(email);
    if (!stored || stored.code !== code || Date.now() > stored.expires) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
    }
    
    // Clear used code
    verificationCodes.delete(email);
    
    // Create user in Supabase Auth
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
    });
    
    if (authError) throw authError;
    if (!authData.user) throw new Error('User creation failed');
    
    // Create admin_users record
    const { error: insertError } = await adminClient
      .from('admin_users')
      .insert({
        id: authData.user.id,
        email,
        role: userRole || 'admin',
        is_active: true,
        permissions: permissions || [],
      });
    
    if (insertError) {
      // Rollback: delete auth user
      await adminClient.auth.admin.deleteUser(authData.user.id);
      throw insertError;
    }
    
    return NextResponse.json({ success: true, id: authData.user.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to create user' }, { status: 500 });
  }
}
