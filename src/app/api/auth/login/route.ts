import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    
    // 1. Supabase Auth ilə login
    const authClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email,
      password,
    });
    
    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || 'Login failed' }, { status: 401 });
    }
    
    // 2. Service role ilə admin_users-dən role çək
    let serviceClient;
    try {
      serviceClient = createClient(supabaseUrl, supabaseKey);
    } catch {
      // Fallback to anon key with RLS bypass via REST API
      return NextResponse.json({ 
        error: 'Service key invalid. Please check SUPABASE_SERVICE_ROLE_KEY in Vercel.' 
      }, { status: 500 });
    }
    
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
