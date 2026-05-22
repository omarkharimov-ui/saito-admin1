import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { targetEmail, newPassword } = await req.json();
    
    if (!targetEmail || !newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: 'Email and password (min 6 chars) required' }, { status: 400 });
    }
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Missing Supabase credentials' }, { status: 500 });
    }
    
    // Get all users via REST API
    const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    });
    
    if (!listRes.ok) {
      throw new Error('Failed to list users');
    }
    
    const users = await listRes.json();
    const user = users.users.find((u: any) => u.email === targetEmail);
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Update password via REST API
    const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
    });
    
    if (!updateRes.ok) {
      const error = await updateRes.text();
      throw new Error(`Failed to update: ${error}`);
    }
    
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[ChangePassword API] Error:', e.message);
    return NextResponse.json({ error: e.message || 'Failed to change password' }, { status: 500 });
  }
}
