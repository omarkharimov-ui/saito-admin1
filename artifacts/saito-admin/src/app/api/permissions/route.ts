import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';

/**
 * GET /api/permissions
 *
 * No query params → raw permissions catalog (legacy).
 * ?staff=<id>    → the staff member's EFFECTIVE permissions (the catalog,
 *                  each row flagged is_granted by their role's grants).
 *
 * Fix (staff UX overhaul): this route previously required `roles.manage`
 * (which the admin role does NOT hold) and ignored the staff param entirely,
 * so the staff sheet's Permissions tab silently 403'd and rendered "0".
 * Permission to view is `staff.view` (matches the staff page itself).
 *
 * Staff-level override tables are retired (P-1 M6) — grants live on roles;
 * the UI is read-only and points to the Roles page for changes.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePermission('staff.view');
  if (auth instanceof NextResponse) return auth;

  const supabase = await createAuthClient();
  const staffId = req.nextUrl.searchParams.get('staff');

  const { data: catalog, error } = await supabase
    .from('permissions')
    .select('key, name, category, scope')
    .order('category, key');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!staffId) return NextResponse.json(catalog || []);

  const { data: staffRow, error: staffErr } = await supabase
    .from('staff')
    .select('role_id')
    .eq('id', staffId)
    .maybeSingle();
  if (staffErr) {
    return NextResponse.json({ error: staffErr.message }, { status: 500 });
  }

  let grantedKeys: Set<string> = new Set();
  if (staffRow?.role_id) {
    const { data: rp } = await supabase
      .from('role_permissions')
      .select('permission_key')
      .eq('role_id', staffRow.role_id);
    (rp || []).forEach((r: any) => grantedKeys.add(r.permission_key));
  }

  const rows = (catalog || []).map((p: any) => ({
    permission_code: p.key,
    permission_name: p.name || p.key,
    category_name: p.category || 'General',
    is_granted: grantedKeys.has(p.key),
    source: 'role',
  }));

  return NextResponse.json(rows);
}
