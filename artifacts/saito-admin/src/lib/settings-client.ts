import { apiFetch } from '@/lib/api-fetch';

/**
 * Client-side access to the whitelisted /api/settings/* endpoints.
 * Server enforces field whitelists; secret columns are never returned.
 */
export type SettingsScope = 'order' | 'pos' | 'general' | 'receipt' | 'printer' | 'business' | 'loyalty' | 'payment';

export async function getSettings(scope: SettingsScope): Promise<Record<string, any>> {
  try {
    const res = await apiFetch(`/api/settings/${scope}`);
    if (!res.ok) return {};
    const json = await res.json().catch(() => ({}));
    return json?.settings && typeof json.settings === 'object' ? json.settings : {};
  } catch {
    return {};
  }
}

export async function updateSettings(
  scope: SettingsScope,
  body: Record<string, any>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiFetch(`/api/settings/${scope}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const json = await res.json().catch(() => ({}));
    return { ok: false, error: json?.error || `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export async function getPublicSettings(): Promise<Record<string, any>> {
  try {
    const res = await fetch('/api/public/settings');
    if (!res.ok) return {};
    const json = await res.json().catch(() => ({}));
    return json?.settings && typeof json.settings === 'object' ? json.settings : {};
  } catch {
    return {};
  }
}
