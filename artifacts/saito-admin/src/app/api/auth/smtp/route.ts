import { NextRequest, NextResponse } from 'next/server';

// REST API helper
async function supabaseRestApi(endpoint: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: any) {
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

export async function GET() {
  try {
    const data = await supabaseRestApi('settings?select=smtp_host,smtp_port,smtp_user,smtp_pass,smtp_from_name&limit=1');
    return NextResponse.json(data?.[0] || {});
  } catch (e: any) {
    console.error('[SMTP API] GET error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const smtp = await req.json();
    
    await supabaseRestApi('settings', 'POST', {
      id: '1',
      smtp_host: smtp.smtp_host,
      smtp_port: smtp.smtp_port,
      smtp_user: smtp.smtp_user,
      smtp_pass: smtp.smtp_pass,
      smtp_from_name: smtp.smtp_from_name,
    });
    
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[SMTP API] POST error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
