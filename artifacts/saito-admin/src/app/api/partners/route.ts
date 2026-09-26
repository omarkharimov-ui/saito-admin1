import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

const PARTNER_IDS = ['bolt', 'uber_eats', 'glovo', 'wolt'] as const;
type PartnerId = (typeof PARTNER_IDS)[number];

/**
 * 2026-09-25 (owner): delivery-partner connect state — READY by design.
 * The owner/staff fill in nothing yet; they flip "connect" per partner and
 * the platform branding (logo + brand color + courier info) becomes active
 * for orders tagged with that partner.
 *
 * GET  → { partners: {bolt:{connected,...},...}, sms: {...} }
 * POST { partner: 'bolt'|..., connected: bool }  → toggle one partner
 * POST { sms: {provider, enabled, ...} }         → save SMS ready-state config
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    const supabase = await createAuthClient();
    const { data, error } = await supabase.from('settings').select('delivery_partners,sms_settings,email_settings,contact_email,restaurant_name').limit(1);
    if (error) throw error;
    const row = data?.[0] || {};
    const partners: Record<string, { connected: boolean; connected_at: string | null }> = {};
    for (const id of PARTNER_IDS) {
      partners[id] = row.delivery_partners?.[id] || { connected: false, connected_at: null };
    }
    // 2026-09-26 (owner): e-mail infra — password never leaves the server;
    // the UI gets a `has_password` flag + masked value only.
    const emailRaw = row.email_settings || {};
    const email = { ...emailRaw };
    delete (email as any).pass;
    email.has_password = !!emailRaw.pass;
    return NextResponse.json({
      partners,
      sms: row.sms_settings || {},
      email,
      contact_email: row.contact_email || '',
      restaurant_name: row.restaurant_name || '',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;
    if (!validateCsrfToken(req, auth.authenticated)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }
    const supabase = await createAuthClient();
    const body = await req.json();
    const { data: rows, error: selErr } = await supabase.from('settings').select('id,delivery_partners,sms_settings,email_settings').limit(1);
    if (selErr) throw selErr;
    const row = rows?.[0];
    if (!row) return NextResponse.json({ error: 'settings row not found' }, { status: 500 });

    const patch: Record<string, unknown> = {};

    if (body.partner !== undefined) {
      const id = String(body.partner);
      if (!PARTNER_IDS.includes(id as PartnerId)) {
        return NextResponse.json({ error: `unknown partner: ${id}` }, { status: 400 });
      }
      const current = row.delivery_partners || {};
      current[id] = {
        connected: !!body.connected,
        connected_at: body.connected ? new Date().toISOString() : null,
      };
      patch.delivery_partners = current;
    }

    if (body.sms !== undefined && typeof body.sms === 'object') {
      const prev = row.sms_settings || {};
      patch.sms_settings = { ...prev, ...body.sms, updated_at: new Date().toISOString() };
    }

    // 2026-09-26 (owner): e-mail config. Client omits `pass` when unchanged
    // (masked '••••••••' placeholder) → keep the previously stored password.
    if (body.email !== undefined && typeof body.email === 'object') {
      const prev = row.email_settings || {};
      const { pass, ...rest } = body.email as Record<string, unknown>;
      patch.email_settings = {
        ...prev,
        ...rest,
        pass: (typeof pass === 'string' && !pass.startsWith('•') && pass !== '') ? pass : prev.pass,
        updated_at: new Date().toISOString(),
      };
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
    }

    const { error } = await supabase.from('settings').update(patch).eq('id', row.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
