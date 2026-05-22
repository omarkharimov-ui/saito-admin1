import { NextRequest, NextResponse } from 'next/server';

// REST API helper
async function supabaseRestApi(endpoint: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', body?: any) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase credentials');
  }
  
  const res = await fetch(`${supabaseUrl}/rest/v1/${endpoint}`, {
    method,
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'GET' ? undefined : 'return=minimal',
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Supabase error: ${error}`);
  }
  
  return method === 'GET' ? res.json() : null;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status');
    
    let endpoint = 'campaigns?select=*&order=created_at.desc';
    if (type) endpoint += `&type=eq.${type}`;
    if (status) endpoint += `&status=eq.${status}`;
    
    const data = await supabaseRestApi(endpoint);
    return NextResponse.json(data || []);
  } catch (e: any) {
    console.error('[Campaigns API] GET error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await supabaseRestApi('campaigns', 'POST', body);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[Campaigns API] POST error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
    
    const body = await req.json();
    await supabaseRestApi(`campaigns?id=eq.${id}`, 'PATCH', body);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[Campaigns API] PATCH error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
    
    await supabaseRestApi(`campaigns?id=eq.${id}`, 'DELETE');
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[Campaigns API] DELETE error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
