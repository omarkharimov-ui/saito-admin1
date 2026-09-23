import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePermission } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';
import { resolveWriteLocationContext } from '@/lib/location-context';

/**
 * /api/settings/delivery — 2026-09-23 (owner): Wolt-like delivery management.
 *
 * Before this, the delivery zones + fee were a single hardcoded row in the
 * `delivery_zones` table, unmanageable from the UI. Now:
 *   GET  → { location: {name, address, phone}, zones: [...] }
 *   PUT  → { address?, phone?, zones: [{id?, name, fee, free_delivery_threshold,
 *            estimated_minutes, is_active}] }  (zones upserted; removed zones
 *            are soft-disabled, never hard-deleted)
 *
 * The POS reads delivery_zones directly (read-only, location-scoped RLS);
 * this route is the only write path and it is settings.admin + CSRF gated.
 */
const svc = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ZONE_FIELDS = ['name', 'fee', 'free_delivery_threshold', 'estimated_minutes', 'is_active'];

export async function GET() {
  const auth = await requirePermission('settings.admin');
  if (!auth.authenticated) return auth;
  const s = svc();
  try {
    const opLoc = await resolveWriteLocationContext(auth.user!.id);
    const { data: location } = await s
      .from('locations')
      .select('id, name, address, phone')
      .eq('id', opLoc?.locationId)
      .maybeSingle();

    const { data: zones } = await s
      .from('delivery_zones')
      .select('*')
      .order('name', { ascending: true });

    return NextResponse.json({
      location: location || null,
      zones: zones || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requirePermission('settings.admin');
  if (!auth.authenticated) return auth;
  if (!validateCsrfToken(req, true)) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }
  const s = svc();
  try {
    const body = await req.json();
    const opLoc = await resolveWriteLocationContext(auth.user!.id);
    if (!opLoc?.locationId) {
      return NextResponse.json({ error: 'NO_LOCATION_CONTEXT' }, { status: 400 });
    }

    // 1) Location address/phone (the courier's pickup point).
    const locPatch: Record<string, unknown> = {};
    if (typeof body.address === 'string') locPatch.address = body.address;
    if (typeof body.phone === 'string') locPatch.phone = body.phone;
    if (Object.keys(locPatch).length > 0) {
      const { error: locErr } = await s
        .from('locations')
        .update({ ...locPatch, updated_at: new Date().toISOString() })
        .eq('id', opLoc.locationId);
      if (locErr) return NextResponse.json({ error: locErr.message }, { status: 400 });
    }

    // 2) Zones: upsert the submitted set; soft-disable zones the UI dropped.
    const submitted: any[] = Array.isArray(body.zones) ? body.zones : null;
    if (submitted) {
      const { data: existing } = await s.from('delivery_zones').select('id, name');
      const existingById = new Map((existing || []).map((z: any) => [z.id, z.name]));
      const submittedIds = new Set<string>();
      for (const z of submitted) {
        const patch: Record<string, unknown> = {};
        for (const f of ZONE_FIELDS) {
          if (z[f] !== undefined) patch[f] = z[f];
        }
        patch.updated_at = new Date().toISOString();
        if (z.id && existingById.has(z.id)) {
          submittedIds.add(z.id);
          const { error } = await s.from('delivery_zones').update(patch).eq('id', z.id);
          if (error) return NextResponse.json({ error: `Zone update failed: ${error.message}` }, { status: 400 });
        } else {
          const { data: created, error } = await s
            .from('delivery_zones')
            .insert({
              name: String(z.name || '').trim(),
              fee: Number(z.fee) || 0,
              free_delivery_threshold: Number(z.free_delivery_threshold) || 0,
              estimated_minutes: Number(z.estimated_minutes) || 30,
              is_active: z.is_active !== false,
            })
            .select('id')
            .single();
          if (error) return NextResponse.json({ error: `Zone create failed: ${error.message}` }, { status: 400 });
          submittedIds.add(created.id);
        }
      }
      // Soft-disable (never hard-delete — orders reference zone names, and the
      // POS read is filtered by is_active).
      const toDisable = Array.from(existingById.keys()).filter(id => !submittedIds.has(id));
      if (toDisable.length > 0) {
        const { error } = await s
          .from('delivery_zones')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .in('id', toDisable);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    const { data: zones } = await s
      .from('delivery_zones')
      .select('*')
      .order('name', { ascending: true });
    return NextResponse.json({ success: true, zones: zones || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
