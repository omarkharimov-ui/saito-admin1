import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePermission } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';
import { resolveWriteLocationContext } from '@/lib/location-context';

/**
 * /api/settings/delivery — 2026-09-23 (owner): Wolt-like delivery management.
 * 2026-09-24 (Phase 1): zone km ranges (min_km/max_km), per-zone min order,
 * priority, ETA range (est_minutes_min/max), per-location delivery_mode and
 * the global delivery settings (fee/threshold/min-order fallbacks,
 * delivery_enabled, delivery_accepting_orders).
 *
 *   GET  → { location: {name, address, phone, delivery_mode},
 *            zones: [...all zone fields...],
 *            general: { delivery_fee, free_delivery_threshold,
 *                       min_order_amount, delivery_enabled,
 *                       delivery_accepting_orders, delivery_fee_multiplier,
 *                       delivery_weather_surge_enabled, delivery_weather_surge_multiplier,
 *                       delivery_peak_surge_enabled, delivery_peak_surge_multiplier,
 *                       delivery_peak_start_hour, delivery_peak_end_hour,
 *                       delivery_peak2_start_hour, delivery_peak2_end_hour } }
 *   PUT  → { address?, phone?, delivery_mode?, general?,
 *            zones: [{id?, name, fee, free_delivery_threshold,
 *                     estimated_minutes, is_active,
 *                     min_km?, max_km?, min_order?, priority?,
 *                     est_minutes_min?, est_minutes_max?}] }
 *
 * 2026-09-26 (Task 55): smart-surge fields (weather + peak windows) ride in
 * `general` — the /api/rpc/calculate_delivery_fee route reads them live.
 *
 * Zones are upserted; removed zones are soft-disabled, never hard-deleted.
 * The POS reads delivery_zones directly (RLS off); this route is the only
 * write path — settings.admin + CSRF gated.
 */
const svc = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ZONE_FIELDS = [
  'name', 'fee', 'free_delivery_threshold', 'estimated_minutes', 'is_active',
  'min_km', 'max_km', 'min_order', 'priority', 'est_minutes_min', 'est_minutes_max',
];
const ZONE_NUM_FIELDS = [
  'fee', 'free_delivery_threshold', 'estimated_minutes',
  'min_km', 'max_km', 'min_order',
];
const ZONE_INT_FIELDS = ['priority', 'est_minutes_min', 'est_minutes_max'];
const DELIVERY_MODES = ['own', 'third_party', 'both'];

function normalizeZone(z: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof z.name === 'string') out.name = z.name.trim();
  for (const f of ZONE_NUM_FIELDS) {
    if (z[f] === undefined) continue;
    if (z[f] === null || z[f] === '') { out[f] = null; continue; }
    const n = Number(z[f]);
    out[f] = Number.isFinite(n) ? n : null;
  }
  for (const f of ZONE_INT_FIELDS) {
    if (z[f] === undefined) continue;
    if (z[f] === null || z[f] === '') { out[f] = null; continue; }
    const n = Math.trunc(Number(z[f]));
    out[f] = Number.isFinite(n) ? n : null;
  }
  if (typeof z.is_active === 'boolean') out.is_active = z.is_active;
  return out;
}

