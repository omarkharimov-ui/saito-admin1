import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

/**
 * OS BUILD #1b — loyalty per-product rules.
 *
 * GET  → all active+inactive rules with product/category names
 * POST → upsert a rule (scope=product|category, mode=points_per_unit|multiplier)
 * DELETE { id } → deactivate (soft delete keeps earn history consistent)
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth as any;

    const s = svc();
    const res = await fetch(
      `${s.url}/rest/v1/loyalty_product_rules?select=*,products(name),categories(name)&order=created_at.desc`,
      { headers: s.headers }
    );
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('settings.admin');
    if (!auth.authenticated) return auth as any;
    if (!validateCsrfToken(request, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const body = await request.json();
    const { scope, product_id, category_id, mode, points_per_unit, multiplier, cap_points_per_order, label, is_active } = body;

    if (!['product', 'category'].includes(scope)) {
      return NextResponse.json({ error: "scope must be 'product' or 'category'" }, { status: 400 });
    }
    if (scope === 'product' && !product_id) return NextResponse.json({ error: 'product_id required' }, { status: 400 });
    if (scope === 'category' && !category_id) return NextResponse.json({ error: 'category_id required' }, { status: 400 });
    if (!['points_per_unit', 'multiplier'].includes(mode)) {
      return NextResponse.json({ error: "mode must be 'points_per_unit' or 'multiplier'" }, { status: 400 });
    }

    const s = svc();
    const payload = {
      scope,
      product_id: scope === 'product' ? product_id : null,
      category_id: scope === 'category' ? category_id : null,
      mode,
      points_per_unit: mode === 'points_per_unit' ? Math.max(0, parseInt(points_per_unit, 10) || 0) : 0,
      multiplier: mode === 'multiplier' ? Math.max(0, parseFloat(multiplier) || 0) : 0,
      cap_points_per_order: cap_points_per_order != null && cap_points_per_order !== '' ? Math.max(0, parseInt(cap_points_per_order, 10)) : null,
      label: label || null,
      is_active: is_active !== false,
    };

    // Upsert: one rule per scope+target (latest wins).
    const res = await fetch(`${s.url}/rest/v1/loyalty_product_rules`, {
      method: 'POST',
      headers: { ...s.headers, Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: (Array.isArray(data) ? data[0]?.message : data?.error) || 'Failed to save rule' }, { status: 400 });

    const created = Array.isArray(data) ? data[0] : data;
    // Deactivate older rules for the same target.
    const filter = scope === 'product'
      ? `scope=eq.product&product_id=eq.${product_id}&id=neq.${created.id}`
      : `scope=eq.category&category_id=eq.${category_id}&id=neq.${created.id}`;
    await fetch(`${s.url}/rest/v1/loyalty_product_rules?${filter}`, {
      method: 'PATCH',
      headers: { ...s.headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ is_active: false }),
    });

    return NextResponse.json({ success: true, rule: created });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requirePermission('settings.admin');
    if (!auth.authenticated) return auth as any;
    if (!validateCsrfToken(request, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const s = svc();
    const res = await fetch(`${s.url}/rest/v1/loyalty_product_rules?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...s.headers, Prefer: 'return=representation' },
      body: JSON.stringify({ is_active: false }),
    });
    if (!res.ok) return NextResponse.json({ error: 'Failed to deactivate rule' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
