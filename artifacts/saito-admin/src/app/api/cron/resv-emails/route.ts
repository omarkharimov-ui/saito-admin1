import { NextRequest, NextResponse } from 'next/server';
import { sendReservationEmail } from '@/lib/resv-email';

/**
 * 2026-09-26 (owner): DAILY reservation e-mail reminder pump.
 * Triggered by the server-side scheduler (src/instrumentation.ts, 09:00 +
 * 16:00 Asia/Baku) with Bearer CRON_SECRET — same pattern as /api/cron/*.
 *
 * Selects active reservations (pending/confirmed/waiting) for today and
 * tomorrow whose last_reminder_at is null or older than 20h → sends a
 * "remind" e-mail (guest e-mail, falling back to the business e-mail) and
 * stamps last_reminder_at. Idempotent: re-running the same day is a no-op.
 */
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const s = svc();

    // Baku-local day boundaries (venue tz = Asia/Baku, frozen S-05 contract)
    const baku = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Baku' }));
    const today = baku.toISOString().slice(0, 10);
    const tomorrow = new Date(baku.getTime() + 86_400_000).toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() - 20 * 3600 * 1000).toISOString();

    const rRes = await fetch(
      `${s.url}/rest/v1/reservations?select=id,name,date,time,guests,deposit_amount,is_vip,email,last_reminder_at&status=in.(pending,confirmed,waiting)&date=gte.${today}&date=lte.${tomorrow}&last_reminder_at=lt.${cutoff}&limit=200`,
      { headers: s.headers },
    );
    if (!rRes.ok) throw new Error(`select failed: ${rRes.status}`);
    const list: any[] = await rRes.json();

    let sent = 0;
    let skipped = 0;
    for (const r of list) {
      const res = await sendReservationEmail({
        to: r.email || null, // falls back to business e-mail inside the engine
        template: 'remind',
        reservation: r,
        reservation_id: r.id,
      });
      if (res.sent) {
        sent++;
        const pRes = await fetch(`${s.url}/rest/v1/reservations?id=eq.${encodeURIComponent(r.id)}`, {
          method: 'PATCH',
          headers: s.headers,
          body: JSON.stringify({ last_reminder_at: new Date().toISOString() }),
        });
        if (!pRes.ok) console.error('[resv-emails] stamp failed', pRes.status);
      } else {
        skipped++;
        if (res.code === 'smtp_not_configured' || res.code === 'email_disabled') {
          // config missing — stop early, retrying 200 rows is pointless
          break;
        }
      }
    }

    return NextResponse.json({ success: true, sent, skipped, total: list.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