export async function GET() {
  const auth = await requirePermission('settings.admin');
  if (!auth.authenticated) return auth;
  const s = svc();
  try {
    const opLoc = await resolveWriteLocationContext(auth.user!.id);
    const { data: location } = await s
      .from('locations')
      .select('id, name, address, phone, delivery_mode')
      .eq('id', opLoc?.locationId)
      .maybeSingle();

    const { data: zones } = await s
      .from('delivery_zones')
      .select('*')
      .order('priority', { ascending: true })
      .order('name', { ascending: true });

    const { data: general } = await s
      .from('settings')
      .select('delivery_fee, free_delivery_threshold, min_order_amount, delivery_enabled, delivery_accepting_orders, delivery_fee_multiplier, delivery_weather_surge_enabled, delivery_weather_surge_multiplier, delivery_peak_surge_enabled, delivery_peak_surge_multiplier, delivery_peak_start_hour, delivery_peak_end_hour, delivery_peak2_start_hour, delivery_peak2_end_hour')
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      location: location || null,
      zones: zones || [],
      general: general || {
        delivery_fee: 2, free_delivery_threshold: 50, min_order_amount: 15,
        delivery_enabled: true, delivery_accepting_orders: true,
        delivery_fee_multiplier: 1,
        // 2026-09-26 (Task 55) smart-surge defaults (match DB migration).
        delivery_weather_surge_enabled: true, delivery_weather_surge_multiplier: 1.5,
        delivery_peak_surge_enabled: false, delivery_peak_surge_multiplier: 1.25,
        delivery_peak_start_hour: 12, delivery_peak_end_hour: 14,
        delivery_peak2_start_hour: 18, delivery_peak2_end_hour: 22,
      },
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

    // 1) Location: pickup address/phone + delivery_mode (per location).
    const locPatch: Record<string, unknown> = {};
    if (typeof body.address === 'string') locPatch.address = body.address;
    if (typeof body.phone === 'string') locPatch.phone = body.phone;
    if (typeof body.delivery_mode === 'string') {
      if (!DELIVERY_MODES.includes(body.delivery_mode)) {
        return NextResponse.json({ error: 'invalid delivery_mode' }, { status: 400 });
      }
      locPatch.delivery_mode = body.delivery_mode;
    }
    if (Object.keys(locPatch).length > 0) {
      const { error: locErr } = await s
        .from('locations')
        .update({ ...locPatch, updated_at: new Date().toISOString() })
        .eq('id', opLoc.locationId);
      if (locErr) return NextResponse.json({ error: locErr.message }, { status: 400 });
    }

    // 2) Global delivery settings (fallbacks + master switches).
    if (body.general && typeof body.general === 'object') {
      const g: Record<string, unknown> = {};
      const gen = body.general as Record<string, any>;
      for (const f of ['delivery_fee', 'free_delivery_threshold', 'min_order_amount']) {
        if (gen[f] === undefined) continue;
        if (gen[f] === null || gen[f] === '') { g[f] = null; continue; }
        const n = Number(gen[f]);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ error: `invalid general.${f}` }, { status: 400 });
        }
        g[f] = n;
      }
      for (const f of ['delivery_enabled', 'delivery_accepting_orders']) {
        if (typeof gen[f] === 'boolean') g[f] = gen[f];
      }
      // 2026-09-26 (owner, Task 50): Wolt-style SURGE factor (0.5..10).
      if (gen.delivery_fee_multiplier !== undefined) {
        if (gen.delivery_fee_multiplier === null) g.delivery_fee_multiplier = 1;
        else {
          const m = Number(gen.delivery_fee_multiplier);
          if (!Number.isFinite(m) || m < 0.5 || m > 10) {
            return NextResponse.json({ error: 'invalid general.delivery_fee_multiplier (0.5..10)' }, { status: 400 });
          }
          g.delivery_fee_multiplier = m;
        }
      }
      // 2026-09-26 (owner, Task 55): SMART SURGE — weather + peak windows.
      // Same bounds as the DB check constraints (multipliers 1..3, hours 0..24).
      for (const f of ['delivery_weather_surge_enabled', 'delivery_peak_surge_enabled']) {
        if (typeof gen[f] === 'boolean') g[f] = gen[f];
      }
      for (const f of ['delivery_weather_surge_multiplier', 'delivery_peak_surge_multiplier']) {
        if (gen[f] === undefined) continue;
        const m = Number(gen[f]);
        if (!Number.isFinite(m) || m < 1 || m > 3) {
          return NextResponse.json({ error: `invalid general.${f} (1..3)` }, { status: 400 });
        }
        g[f] = m;
      }
      for (const f of ['delivery_peak_start_hour', 'delivery_peak_end_hour', 'delivery_peak2_start_hour', 'delivery_peak2_end_hour']) {
        if (gen[f] === undefined) continue;
        const h = Math.trunc(Number(gen[f]));
        if (!Number.isFinite(h) || h < 0 || h > 24) {
          return NextResponse.json({ error: `invalid general.${f} (0..24)` }, { status: 400 });
        }
        g[f] = h;
      }
      if (Object.keys(g).length > 0) {
        const { data: row } = await s.from('settings').select('id').limit(1).maybeSingle();
        if (!row?.id) return NextResponse.json({ error: 'settings row not found' }, { status: 500 });
        const { error: gErr } = await s.from('settings').update(g).eq('id', row.id);
        if (gErr) return NextResponse.json({ error: gErr.message }, { status: 400 });
      }
    }

    // 3) Zones: upsert the submitted set; soft-disable zones the UI dropped.
    const submitted: any[] = Array.isArray(body.zones) ? body.zones : null;
    if (submitted) {
      const { data: existing } = await s.from('delivery_zones').select('id, name');
      const existingById = new Map((existing || []).map((z: any) => [z.id, z.name]));
      const submittedIds = new Set<string>();
      for (const z of submitted) {
        const patch = normalizeZone(z);
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
              ...(normalizeZone(z).min_km !== undefined ? { min_km: patch.min_km } : {}),
              ...(patch.max_km !== undefined ? { max_km: patch.max_km } : {}),
              ...(patch.min_order !== undefined ? { min_order: patch.min_order } : {}),
              ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
              ...(patch.est_minutes_min !== undefined ? { est_minutes_min: patch.est_minutes_min } : {}),
              ...(patch.est_minutes_max !== undefined ? { est_minutes_max: patch.est_minutes_max } : {}),
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
      .order('priority', { ascending: true })
      .order('name', { ascending: true });
    return NextResponse.json({ success: true, zones: zones || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
