import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

// GC (Wave A #3, 2026-09-20): per-card history — read-only.
// Returns { card, entries[] } where entries are gift_card_ledger rows
// (newest first, performer names resolved) — the detail view's timeline.
// SECURITY CHAIN (Rule 10): staff session -> requireAuth -> service_role
// client -> server-side fixed SELECTs (no client-composed SQL) -> no writes.

const CODE_RE = /^[A-Z0-9][A-Z0-9 _\-]{2,31}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    // Next 15+: params is async (await required at runtime).
    const { code: codeRaw } = await params;
    const code = String(codeRaw || '').trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      return NextResponse.json({ error: 'Invalid card code' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100);

    const supabase = await createAuthClient();

    const { data: card, error: cardErr } = await supabase
      .from('gift_cards')
      .select('*')
      .eq('code', code)
      .limit(1)
      .maybeSingle();
    if (cardErr) throw cardErr;
    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    const { data: entries, error: entriesErr } = await supabase
      .from('gift_card_ledger')
      .select('*')
      .eq('gift_card_id', card.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    if (entriesErr) throw entriesErr;

    const ids = [...new Set((entries || []).map((e: any) => e.performed_by).filter(Boolean))] as string[];
    let staffNames: Record<string, string> = {};
    if (ids.length) {
      const { data: st } = await supabase.from('staff').select('id, name').in('id', ids);
      staffNames = Object.fromEntries((st || []).map((s: any) => [s.id, s.name]));
    }

    return NextResponse.json({
      card,
      entries: (entries || []).map((e: any) => ({
        ...e,
        performer_name: e.performed_by ? staffNames[e.performed_by] || null : null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
