import { NextRequest, NextResponse } from 'next/server';

// Use REST API directly to bypass RLS recursion issues
async function supabaseRestApi(table: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: any) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase credentials');
  }
  
  const url = `${supabaseUrl}/rest/v1/${table}`;
  
  const res = await fetch(url, {
    method,
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=minimal' : undefined,
    } as any,
    ...(body && { body: JSON.stringify(body) }),
  });
  
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Supabase error: ${error}`);
  }
  
  return method === 'GET' ? res.json() : null;
}

export async function GET() {
  try {
    // Use REST API directly to bypass RLS recursion
    const users = await supabaseRestApi('admin_users?select=id,email,role,is_active,created_at&order=created_at.desc');
    return NextResponse.json(users || []);
  } catch (e: any) {
    console.error('[API] GET error:', e.message);
    return NextResponse.json({ error: e.message || 'Failed to fetch users' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }
    
    // First delete from auth.users via REST API
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    });
    
    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to delete: ${error}`);
    }
    
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[API] Delete error:', e.message);
    return NextResponse.json({ error: e.message || 'Failed to delete user' }, { status: 500 });
  }
}
