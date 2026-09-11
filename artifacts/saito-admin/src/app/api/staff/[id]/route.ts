import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission('staff.view');
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const { createAuthClient } = await import('@/lib/api-auth');
  const supabase = await createAuthClient();

  const { data, error } = await supabase
    .from('staff')
    .select(`
      id, name, full_name, email, phone, is_active, status, role_id, organization_id,
      hourly_rate, created_at, updated_at, last_login_at, failed_login_attempts, locked_until,
      roles!staff_role_id_fkey (id, name),
      staff_locations (location_id, is_primary, active, locations!staff_locations_location_id_fkey (id, name, code))
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
  }

  const { pin_hash, ...sanitized } = data as any;
  return NextResponse.json(sanitized);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission('staff.manage');
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();
  const { name, full_name, email, phone, role_id, hourly_rate, status, status_reason } = body;

  const { createAuthClient } = await import('@/lib/api-auth');
  const supabase = await createAuthClient();

  let statusResult: any = null;
  // Contract §12: status lifecycle is DB-authoritative (atomic transition +
  // audit + session consequence). Never write `status` via raw .update().
  if (status !== undefined && ['ACTIVE', 'SUSPENDED', 'TERMINATED'].includes(status)) {
    const r = await supabase.rpc('set_staff_status_atomic', {
      p_token: auth.token,
      p_staff_id: id,
      p_new_status: status,
      p_reason: status_reason ?? null,
    });
    if (r.error) {
      return NextResponse.json({ error: r.error.message }, { status: 403 });
    }
    statusResult = r.data;
  }

  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (full_name !== undefined) updates.full_name = full_name;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;
  if (role_id !== undefined) updates.role_id = role_id;
  if (hourly_rate !== undefined) updates.hourly_rate = hourly_rate;

  let data: any = null;
  if (Object.keys(updates).length > 0) {
    const res = await supabase
      .from('staff')
      .update(updates)
      .eq('id', id)
      .select('id, name, status, role_id')
      .single();
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    data = res.data;
  } else if (!statusResult) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  return NextResponse.json(statusResult ?? data);
}
