import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function GET() {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      productsRes,
      categoriesRes,
      ordersRes,
      campaignsRes,
      settingsRes
    ] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/products?select=*,category:categories(*),variants:product_variants(*),modifiers:product_modifiers(*)&order=name`, {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }),
      fetch(`${SUPABASE_URL}/rest/v1/categories?select=*&order=name`, {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }),
      fetch(`${SUPABASE_URL}/rest/v1/orders?select=total_amount&status=eq.paid&created_at=gte.${todayStart.toISOString()}`, {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }),
      fetch(`${SUPABASE_URL}/rest/v1/campaigns?select=id&type=eq.HAPPY_HOUR&status=eq.active&limit=1`, {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }),
      fetch(`${SUPABASE_URL}/rest/v1/settings?select=opening_hours&limit=1`, {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }),
    ]);

    const [products, categories, orders, campaigns, settings] = await Promise.all([
      productsRes.json(),
      categoriesRes.json(),
      ordersRes.json(),
      campaignsRes.json(),
      settingsRes.json(),
    ]);

    const todayAov = orders && orders.length > 0
      ? orders.reduce((s: number, o: any) => s + (Number(o.total_amount) || 0), 0) / orders.length
      : 0;

    return NextResponse.json({
      products: products || [],
      categories: categories || [],
      todayAov,
      isHappyHourActive: Boolean(campaigns && campaigns.length > 0),
      openingHours: settings?.[0]?.opening_hours || null,
    });

  } catch (error: any) {
    console.error('[Dashboard API] Error:', error);
    return NextResponse.json(
      { error: 'API xətası: ' + (error.message || 'Unknown error') },
      { status: 500 }
    );
  }
}
