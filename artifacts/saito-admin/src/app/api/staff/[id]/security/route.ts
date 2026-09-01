import { NextResponse } from 'next/server';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = svc();
    const { id } = await params;

    // Get security events from audit_logs table
    const res = await fetch(`${s.url}/rest/v1/audit_logs?actor_id=eq.${id}&select=*&order=created_at.desc&limit=100`, {
      headers: s.headers,
    });

    const data = await res.json();

    // Transform to security events format
    const events = (Array.isArray(data) ? data : []).map((log: any) => ({
      id: log.id,
      event_type: log.action || 'unknown',
      description: log.action_description || log.action || 'Unknown event',
      severity: getSeverity(log.action),
      created_at: log.created_at,
      ip_address: log.ip_address,
      metadata: log.metadata,
    }));

    return NextResponse.json(events);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

function getSeverity(action: string): 'low' | 'medium' | 'high' | 'critical' {
  const lowerAction = action?.toLowerCase() || '';
  if (lowerAction.includes('failed') || lowerAction.includes('breach') || lowerAction.includes('unauthorized')) {
    return 'critical';
  }
  if (lowerAction.includes('delete') || lowerAction.includes('remove') || lowerAction.includes('change')) {
    return 'high';
  }
  if (lowerAction.includes('login') || lowerAction.includes('logout')) {
    return 'low';
  }
  return 'medium';
}
