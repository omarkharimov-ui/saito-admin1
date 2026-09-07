/**
 * Shared server-side access to the single-row `settings` table (id = '1').
 *
 * All reads/writes go through this module with an explicit column whitelist per
 * route. Secret/legacy columns (admin_password, superadmin_password,
 * kitchen_password, smtp_*) are never exposed by any route in this surface.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function headers() {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchSettingsRow(columns: string[]): Promise<Record<string, unknown>> {
  const col = columns.join(',');
  const res = await fetch(
    `${URL}/rest/v1/settings?select=${col}&id=eq.1&limit=1`,
    { headers: headers(), cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`settings fetch failed: ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>[];
  return Array.isArray(data) && data.length ? data[0] : {};
}

export async function patchSettingsRow(updates: Record<string, unknown>): Promise<{ ok: boolean; status: number; error?: string; row?: Record<string, unknown> }> {
  const res = await fetch(`${URL}/rest/v1/settings?id=eq.1`, {
    method: 'PATCH',
    headers: { ...headers(), Prefer: 'return=representation' },
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: text.slice(0, 200) || 'settings update failed' };
  }
  const data = (await res.json()) as Record<string, unknown>[];
  return { ok: true, status: 200, row: Array.isArray(data) && data.length ? data[0] : undefined };
}

/** Returns only whitelisted keys present in body (non-whitelisted keys are ignored). */
export function pickAllowed(body: unknown, allowed: string[]): { updates: Record<string, unknown> } {
  const updates: Record<string, unknown> = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { updates };
  }
  const allowedSet = new Set(allowed);
  for (const [k, v] of Object.entries(body)) {
    if (allowedSet.has(k)) updates[k] = v;
  }
  return { updates };
}
