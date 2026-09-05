import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

export async function GET() {
  const auth = await requirePermission('staff.view');
  if (auth instanceof NextResponse) return auth;

  const { createAuthClient } = await import('@/lib/api-auth');
  const supabase = await createAuthClient();

  const { data, error } = await supabase
    .from('roles')
    .select('id, name, is_system, created_at, updated_at')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
