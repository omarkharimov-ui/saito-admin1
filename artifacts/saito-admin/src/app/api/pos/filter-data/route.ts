import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-auth';

// Product-grid filter tabs (Son / Məşur) data — was hardcoded UI only (the
// tabs rendered but never filtered). 'recent' = distinct products ordered in
// the last 24h (newest first); 'popular' = top 20 by quantity, last 7 days.
export async function GET() {
  const auth = await requirePermission('pos.use');
  if (!auth.authenticated) return auth;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  const headers = { 'apikey': key, Authorization: `Bearer ${key}` };

  try {
    const base = `${url}/rest/v1/order_items?select=id,quantity,created_at,order_id,products(id,name_az)`;
    const [recentRes, popularRes] = await Promise.all([
      fetch(`${base}&created_at=gte.${new Date(Date.now() - 24 * 3600 * 1000).toISOString()}&order=created_at.desc&limit=300`, { headers }),
      fetch(`${base}&created_at=gte.${new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()}&select=quantity,products(id,name_az)&limit=5000`, { headers }),
    ]);
    if (!recentRes.ok || !popularRes.ok) {
      return NextResponse.json({ recent: [], popular: [] });
    }
    const recentRows: any[] = await recentRes.json();
    const popularRows: any[] = await popularRes.json();

    // recent: distinct product ids, newest first (cap 30).
    const seen = new Set<string>();
    const recent: { id: string; name: string }[] = [];
    for (const r of recentRows) {
      const pid: string | undefined = r.products?.id;
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      recent.push({ id: pid, name: r.products?.name_az || '' });
      if (recent.length >= 30) break;
    }

    // popular: sum quantity per product, top 20.
    const byProduct = new Map<string, { id: string; name: string; qty: number }>();
    for (const r of popularRows) {
      const pid: string | undefined = r.products?.id;
      if (!pid) continue;
      const cur = byProduct.get(pid) || { id: pid, name: r.products?.name_az || '', qty: 0 };
      cur.qty += Number(r.quantity) || 0;
      byProduct.set(pid, cur);
    }
    const popular = [...byProduct.values()].sort((a, b) => b.qty - a.qty).slice(0, 20);

    return NextResponse.json({ recent, popular });
  } catch {
    return NextResponse.json({ recent: [], popular: [] });
  }
}
