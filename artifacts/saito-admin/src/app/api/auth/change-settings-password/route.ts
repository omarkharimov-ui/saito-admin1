import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission('settings.admin');
    if (!auth.authenticated) return auth;

    const { newPassword } = await req.json();

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Settings access is now controlled by RBAC permissions. Password fields will be removed in a future migration.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
