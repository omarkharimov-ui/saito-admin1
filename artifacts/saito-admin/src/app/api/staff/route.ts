import { NextResponse } from 'next/server';
import { validateAuth, requirePermission } from '@/lib/api-auth';

export async function GET(req: Request) {
  const auth = await requirePermission('staff.view');
  if (auth instanceof NextResponse) return auth;

  const { createAuthClient } = await import('@/lib/api-auth');
  const supabase = await createAuthClient();

  const { data, error } = await supabase
    .from('staff')
    .select(`
      id, name, full_name, email, phone, is_active, status, role_id, organization_id,
      hourly_rate, created_at, updated_at, last_login_at,
      roles!staff_role_id_fkey (id, name)
    `)
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sanitize: remove pin_hash
  const sanitized = (data || []).map(({ pin_hash, ...rest }: any) => rest);

  return NextResponse.json(sanitized);
}

export async function POST(req: Request) {
  const auth = await requirePermission('staff.manage');
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { name, full_name, email, phone, role_id, hourly_rate, pin, location_id } = body;

  if (!name || !role_id) {
    return NextResponse.json({ error: 'name and role_id are required' }, { status: 400 });
  }

  const { createAuthClient } = await import('@/lib/api-auth');
  const supabase = await createAuthClient();

  const { hashPin } = await import('@/lib/crypto');

  // Resolve organization: use the acting user's org, fall back to default Saito org.
  let organizationId = '00000000-0000-0000-0000-000000000001';
  if (auth.user?.id) {
    const { data: acting } = await supabase
      .from('staff')
      .select('organization_id')
      .eq('id', auth.user.id)
      .maybeSingle();
    if (acting?.organization_id) organizationId = acting.organization_id;
  }

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .insert({
      name,
      full_name: full_name || null,
      email: email || null,
      phone: phone || null,
      role_id,
      hourly_rate: hourly_rate || 5,
      pin_hash: pin ? hashPin(pin) : null,
      status: 'ACTIVE',
      organization_id: organizationId,
    })
    .select('id, name, status, role_id, organization_id')
    .single();

  if (staffError) {
    return NextResponse.json({ error: staffError.message }, { status: 500 });
  }

  const orgId = (staff as any).organization_id;

  if (location_id && orgId) {
    const { error: locError } = await supabase
      .from('staff_locations')
      .insert({
        staff_id: staff.id,
        location_id,
        organization_id: orgId,
        is_primary: true,
      });

    if (locError) {
      return NextResponse.json({ error: locError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ...staff, pin_hash: undefined }, { status: 201 });
}
