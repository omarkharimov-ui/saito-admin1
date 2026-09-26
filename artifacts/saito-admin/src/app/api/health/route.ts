import { NextResponse } from 'next/server';

// 2026-09-26 (Q8 offline phase 1): liveness probe for the client-side
// net monitor. Deliberately public + auth-free (it leaks nothing) so the
// admin layout can ping it before/after login. 200 = API process is up.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, t: Date.now() });
}
