import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ 
        error: `Missing env vars: ${!supabaseUrl ? 'SUPABASE_URL ' : ''}${!supabaseKey ? 'SERVICE_ROLE_KEY' : ''}` 
      }, { status: 500 });
    }

    const { email, password } = await request.json();
    
    // 1. Supabase Auth ilə login
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email,
      password,
    });
    
    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || 'Login failed' }, { status: 401 });
    }
    
    // 2. Service role ilə admin_users-dən role çək
    const serviceClient = createClient(supabaseUrl, supabaseKey);
    
    const { data: adminUser, error: userError } = await serviceClient
      .from('admin_users')
      .select('role, email')
      .eq('id', authData.user.id)
      .maybeSingle();
    
    if (userError) {
      console.error('[API] admin_users lookup failed:', userError);
      return NextResponse.json({ error: `Database error: ${userError}` }, { status: 500 });
    }
    
    if (!adminUser) {
      return NextResponse.json({ error: 'İstifadəçi tapılmadı' }, { status: 404 });
    }
    
    // 3. Uğurlu response
    return NextResponse.json({
      user: {
        id: authData.user.id,
        email: adminUser.email,
        role: adminUser.role,
      },
      session: authData.session,
    });
    
  } catch (e: any) {
    console.error('[API] Login error:', e.message);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
