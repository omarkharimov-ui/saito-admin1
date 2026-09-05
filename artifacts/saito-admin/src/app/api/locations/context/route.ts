import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('saito_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const supabase = svc();

    // Resolve session
    const { data: session } = await supabase
      .from('sessions')
      .select('user_id, role, expires_at, active_location_id, organization_id')
      .eq('token', token)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }

    const staffId = session.user_id;
    const orgId = session.organization_id;
    const activeLocId = session.active_location_id;

    // Get accessible locations
    const { data: memberships } = await supabase
      .from('staff_locations')
      .select('location_id, is_primary, active, locations!staff_locations_location_id_fkey(id, name, code, slug, status)')
      .eq('staff_id', staffId)
      .eq('active', true);

    const accessibleLocations = (memberships ?? [])
      .filter((m: any) => m.locations?.status !== 'ARCHIVED')
      .map((m: any) => ({
        id: m.locations.id,
        name: m.locations.name,
        code: m.locations.code,
        slug: m.locations.slug,
        status: m.locations.status,
        is_primary: m.is_primary,
      }));

    // Get active location name
    let activeLocationName: string | null = null;
    if (activeLocId) {
      const { data: loc } = await supabase
        .from('locations')
        .select('name')
        .eq('id', activeLocId)
        .maybeSingle();
      activeLocationName = loc?.name ?? null;
    }

    return NextResponse.json({
      staff_id: staffId,
      organization_id: orgId,
      active_location_id: activeLocId,
      active_location_name: activeLocationName,
      accessible_locations: accessibleLocations,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
