import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission('kitchen.auth');
    if (!auth.authenticated) return auth;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
