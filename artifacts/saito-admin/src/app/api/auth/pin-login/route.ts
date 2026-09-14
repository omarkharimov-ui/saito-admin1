import { NextResponse } from 'next/server';

// S-4b (Pre-P7 cleanup, ratified 2026-09-14): this legacy PIN login is FROZEN.
// It was the pre-A-freeze weak path: no CSRF check, no rate-limit/lockout, no
// security_events / audit_logs_canonical writes, no active_location_id on the
// session, and it matched a PIN against a client-side scanned list of up to 1000
// staff (timing/leak surface). The canonical login is /api/auth/staff-login
// (CSRF + rate-limit + lockout + audit + location). 0 UI callers and 0 gate
// callers existed at freeze time (verified 2026-09-14). Returns 410 Gone.
export async function POST() {
  return NextResponse.json(
    {
      error:
        'pin-login is deprecated and frozen (S-4b, 2026-09-14). Use /api/auth/staff-login.',
    },
    { status: 410 }
  );
}
