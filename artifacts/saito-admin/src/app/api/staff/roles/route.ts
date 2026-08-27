import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET() {
  try {
    const auth = await requirePermission('staff.manage', ['admin', 'superadmin']);
    if (!auth.authenticated) return auth as any;

    const s = svc();

    const [rolesRes, permissionsRes, rolePermsRes] = await Promise.all([
      fetch(`${s.url}/rest/v1/roles?select=*&order=name.asc`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/permissions?select=*&order=key.asc`, { headers: s.headers }),
      fetch(`${s.url}/rest/v1/role_permissions?select=role_id,permission_key`, { headers: s.headers }),
    ]);

    const roles = await rolesRes.json();
    const permissions = await permissionsRes.json();
    const rolePermissions = await rolePermsRes.json();

    const rolesMap = new Map((Array.isArray(roles) ? roles : []).map((r: any) => [r.id, r]));
    const permsByRole = new Map<string, string[]>();

    for (const rp of Array.isArray(rolePermissions) ? rolePermissions : []) {
      if (!permsByRole.has(rp.role_id)) permsByRole.set(rp.role_id, []);
      permsByRole.get(rp.role_id)!.push(rp.permission_key);
    }

    const result = (Array.isArray(roles) ? roles : []).map((role: any) => ({
      id: role.id,
      name: role.name,
      is_system: role.is_system,
      created_at: role.created_at,
      permissions: permsByRole.get(role.id) || [],
    }));

    return NextResponse.json({
      roles: result,
      permissions: Array.isArray(permissions) ? permissions : [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('staff.manage', ['admin', 'superadmin']);
    if (!auth.authenticated) return auth as any;

    const body = await request.json();
    const { role_id, permissions, action } = body;

    if (!role_id || !Array.isArray(permissions)) {
      return NextResponse.json({ error: 'role_id və permissions tələb olunur' }, { status: 400 });
    }

    const s = svc();

    if (action === 'create') {
      const { name, is_system } = body;
      if (!name) {
        return NextResponse.json({ error: 'Rol adı tələb olunur' }, { status: 400 });
      }

      const res = await fetch(`${s.url}/rest/v1/roles`, {
        method: 'POST',
        headers: { ...s.headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ name: name.trim(), is_system: is_system ?? false }),
      });

      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({ error: data?.error || 'Rol yaradıla bilmədi' }, { status: 400 });
      }

      const role = Array.isArray(data) ? data[0] : data;

      if (permissions.length > 0) {
        const inserts = permissions.map((permKey: string) => ({
          role_id: role.id,
          permission_key: permKey,
        }));

        await fetch(`${s.url}/rest/v1/role_permissions`, {
          method: 'POST',
          headers: { ...s.headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify(inserts),
        });
      }

      return NextResponse.json({ success: true, data: role });
    }

    const deleteRes = await fetch(`${s.url}/rest/v1/role_permissions?role_id=eq.${role_id}`, {
      method: 'DELETE',
      headers: s.headers,
    });

    if (!deleteRes.ok && deleteRes.status !== 204) {
      const errText = await deleteRes.text();
      return NextResponse.json({ error: errText || 'Permissionları silmək mümkün olmadı' }, { status: 400 });
    }

    if (permissions.length > 0) {
      const inserts = permissions.map((permKey: string) => ({
        role_id,
        permission_key: permKey,
      }));

      const insertRes = await fetch(`${s.url}/rest/v1/role_permissions`, {
        method: 'POST',
        headers: { ...s.headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify(inserts),
      });

      if (!insertRes.ok) {
        const errText = await insertRes.text();
        return NextResponse.json({ error: errText || 'Permissionlar əlavə edilə bilmədi' }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
