import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['superadmin']);
    if (!auth.authenticated) return auth;

    const { accountKey, currentPassword, newPassword } = await req.json();

    if (!accountKey || !currentPassword || !newPassword) {
      return NextResponse.json({ error: 'accountKey, currentPassword, and newPassword are required' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const s = svc();

    // Fetch current settings
    const settingsRes = await fetch(`${s.url}/rest/v1/settings?select=*&limit=1`, { headers: s.headers });
    if (!settingsRes.ok) return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    const settings: any[] = await settingsRes.json();
    const currentSettings = settings?.[0];

    if (!currentSettings) {
      return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
    }

    // Verify current password server-side
    const storedPassword = currentSettings[`${accountKey}_password`];
    if (!storedPassword || storedPassword !== currentPassword) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    // Update password
    const updateRes = await fetch(`${s.url}/rest/v1/settings?id=eq.${currentSettings.id}`, {
      method: 'PATCH',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({ [`${accountKey}_password`]: newPassword }),
    });

    if (!updateRes.ok) {
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
